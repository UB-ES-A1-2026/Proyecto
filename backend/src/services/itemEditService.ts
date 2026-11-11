// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026
import type { ItemStatus } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  findItemOwnerAndStatus,
  findItemsByOwner,
  updateItemById,
} from '../repositories/itemEditRepository.js';
import { assertValidDeliverySettings } from './itemDelivery.js';
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
  // Solo se devuelve en «Mis objetos», que ve únicamente su propietario (US-05.01, #281).
  address: string | null;
  status: ItemStatus;
  // URL de la primera foto, o null si no tiene.
  photo: string | null;
}

export interface ItemChanges {
  title: string;
  description: string;
  dailyPrice: string;
  deposit: string;
  // Opcionales (US-05.01, #281): si no se envían, no cambian.
  homeDelivery?: boolean | undefined;
  riderDelivery?: boolean | undefined;
  pickupPointDelivery?: boolean | undefined;
  // null borra la dirección.
  address?: string | null | undefined;
  // Opcional: permite corregir los barrios escritos a mano de los objetos antiguos.
  neighborhood?: string | undefined;
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

  // Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
  // Si se tocan los modos de entrega o la dirección, valida cómo queda el objeto.
  const touchesDelivery =
    changes.homeDelivery !== undefined ||
    changes.riderDelivery !== undefined ||
    changes.pickupPointDelivery !== undefined ||
    changes.address !== undefined;
  if (touchesDelivery) {
    assertValidDeliverySettings({
      homeDelivery: changes.homeDelivery ?? item.homeDelivery,
      riderDelivery: changes.riderDelivery ?? item.riderDelivery,
      pickupPointDelivery:
        changes.pickupPointDelivery ?? item.pickupPointDelivery,
      address: changes.address === undefined ? item.address : changes.address,
    });
  }

  const updated = await updateItemById(itemId, changes);

  const photos = await listItemPhotos(itemId);

  return toItemDetail(
    updated,
    photos.map(({ id, url }) => ({ id, url })),
    true,
  );
}
