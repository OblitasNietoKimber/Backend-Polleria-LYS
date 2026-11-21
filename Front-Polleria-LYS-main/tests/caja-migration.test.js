import { beforeAll, beforeEach, afterAll, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
const db = new PGlite();
const user = '00000000-0000-0000-0000-000000000071';
let migration;
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,profile jsonb NOT NULL DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;`);
  const root = new URL('../../insforge/migrations/', import.meta.url), pending = [];
  for (const name of (await readdir(root)).filter(n => n.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, root), 'utf8');
    await db.exec(sql);
  }
  pending.push(await readFile(new URL('../../migrations/20261016194047_caja-pagos.sql', import.meta.url), 'utf8'));
  migration = pending.join('\n');
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [user]);
  await db.query("UPDATE perfiles SET rol='mesera' WHERE id=$1", [user]);
}, 30000);
beforeEach(() => db.exec('TRUNCATE pedidos CASCADE'));
afterAll(() => db.close());
async function legacy() {
  const id = (await db.query("INSERT INTO pedidos(mesa_id,creado_por,tipo,total) VALUES (1,$1,'salon',0) RETURNING id", [user])).rows[0].id;
  await db.query('INSERT INTO detalles_pedido(pedido_id,producto_id,cantidad,precio_unitario) VALUES ($1,1,1,42.9)', [id]);
  return id;
}
async function oldPayment(id, amount = 42.9) {
  await db.query("INSERT INTO pagos(pedido_id,registrado_por,monto,metodo) VALUES ($1,$2,$3,'efectivo')", [id,user,amount]);
}
async function applyAndRollback(check = () => {}) {
  await db.exec('BEGIN');
  try { await db.exec(migration); await check(); } finally { await db.exec('ROLLBACK'); }
}
async function unchanged(id, payments) {
  expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='pedidos' AND column_name='estado_pago'")).rows).toHaveLength(0);
  expect((await db.query('SELECT * FROM pagos WHERE pedido_id=$1', [id])).rows).toHaveLength(payments);
  expect(Number((await db.query('SELECT total FROM pedidos WHERE id=$1', [id])).rows[0].total)).toBe(42.9);
}
test('detiene la migración con pagos duplicados y conserva las cuentas originales', async () => {
  const id = await legacy(); await oldPayment(id); await oldPayment(id);
  await expect(applyAndRollback()).rejects.toThrow(/pagos múltiples/); await unchanged(id, 2);
});
test('detiene la migración si un pago anterior no liquida el total', async () => {
  const id = await legacy(); await oldPayment(id, 10);
  await expect(applyAndRollback()).rejects.toThrow(/no corresponden/); await unchanged(id, 1);
});
test('detiene la migración ante mesas históricas cerradas sin pago', async () => {
  const id = await legacy(); await db.query("UPDATE pedidos SET estado='entregado' WHERE id=$1", [id]);
  await expect(applyAndRollback()).rejects.toThrow(/mesas cerradas/); await unchanged(id, 0);
});
test('conserva los pagos históricos válidos y los marca como liquidados', async () => {
  const id = await legacy(); await oldPayment(id);
  await applyAndRollback(async () => {
    expect((await db.query('SELECT estado_pago FROM pedidos WHERE id=$1', [id])).rows[0].estado_pago).toBe('pagado');
    const pago = (await db.query('SELECT monto,recibido,vuelto FROM pagos WHERE pedido_id=$1', [id])).rows[0];
    expect(Number(pago.monto)).toBe(42.9); expect(Number(pago.recibido)).toBe(42.9); expect(Number(pago.vuelto)).toBe(0);
  });
  await unchanged(id, 1);
});
