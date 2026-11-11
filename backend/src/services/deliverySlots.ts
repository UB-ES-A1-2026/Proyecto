// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Franjas de entrega del rider (US-05.01, #281): de 2 h, de 9:00 a 21:00, el día de inicio.
export const ASAP_SLOT = 'asap';

export const DELIVERY_SLOTS: readonly string[] = [
  '09:00-11:00',
  '11:00-13:00',
  '13:00-15:00',
  '15:00-17:00',
  '17:00-19:00',
  '19:00-21:00',
];

// Minutos desde medianoche en España: el servidor está en UTC.
function minutesNowInSpain(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);

  return part('hour') * 60 + part('minute');
}

function slotStartMinutes(slot: string): number {
  const [hours = '0', minutes = '0'] = slot.slice(0, 5).split(':');
  return Number(hours) * 60 + Number(minutes);
}

// Franjas que se pueden elegir. Si el alquiler empieza hoy (en España; quien llama lo calcula con
// todayInSpain), no se ofrecen las que ya han empezado.
export function availableSlots(
  startsToday: boolean,
  now: Date = new Date(),
): string[] {
  if (!startsToday) {
    return [...DELIVERY_SLOTS];
  }

  const minutesNow = minutesNowInSpain(now);
  return DELIVERY_SLOTS.filter((slot) => slotStartMinutes(slot) > minutesNow);
}
