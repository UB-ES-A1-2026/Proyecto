// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 12/11/2026
import { AppError } from '../errors/appError.js';
import {
  findItemForDemand,
  findOccupiedDates,
  findPendingRequestDates,
} from '../repositories/itemDemandRepository.js';
import { OCCUPYING_STATUSES } from './reservationService.js';

export const ITEM_NOT_FOUND_MESSAGE = 'No hemos encontrado este objeto.';
export const TO_BEFORE_FROM_MESSAGE =
  'La fecha final no puede ser anterior a la fecha inicial.';
export const RANGE_TOO_LONG_MESSAGE =
  'El rango de fechas es demasiado largo: como máximo, un año.';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

export type DayDemand = { date: string; pendingRequests: number };
// bookedDays: días ya ocupados por una reserva aceptada, pagada o en curso (#312). No cuentan
// en days ni en pendingRequests: ahí ya no se puede alquilar.
export type ItemDemand = {
  days: DayDemand[];
  pendingRequests: number;
  bookedDays: string[];
};

function toUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Demanda de un objeto entre dos fechas (US-04.07, #303): cuántas solicitudes pendientes de
// otras personas incluyen cada día y cuántas tocan el rango. Una solicitud de 3 días cuenta
// en cada uno de sus días, pero solo una vez en el total del rango.
// Los días ya reservados salen aparte en bookedDays y no cuentan como demanda (#312).
export async function getItemDemand(
  itemId: string,
  input: { from: string; to: string },
  viewerId: string,
): Promise<ItemDemand> {
  // Las fechas son «AAAA-MM-DD»: se pueden comparar como texto.
  if (input.to < input.from) {
    throw new AppError(400, TO_BEFORE_FROM_MESSAGE, 'to');
  }

  const from = toUtcDate(input.from);
  const to = toUtcDate(input.to);

  if ((to.getTime() - from.getTime()) / MS_PER_DAY + 1 > MAX_RANGE_DAYS) {
    throw new AppError(400, RANGE_TOO_LONG_MESSAGE, 'to');
  }

  // Como la ficha (US-03.03): un objeto pausado o retirado solo lo ve su propietario.
  const item = await findItemForDemand(itemId);
  if (!item || (item.status !== 'published' && item.ownerId !== viewerId)) {
    throw new AppError(404, ITEM_NOT_FOUND_MESSAGE);
  }

  const [requests, occupied] = await Promise.all([
    findPendingRequestDates(itemId, from, to, viewerId),
    findOccupiedDates(itemId, from, to, OCCUPYING_STATUSES),
  ]);

  // Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
  const booked = new Set<string>();
  for (const range of occupied) {
    for (const date of daysInRange(range, from, to)) booked.add(date);
  }

  const counts = new Map<string, number>();
  let pendingRequests = 0;
  for (const range of requests) {
    // Solo los días que caen dentro del rango pedido y que no están ya reservados.
    const free = daysInRange(range, from, to).filter(
      (date) => !booked.has(date),
    );
    if (free.length > 0) pendingRequests += 1;
    for (const date of free) counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  const days = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, pendingRequests: count }));

  return { days, pendingRequests, bookedDays: [...booked].sort() };
}

// Días «AAAA-MM-DD» de [startDate, endDate] recortados al rango pedido [from, to].
function daysInRange(
  { startDate, endDate }: { startDate: Date; endDate: Date },
  from: Date,
  to: Date,
): string[] {
  const first = Math.max(startDate.getTime(), from.getTime());
  const last = Math.min(endDate.getTime(), to.getTime());
  const dates: string[] = [];
  for (let time = first; time <= last; time += MS_PER_DAY) {
    dates.push(toDateKey(new Date(time)));
  }
  return dates;
}
