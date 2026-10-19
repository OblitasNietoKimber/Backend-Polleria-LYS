import { beforeEach, expect, test, vi } from 'vitest'

const fake = vi.hoisted(() => ({ rpc: vi.fn(), user: vi.fn() }))
vi.mock('../src/lib/insforge', () => ({
  requireInsforge: () => ({ database: { rpc: fake.rpc } }),
}))
vi.mock('../src/services/authService', () => ({
  getCurrentUser: fake.user,
}))

import mesaService from '../src/services/mesaService'

test('liberarMesa propaga el rechazo del servidor y conserva el pedido pendiente en la vista', async () => {
  const ocupada = { id: 1, numero: '01', capacidad: 2, estado: 'ocupada', pedido_id: 'pedido-pendiente', total: 42.9 };
  fake.rpc.mockResolvedValue({ data: [ocupada] });
  await mesaService.fetchMesas();
  fake.rpc.mockResolvedValueOnce({ error: { message: 'La mesa tiene un pedido pendiente de pago' } });
  await expect(mesaService.liberarMesa('01')).rejects.toThrow('pendiente de pago');
  expect(mesaService.getMesaByNumero('01')).toMatchObject({ estado: 'ocupada', pedidoId: 'pedido-pendiente' });
});

test('liberarMesa confirma la RPC y vuelve a consultar el estado persistido', async () => {
  fake.rpc.mockResolvedValueOnce({ data: [{ id: 1, numero: '01', estado: 'ocupada', capacidad: 2 }] });
  await mesaService.fetchMesas();
  fake.rpc.mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: [{ id: 1, numero: '01', estado: 'libre', capacidad: 2 }] });
  const mesa = await mesaService.liberarMesa('01');
  expect(fake.rpc).toHaveBeenCalledWith('liberar_mesa_salon', { p_mesa_id: 1 });
  expect(fake.rpc).toHaveBeenCalledWith('obtener_mesas_con_pedidos');
  expect(mesa.estado).toBe('libre');
});

beforeEach(() => {
  fake.rpc.mockReset()
  fake.user.mockReturnValue({ id: 'mesera-1', rol: 'mesera' })
})

test('fetchMesas consulta obtener_mesas_con_pedidos y mapea los datos correctamente', async () => {
  fake.rpc.mockResolvedValue({
    data: [
      {
        id: 1,
        numero: '01',
        capacidad: 2,
        forma: 'redonda',
        zona: 'salon_principal',
        estado: 'ocupada',
        pedido_id: '10000000-0000-0000-0000-000000000001',
        pedido_estado: 'pendiente',
        cuenta_solicitada: false,
        comensales: 2,
        subtotal: 42.9,
        total: 42.9,
        notas: 'Mesa rápida',
        creado_en: '2026-10-16T12:00:00Z',
        items: [
          { producto_id: 1, nombre: 'Pollo a la brasa entero', cantidad: 1, precio: 42.9, subtotal: 42.9 },
        ],
      },
    ],
  })

  const mesas = await mesaService.fetchMesas()
  expect(fake.rpc).toHaveBeenCalledWith('obtener_mesas_con_pedidos')
  expect(mesas).toHaveLength(1)
  expect(mesas[0]).toMatchObject({
    id: 1,
    numero: '01',
    estado: 'ocupada',
    pedidoId: '10000000-0000-0000-0000-000000000001',
    estadoCocina: 'nuevo',
    totalAcumulado: 42.9,
    comensales: 2,
    notas: 'Mesa rápida',
  })
  expect(mesas[0].items[0]).toMatchObject({
    id: 1,
    nombre: 'Pollo a la brasa entero',
    cantidad: 1,
  })
})

test('abrirPedidoSalon llama a la RPC abrir_pedido_salon con parámetros requeridos', async () => {
  fake.rpc.mockResolvedValue({ data: '10000000-0000-0000-0000-000000000002' })

  const pedidoId = await mesaService.abrirPedidoSalon({
    mesaId: 2,
    mesaNumero: '02',
    comensales: 4,
    notas: 'Sin sal',
    items: [{ id: 1, cantidad: 1 }],
  })

  expect(pedidoId).toBe('10000000-0000-0000-0000-000000000002')
  expect(fake.rpc).toHaveBeenCalledWith('abrir_pedido_salon', {
    solicitud_id: null,
    p_mesa_id: 2,
    p_comensales: 4,
    p_notas: 'Sin sal',
    p_articulos: [{ id: 1, qty: 1 }],
  })
})

