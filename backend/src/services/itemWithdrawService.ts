// Generado con asistencia de IA (Claude)
import type { ItemStatus, ReservationStatus } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  findItemOwnerAndStatus,
  findWithdrawnItemSummary,
  withdrawItemIfNoActiveReservations,
} from '../repositories/itemWithdrawRepository.js';

export const ITEM_NOT_FOUND_MESSAGE = 'No hemos encontrado este objeto.';
export const NOT_OWNER_MESSAGE =
  'Solo el propietario puede retirar este objeto.';
export const ACTIVE_RESERVATIONS_MESSAGE =
  'No puedes retirar un objeto con reservas activas.';
export const ALREADY_WITHDRAWN_MESSAGE = 'Este objeto ya está retirado.';

// Las solicitudes pendientes también bloquean: el propietario tiene que rechazarlas antes, para
// que ninguna se quede sin respuesta (decisión en #110). No confundir con los estados que
// ocupan fechas al solicitar un alquiler (#120), donde las pendientes no cuentan.
export const ACTIVE_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  'pending',
  'accepted',
  'paid',
  'in_progress',
];

export interface WithdrawnItem {
  id: string;
  title: string;
  dailyPrice: string;
  neighborhood: string;
  status: ItemStatus;
}

// Retirar un objeto (US-02.03, #110): no se borra, pasa a «retirado». Deja de verse para los
// demás y sigue en «Mis objetos».
export async function withdrawItem(
  itemId: string,
  userId: string,
): Promise<WithdrawnItem> {
  const item = await findItemOwnerAndStatus(itemId);

  if (!item) {
    throw new AppError(404, ITEM_NOT_FOUND_MESSAGE);
  }

  if (item.ownerId !== userId) {
    throw new AppError(403, NOT_OWNER_MESSAGE);
  }

  if (item.status === 'withdrawn') {
    throw new AppError(409, ALREADY_WITHDRAWN_MESSAGE);
  }

  const withdrawn = await withdrawItemIfNoActiveReservations(
    itemId,
    ACTIVE_RESERVATION_STATUSES,
  );

  if (!withdrawn) {
    throw new AppError(409, ACTIVE_RESERVATIONS_MESSAGE);
  }

  const summary = await findWithdrawnItemSummary(itemId);

  return { ...summary, dailyPrice: summary.dailyPrice.toFixed(2) };
}
