export const RESERVATION_FIRST_TIME = '12:00';
export const RESERVATION_LAST_TIME = '22:59';

const limaClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Lima',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
});

export function getReservationTimeError(time) {
  if (typeof time !== 'string' || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
    return 'Ingresa una hora válida para la reserva.';
  }
  if (time < RESERVATION_FIRST_TIME || time > RESERVATION_LAST_TIME) {
    return 'Elige una hora dentro del horario de atención, de 12:00 p. m. hasta antes de las 11:00 p. m.';
  }
  if (time <= limaClock.format(new Date())) {
    return 'Elige una hora posterior a la actual en Lima. Las reservas son para hoy.';
  }
  return null;
}
