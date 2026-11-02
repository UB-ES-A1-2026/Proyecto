// Generado con asistencia de IA (Claude)
import type { ItemStatus } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  findItemOwner,
  findItemsByOwner,
  updateItemById,
} from '../repositories/itemEditRepository.js';
import { toItemDetail, type ItemDetail } from './itemDetail.js';

export const ITEM_NOT_FOUND_MESSAGE = 'No hemos encontrado este objeto.';
export const NOT_OWNER_MESSAGE =
  'Solo el propietario puede editar este objeto.';

export interface MyItem {
  id: string;
  title: string;
  dailyPrice: string;
  neighborhood: string;
  status: ItemStatus;
}

export interface ItemChanges {
  title: string;
  description: string;
  dailyPrice: string;
  deposit: string;
}

// «Mis objetos» (US-02.02, #108): los del usuario, en cualquier estado.
export async function getMyItems(ownerId: string): Promise<MyItem[]> {
  const items = await findItemsByOwner(ownerId);

  return items.map((item) => ({
    ...item,
    dailyPrice: item.dailyPrice.toFixed(2),
  }));
}

// Editar un objeto (US-02.02, #108): solo su propietario.
export async function updateItem(
  itemId: string,
  userId: string,
  changes: ItemChanges,
): Promise<ItemDetail> {
  const item = await findItemOwner(itemId);

  if (!item) {
    throw new AppError(404, ITEM_NOT_FOUND_MESSAGE);
  }

  if (item.ownerId !== userId) {
    throw new AppError(403, NOT_OWNER_MESSAGE);
  }

  const updated = await updateItemById(itemId, changes);

  // Las fotos llegan con #106 (US-02.01): cuando esa historia esté en develop, aquí se
  // usarán las del objeto, como en el detalle (#119).
  return toItemDetail(updated, []);
}
