import { beforeEach, expect, test, vi } from 'vitest'
const fake = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), user: vi.fn() }))
vi.mock('../src/lib/insforge', () => ({ requireInsforge: () => ({ database: { from: fake.from, rpc: fake.rpc } }) }))
vi.mock('../src/services/authService', () => ({ getCurrentUser: fake.user }))
import orders, { ORDER_PAGE_SIZE } from '../src/services/orderService'
let calls, responses
const saved = { id: '10000000-0000-0000-0000-000000000099', tipo: 'delivery', estado: 'pendiente',
  subtotal: '80.00', envio: '6.00', total: '86.00', destinatario: { name: 'Cliente' },
  detalles_pedido: [{ producto_id: 1, nombre_producto: 'Nombre vendido', precio_unitario: '40.00', cantidad: 2 }] }
beforeEach(() => {
  calls = []; responses = []
  fake.user.mockReturnValue({ id: 'cliente-a', rol: 'cliente' })
  fake.rpc.mockReset()
  fake.from.mockImplementation(table => {
    const call = { table, filters: [], orders: [] }; calls.push(call)
    const query = {
      select: columns => { call.columns = columns; return query },
      eq: (column, value) => { call.filters.push([column, value]); return query },
      lt: (column, value) => { call.before = [column, value]; return query },
      order: (column, options) => { call.orders.push([column, options]); return query },
      range: (from, to) => { call.range = [from, to]; return query },
      limit: value => { call.limit = value; return query },
      maybeSingle: () => Promise.resolve(responses.shift()),
      then: (resolve, reject) => Promise.resolve(responses.shift()).then(resolve, reject),
    }
    return query
  })
})
test('consulta importes y nombres confirmados, sin recalcular con datos del catálogo', async () => {
  responses.push({ data: [saved] })
  expect(await orders.getOrders()).toEqual([expect.objectContaining({ id: saved.id, subtotal: 80, shipping: 6, total: 86,
    items: [{ id: 1, name: 'Nombre vendido', price: 40, qty: 2 }] })])
  expect(calls[0].filters).toContainEqual(['cliente_id', 'cliente-a'])
  expect(calls[0].columns).not.toContain('*')
})
test('pagina pedidos con orden estable por fecha y UUID', async () => {
  responses.push({ data: [] })
  await orders.getOrders({ page: 2 })
  expect(calls[0].range).toEqual([2 * ORDER_PAGE_SIZE, 3 * ORDER_PAGE_SIZE - 1])
  expect(calls[0].orders.map(([column]) => column)).toEqual(['creado_en', 'id'])
  await expect(orders.getOrders({ page: -1 })).rejects.toThrow('Página inválida')
})
test('filtra el detalle por UUID y propietario; respeta ausencia y errores', async () => {
  responses.push({ data: null }, { error: { message: 'Sin conexión' } })
  expect(await orders.getOrderById(saved.id)).toBeNull()
  expect(calls[0].filters).toEqual([['id', saved.id], ['cliente_id', 'cliente-a']])
  await expect(orders.getOrderById(saved.id)).rejects.toThrow('Sin conexión')
})
test('consulta solo estado para refrescar y limita las páginas de historial', async () => {
  responses.push({ data: { estado: 'listo' } }, { data: [] })
  expect(await orders.getOrderState(saved.id)).toEqual({ estado: 'listo' })
  await orders.getOrderHistory(saved.id, { before: 101 })
  expect(calls[0].columns).toBe('estado')
  expect(calls[1]).toMatchObject({ table: 'historial_estados_pedido', limit: 50, before: ['id', 101] })
  expect(calls[1].columns).not.toContain('cambiado_por')
})
test('mantiene el contrato RPC y consulta el pedido guardado antes de confirmar', async () => {
  fake.rpc.mockResolvedValue({ data: saved.id }); responses.push({ data: saved })
  const result = await orders.createOrder({ id: saved.id, items: [{ product: { id: 1, price: 0, name: 'Falso' }, qty: 2 }],
    deliveryType: 'delivery', form: { name: 'Cliente' }, payment: 'efectivo', total: 0, cliente_id: 'ajeno' })
  expect(fake.rpc).toHaveBeenCalledWith('crear_pedido_cliente', { solicitud_id: saved.id, tipo_entrega: 'delivery',
    articulos: [{ id: 1, qty: 2 }], datos_entrega: { name: 'Cliente' }, metodo: 'efectivo' })
  expect(result.total).toBe(86)
})
test('no confirma si falla el guardado o la lectura posterior', async () => {
  fake.rpc.mockResolvedValueOnce({ error: { message: 'Producto agotado' } }).mockResolvedValueOnce({ data: saved.id })
  const payload = { id: saved.id, items: [], form: {}, payment: 'efectivo' }
  await expect(orders.createOrder(payload)).rejects.toThrow('Producto agotado')
  responses.push({ data: null })
  await expect(orders.createOrder(payload)).rejects.toThrow('misma solicitud')
})
test.each([null, { id: 'personal', rol: 'cocina' }])('requiere un cliente autenticado para las operaciones de cliente: %j', async user => {
  fake.user.mockReturnValue(user)
  await expect(orders.getOrders()).rejects.toThrow()
  await expect(orders.getOrderHistory(saved.id)).rejects.toThrow()
  expect(calls).toEqual([])
})
test('conserva los estados del esquema actual y distingue cancelaciones', () => {
  expect(orders.getOrderStatus({ backendStatus: 'en_preparacion' })).toBe('preparacion')
  expect(orders.getOrderStatus({ backendStatus: 'cancelado' })).toBe('cancelado')
})
