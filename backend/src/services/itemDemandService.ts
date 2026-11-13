// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 12/11/2026
import { AppError } from '../errors/appError.js';
import {
  findItemForDemand,
  findPendingRequestDates,
} from '../repositories/itemDemandRepository.js';

export const ITEM_NOT_FOUND_MESSAGE = 'No hemos encontrado este objeto.';
export const TO_BEFORE_FROM_MESSAGE =
  'La fecha final no puede ser anterior a la fecha inicial.';
export const RANGE_TOO_LONG_MESSAGE =
  'El rango de fechas es demasiado largo: como máximo, un año.';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

export type DayDemand = { date: string; pendingRequests: number };
export type ItemDemand = { days: DayDemand[]; pendingRequests: number };

function toUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Demanda de un objeto entre dos fechas (US-04.07, #303): cuántas solicitudes pendientes de
// otras personas incluyen cada día y cuántas tocan el rango. Una solicitud de 3 días cuenta
// en cada uno de sus días, pero solo una vez en el total del rango.
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

  const requests = await findPendingRequestDates(itemId, from, to, viewerId);

  const counts = new Map<string, number>();
  for (const { startDate, endDate } of requests) {
    // Solo los días que caen dentro del rango pedido.
    const first = Math.max(startDate.getTime(), from.getTime());
    const last = Math.min(endDate.getTime(), to.getTime());

    for (let time = first; time <= last; time += MS_PER_DAY) {
      const date = toDateKey(new Date(time));
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }

  const days = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, pendingRequests]) => ({ date, pendingRequests }));

  return { days, pendingRequests: requests.length };
}
