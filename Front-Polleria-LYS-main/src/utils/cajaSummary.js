const fechaPeru = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' });
export function fechaLima(fecha = new Date()) {
  const valor = new Date(fecha);
  return Number.isNaN(valor.getTime()) ? null : fechaPeru.format(valor);
}
const centimos = valor => Math.round(Number(valor) * 100);

export function calcularResumenCaja(pedidos, dia = fechaLima()) {
  let ventas = 0, efectivo = 0, cobrados = 0, porCobrar = 0;
  for (const pedido of pedidos) {
    if (pedido.estado === 'pendiente' && pedido.total > 0) porCobrar += centimos(pedido.total);
    // Elegir un método o finalizar la preparación no confirma un cobro.
    if (pedido.estado !== 'pagado' || !pedido.pago || !pedido.pagadoAt || fechaLima(pedido.pagadoAt) !== dia) continue;
    const importe = centimos(pedido.pago.importe ?? pedido.total);
    if (!Number.isFinite(importe) || importe <= 0) continue;
    ventas += importe;
    cobrados += 1;
    // importe ya excluye el vuelto: recibido = importe + vuelto.
    if (pedido.pago.metodoId === 'efectivo') efectivo += importe;
  }
  return { ventas: ventas / 100, efectivo: efectivo / 100, cobrados, porCobrar: porCobrar / 100 };
}
