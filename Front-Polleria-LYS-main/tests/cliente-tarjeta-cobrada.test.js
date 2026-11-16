import { afterAll, beforeAll, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { asLocalUser, createLocalDatabase, localUsers } from '../scripts/local-db.mjs';

let db;
const cliente = localUsers.find(user => user.rol === 'cliente');
const pedido = () => ({
  solicitud: randomUUID(),
  operacion: randomUUID(),
  tipo: 'delivery',
  articulos: [{ id: 1, qty: 1 }],
  entrega: { name: 'Cliente local', phone: '987654321', address: 'Av. Prueba 123' },
});
async function crearConTarjeta(datos) {
  return asLocalUser(db, cliente, tx => tx.query(
    'SELECT public.crear_pedido_cliente_tarjeta($1,$2,$3::jsonb,$4::jsonb,$5,$6) AS id',
    [datos.solicitud, datos.tipo, JSON.stringify(datos.articulos), JSON.stringify(datos.entrega), 'pi_prueba_123', datos.operacion],
  ));
}

beforeAll(async () => { db = await createLocalDatabase(); }, 60000);
afterAll(async () => { await db?.close(); });

test('un delivery pagado con tarjeta llega a caja como cobrado y conserva su comprobante', async () => {
  const datos = pedido();
  const resultado = await crearConTarjeta(datos);
  const id = resultado.rows[0].id;
  const cuenta = (await db.query(
    'SELECT estado,estado_pago,total,metodo_solicitado FROM public.pedidos WHERE id=$1', [id],
  )).rows[0];
  const pago = (await db.query(
    'SELECT metodo,monto,recibido,vuelto,referencia,comprobante FROM public.pagos WHERE pedido_id=$1', [id],
  )).rows[0];

  expect(cuenta).toMatchObject({ estado: 'pendiente', estado_pago: 'pagado', metodo_solicitado: 'tarjeta' });
  expect(Number(pago.monto)).toBe(Number(cuenta.total));
  expect(Number(pago.recibido)).toBe(Number(cuenta.total));
  expect(pago).toMatchObject({ metodo: 'tarjeta', referencia: 'pi_prueba_123' });
  expect(Number(pago.vuelto)).toBe(0);
  expect(pago.comprobante).toMatchObject({ id, estado: 'pagado', pago: { metodo: 'tarjeta' } });
});

test('reintentar la misma solicitud no duplica el pago', async () => {
  const datos = pedido();
  const primero = (await crearConTarjeta(datos)).rows[0].id;
  const segundo = (await crearConTarjeta(datos)).rows[0].id;
  expect(segundo).toBe(primero);
  expect((await db.query('SELECT id FROM public.pagos WHERE pedido_id=$1', [primero])).rows).toHaveLength(1);
});
