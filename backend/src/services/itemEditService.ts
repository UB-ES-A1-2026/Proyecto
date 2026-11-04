// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026
import type { ItemStatus } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  findItemOwnerAndStatus,
  findItemsByOwner,
  updateItemById,
} from '../repositories/itemEditRepository.js';
import { toItemDetail, type ItemDetail } from './itemDetail.js';
import { listFirstPhotoUrls, listItemPhotos } from './photoService.js';

export const ITEM_NOT_FOUND_MESSAGE = 'No hemos encontrado este objeto.';
export const NOT_OWNER_MESSAGE =
  'Solo el propietario puede editar este objeto.';
export const WITHDRAWN_MESSAGE = 'No se puede editar un objeto retirado.';

export interface MyItem {
  id: string;
  title: string;
  dailyPrice: string;
  neighborhood: string;
  status: ItemStatus;
  // URL de la primera foto, o null si no tiene.
  photo: string | null;
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
  const photos = await listFirstPhotoUrls(items.map((item) => item.id));

  return items.map((item) => ({
    ...item,
    dailyPrice: item.dailyPrice.toFixed(2),
    photo: photos.get(item.id) ?? null,
  }));
}

// Editar un objeto (US-02.02, #108): solo su propietario. Retirar es definitivo (#110), así que
// un objeto retirado ya no se puede editar; uno pausado, sí.
export async function updateItem(
  itemId: string,
  userId: string,
  changes: ItemChanges,
): Promise<ItemDetail> {
  const item = await findItemOwnerAndStatus(itemId);

  if (!item) {
    throw new AppError(404, ITEM_NOT_FOUND_MESSAGE);
  }

  if (item.ownerId !== userId) {
    throw new AppError(403, NOT_OWNER_MESSAGE);
  }

  if (item.status === 'withdrawn') {
    throw new AppError(409, WITHDRAWN_MESSAGE);
  }

  const updated = await updateItemById(itemId, changes);

  const photos = await listItemPhotos(itemId);

  return toItemDetail(
    updated,
    photos.map(({ id, url }) => ({ id, url })),
  );
}
