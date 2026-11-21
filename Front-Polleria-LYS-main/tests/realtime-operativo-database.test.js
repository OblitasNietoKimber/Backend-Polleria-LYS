import { afterAll, beforeAll, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { asLocalUser, createLocalDatabase, localUsers } from '../scripts/local-db.mjs';

let db;
const query = (role, sql, params) => asLocalUser(db, localUsers.find(user => user.rol === role), tx => tx.query(sql, params));
const cambiar = async (role, action, data) => (await query(role,
  'SELECT public.flujo_operar($1, $2) AS resultado', [action, { operacion: randomUUID(), ...data }],
)).rows[0].resultado;

beforeAll(async () => { db = await createLocalDatabase(undefined, { inventory: true }); }, 60000);
afterAll(async () => { await db?.close(); });

test('las reservas avisan a mesas aunque no exista ningún pedido', async () => {
  await db.exec('TRUNCATE realtime.messages');
  await cambiar('mesera', 'reservar', { mesa: 12, cliente: 'Reserva local', hora: '20:00', telefono: '987654321', comensales: 2 });
  const { rows } = await db.query("SELECT channel_name, event_name, payload FROM realtime.messages");
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(row => row.channel_name === 'lys:staff' && row.event_name === 'lys:mesa-actualizada')).toBe(true);
  expect(rows[0].payload).toEqual({});
});

test('mesas solo descarga cuentas abiertas del salón, y los cobros y entregas tienen avisos propios', async () => {
  await db.exec('TRUNCATE realtime.messages');
  const { pedido } = await cambiar('mesera', 'abrir', { mesa: 13, items: [{ id: 1, qty: 1 }] });
  const cliente = randomUUID();
  await query('cliente', 'SELECT public.crear_pedido_cliente($1,$2,$3,$4,$5)',
    [cliente, 'recojo', [{ id: 1, qty: 1 }], { name: 'Cliente local', phone: '987654321' }, 'efectivo']);

  const snapshot = async () => (await query('mesera', 'SELECT public.flujo_mesas() AS data')).rows[0].data;
  const version = async () => (await snapshot()).cuentas.find(cuenta => cuenta.id === pedido).version_cuenta;
  const data = await snapshot();
  expect(data.cuentas.map(cuenta => cuenta.id)).toContain(pedido);
  expect(data.cuentas.map(cuenta => cuenta.id)).not.toContain(cliente);
  expect(data.cuentas.find(cuenta => cuenta.id === pedido)).not.toHaveProperty('historial');
  await expect(query('cliente', 'SELECT public.flujo_mesas()')).rejects.toThrow(/restringido a mesas/);

  await cambiar('caja', 'cobrar', { pedido, version: await version(), metodo: 'efectivo', recibido: 100, anticipado: true });
  for (const accion of ['comenzar', 'listo', 'entregar']) await cambiar('cocina', accion, { pedido, version: await version() });

  const mensajes = (await db.query("SELECT event_name, payload FROM realtime.messages WHERE channel_name = 'lys:staff'")).rows;
  expect(mensajes).toEqual(expect.arrayContaining([
    { event_name: 'lys:pedido-actualizado', payload: { pedidoId: pedido, tipo: 'salon' } },
    { event_name: 'lys:pago-actualizado', payload: { pedidoId: pedido } },
    { event_name: 'lys:entrega-cocina-actualizada', payload: { pedidoId: pedido } },
  ]));
  const dia = (await db.query("SELECT (creado_en AT TIME ZONE 'America/Lima')::date::text AS dia FROM public.pagos WHERE pedido_id=$1", [pedido])).rows[0].dia;
  const resumen = (await query('caja', 'SELECT public.obtener_resumen_caja($1) AS data', [dia])).rows[0].data;
  expect(resumen).toMatchObject({ cobrados: 1, efectivo: resumen.ventas });
  expect(resumen.ventas).toBeGreaterThan(0);
  await expect(query('cliente', 'SELECT public.obtener_resumen_caja($1)', [dia])).rejects.toThrow(/restringido a caja/);
});

test('catálogo anónimo puede escuchar el stock sin recibir cantidades ni canales privados', async () => {
  await db.exec('TRUNCATE realtime.messages');
  await query('admin', 'SELECT public.ajustar_inventario($1,$2,$3,$4)', [1, 1, 'Verificación del evento', randomUUID()]);
  const { rows } = await db.query("SELECT event_name, payload FROM realtime.messages WHERE channel_name = 'lys:catalogo'");
  expect(rows).toEqual([{ event_name: 'lys:catalogo-actualizado', payload: { recurso: 'stock', inventarioId: expect.any(String) } }]);
  expect((await query('anon', 'SELECT pattern FROM realtime.channels')).rows).toEqual([{ pattern: 'lys:catalogo' }]);
});
