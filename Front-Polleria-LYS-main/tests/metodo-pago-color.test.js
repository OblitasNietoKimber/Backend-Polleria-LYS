import { expect, test } from 'vitest';
import { COLORES_METODO, obtenerColorMetodo } from '../src/utils/metodoPagoColor';

test('cada método de pago tiene un color propio', () => {
  expect(new Set(Object.values(COLORES_METODO)).size).toBe(4);
  expect(obtenerColorMetodo('Yape')).toBe(COLORES_METODO.yape);
  expect(obtenerColorMetodo('plin')).toBe(COLORES_METODO.plin);
  expect(obtenerColorMetodo('Tarjeta')).toBe(COLORES_METODO.tarjeta);
  expect(obtenerColorMetodo(' EFECTIVO ')).toBe(COLORES_METODO.efectivo);
});

test('un método desconocido usa un gris neutro distinto de los cuatro', () => {
  expect(Object.values(COLORES_METODO)).not.toContain(obtenerColorMetodo('Sin metodo'));
});
