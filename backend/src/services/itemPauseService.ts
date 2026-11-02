// Generado con asistencia de IA (Claude)
import type { ItemStatus } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  changeItemStatus,
  findItemOwner,
  findItemSummary,
} from '../repositories/itemPauseRepository.js';

export const ITEM_NOT_FOUND_MESSAGE = 'No hemos encontrado este objeto.';
export const NOT_OWNER_MESSAGE =
  'Solo el propietario puede cambiar el estado de este objeto.';
export const ONLY_PUBLISHED_MESSAGE =
  'Solo se puede pausar un objeto publicado.';
export const ONLY_PAUSED_MESSAGE = 'Solo se puede reanudar un objeto pausado.';

export interface ItemSummary {
  id: string;
  title: string;
  dailyPrice: string;
  neighborhood: string;
  status: ItemStatus;
}

async function transition(
  itemId: string,
  userId: string,
  from: ItemStatus,
  to: ItemStatus,
  conflictMessage: string,
): Promise<ItemSummary> {
  const item = await findItemOwner(itemId);

  if (!item) {
    throw new AppError(404, ITEM_NOT_FOUND_MESSAGE);
  }

  if (item.ownerId !== userId) {
    throw new AppError(403, NOT_OWNER_MESSAGE);
  }

  if (!(await changeItemStatus(itemId, from, to))) {
    throw new AppError(409, conflictMessage);
  }

  const summary = await findItemSummary(itemId);

  return { ...summary, dailyPrice: summary.dailyPrice.toFixed(2) };
}

// US-02.04 (#112). Un objeto pausado no sale en la búsqueda (#114) ni admite solicitudes nuevas
// (#120); las reservas que ya tenía no cambian.
export function pauseItem(itemId: string, userId: string) {
  return transition(
    itemId,
    userId,
    'published',
    'paused',
    ONLY_PUBLISHED_MESSAGE,
  );
}

export function resumeItem(itemId: string, userId: string) {
  return transition(itemId, userId, 'paused', 'published', ONLY_PAUSED_MESSAGE);
}
