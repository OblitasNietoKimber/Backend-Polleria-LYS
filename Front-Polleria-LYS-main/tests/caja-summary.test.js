import { expect, test } from 'vitest';
import { calcularResumenCaja, fechaLima } from '../src/utils/cajaSummary';
const pagado = (tipo, metodo, total = 70, fecha = '2026-11-15T02:00:00Z') => ({
  tipo, estado: 'pagado', total, pagadoAt: fecha,
  pago: { metodoId: metodo, importe: total, monto: metodo === 'efectivo' ? 100 : total, vuelto: metodo === 'efectivo' ? 100 - total : 0 },
});
test('todos los cobros suman a ventas; solo efectivo suma al efectivo, descontando el vuelto', () => {
  const pedidos = [pagado('salon','efectivo'), pagado('delivery','efectivo'), pagado('recojo','tarjeta'), pagado('delivery','yape'), pagado('salon','plin')];
  expect(calcularResumenCaja(pedidos, '2026-11-14')).toEqual({ventas:350, efectivo:140, cobrados:5, porCobrar:0});
});
test('delivery pendiente, cancelados y pagos sin confirmar no suman como cobrados', () => {
  const pedidos = [
    {...pagado('delivery','efectivo'),estado:'pendiente'},
    {...pagado('delivery','tarjeta'),estado:'pendiente'},
    {...pagado('salon','efectivo'),estado:'cancelado'},
    {...pagado('salon','efectivo'),pago:null},
    {...pagado('salon','efectivo'),pagadoAt:null},
  ];
  expect(calcularResumenCaja(pedidos,'2026-11-14')).toEqual({ventas:0,efectivo:0,cobrados:0,porCobrar:140});
});
test('usa el día del cobro en Perú incluso si el navegador está en otra zona horaria', () => {
  expect(fechaLima('2026-11-15T04:59:59Z')).toBe('2026-11-14');
  expect(fechaLima('2026-11-15T05:00:00Z')).toBe('2026-11-15');
  const pedidos = [pagado('delivery','efectivo',70,'2026-11-15T04:59:59Z'),pagado('delivery','tarjeta',90,'2026-11-15T05:00:00Z')];
  expect(calcularResumenCaja(pedidos,'2026-11-15')).toEqual({ventas:90,efectivo:0,cobrados:1,porCobrar:0});
});
test('suma en céntimos y no incorpora otros días al efectivo cobrado hoy', () => {
  const pedidos = [pagado('salon','efectivo',0.1),pagado('salon','efectivo',0.2),pagado('salon','efectivo',50,'2026-11-13T18:00:00Z')];
  expect(calcularResumenCaja(pedidos,'2026-11-14')).toEqual({ventas:0.3,efectivo:0.3,cobrados:2,porCobrar:0});
});