test('modificarPedidoSalon llama a agregar_o_modificar_detalles_salon', async () => {
  fake.rpc.mockResolvedValue({ data: true })

  const ok = await mesaService.modificarPedidoSalon({
    pedidoId: '10000000-0000-0000-0000-000000000002',
    items: [{ id: 1, cantidad: 2 }],
    notas: 'Actualizado',
  })

  expect(ok).toBe(true)
  expect(fake.rpc).toHaveBeenCalledWith('agregar_o_modificar_detalles_salon', {
    p_pedido_id: '10000000-0000-0000-0000-000000000002',
    p_articulos: [{ id: 1, qty: 2 }],
    p_notas: 'Actualizado',
  })
})

test('enviarPedidoCocina llama a enviar_pedido_cocina', async () => {
  fake.rpc.mockResolvedValue({ data: true })

  const ok = await mesaService.enviarPedidoCocina('10000000-0000-0000-0000-000000000002')

  expect(ok).toBe(true)
  expect(fake.rpc).toHaveBeenCalledWith('enviar_pedido_cocina', {
    p_pedido_id: '10000000-0000-0000-0000-000000000002',
  })
})

test('solicitarCuenta llama a solicitar_cuenta_salon', async () => {
  fake.rpc.mockResolvedValue({ data: true })

  const ok = await mesaService.solicitarCuenta('10000000-0000-0000-0000-000000000002', '02')

  expect(ok).toBe(true)
  expect(fake.rpc).toHaveBeenCalledWith('solicitar_cuenta_salon', {
    p_pedido_id: '10000000-0000-0000-0000-000000000002',
  })
})

test('gestiona errores de RPC rechazando la promesa', async () => {
  fake.rpc.mockResolvedValue({ error: { message: 'La mesa ya tiene un pedido activo' } })

  await expect(
    mesaService.abrirPedidoSalon({
      mesaId: 2,
      comensales: 4,
    })
  ).rejects.toThrow('La mesa ya tiene un pedido activo')
})

test('liberarMesa llama a la RPC liberar_mesa_salon y refresca el estado', async () => {
  fake.rpc.mockImplementation(async (method) => {
    if (method === 'liberar_mesa_salon') return { data: true }
    if (method === 'obtener_mesas_con_pedidos') return { data: [{ id: 1, numero: '01', estado: 'libre' }] }
    if (method === 'obtener_actividad_salon') return { data: [] }
    return { data: null }
  })

  await mesaService.liberarMesa('01')
  expect(fake.rpc).toHaveBeenCalledWith('liberar_mesa_salon', { p_mesa_id: 1 })
})

test('anularComandaYLiberarMesa llama a la RPC anular_comanda_salon con el motivo y refresca el estado', async () => {
  fake.rpc.mockImplementation(async (method) => {
    if (method === 'anular_comanda_salon') return { data: true }
    if (method === 'obtener_mesas_con_pedidos') return { data: [{ id: 1, numero: '01', estado: 'libre' }] }
    if (method === 'obtener_actividad_salon') return { data: [] }
    return { data: null }
  })

  await mesaService.anularComandaYLiberarMesa('01', 'Cliente se retiró sin pagar')
  expect(fake.rpc).toHaveBeenCalledWith('anular_comanda_salon', {
    p_mesa_id: 1,
    p_motivo: 'Cliente se retiró sin pagar',
  })
})

test('fetchActividades ordena de manera estrictamente descendente', async () => {
  fake.rpc.mockResolvedValue({
    data: [
      { id: '1', titulo: 'Antiguo', createdAt: '2026-10-18T10:00:00Z' },
      { id: '2', titulo: 'Nuevo', createdAt: '2026-10-18T12:00:00Z' },
    ],
  })

  const acts = await mesaService.fetchActividades()
  expect(acts[0].id).toBe('2')
  expect(acts[1].id).toBe('1')
})

test('la vista estricta propaga el fallo de PostgreSQL sin presentar la caché como datos nuevos', async () => {
  fake.rpc.mockResolvedValueOnce({ error: { message: 'Conexión interrumpida' } })
  await expect(mesaService.fetchMesas({ strict: true })).rejects.toThrow('Conexión interrumpida')
})

test('una respuesta vacía del servidor elimina la mesa antigua de la caché', async () => {
  fake.rpc
    .mockResolvedValueOnce({ data: [{ id: 1, numero: '01', estado: 'ocupada', capacidad: 2 }] })
    .mockResolvedValueOnce({ data: [] })
  await mesaService.fetchMesas()
  await mesaService.fetchMesas({ strict: true })
  expect(mesaService.getMesas()).toEqual([])
})
