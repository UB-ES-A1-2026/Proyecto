// Fotos de los objetos en la BD (tabla foto_objeto, #9). Solo se guarda la clave del fichero.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026
import { prisma } from './prisma.js';

export function findItemForPhotos(itemId: string) {
  return prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, ownerId: true, status: true },
  });
}

export function findItemPhotos(itemId: string) {
  return prisma.itemPhoto.findMany({
    where: { itemId },
    orderBy: { order: 'asc' },
  });
}

// Fotos de varios objetos a la vez, para no hacer una consulta por cada resultado de la búsqueda.
export function findPhotosOfItems(itemIds: string[]) {
  return prisma.itemPhoto.findMany({
    where: { itemId: { in: itemIds } },
    orderBy: { order: 'asc' },
    select: { itemId: true, key: true },
  });
}

export function findPhotoByKey(key: string) {
  return prisma.itemPhoto.findUnique({ where: { key } });
}

export function createItemPhoto(data: {
  itemId: string;
  key: string;
  order: number;
}) {
  return prisma.itemPhoto.create({ data });
}
