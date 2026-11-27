// Fotos del estado del objeto en la BD (tabla foto_estado, US-09.02, #454). Solo se guarda la clave
// del fichero (ADR 0002).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 27/11/2026
import type { StatePhotoPhase } from '@prisma/client';
import { prisma } from './prisma.js';

export function findStatePhotos(reservationId: string, phase: StatePhotoPhase) {
  return prisma.statePhoto.findMany({
    where: { reservationId, phase },
    orderBy: { order: 'asc' },
  });
}

export function findAllStatePhotos(reservationId: string) {
  return prisma.statePhoto.findMany({
    where: { reservationId },
    orderBy: [{ phase: 'asc' }, { order: 'asc' }],
  });
}

export function findStatePhotoByKey(key: string) {
  return prisma.statePhoto.findUnique({ where: { key } });
}

export function createStatePhoto(data: {
  reservationId: string;
  uploadedById: string;
  phase: StatePhotoPhase;
  key: string;
  order: number;
}) {
  return prisma.statePhoto.create({ data });
}

// Quita una foto que aún no se ha confirmado. Devuelve su clave para borrarla del bucket, o null si
// no existe, es de otra reserva o fase, o ya está confirmada.
export async function deleteUnconfirmedStatePhoto(
  id: string,
  reservationId: string,
  phase: StatePhotoPhase,
): Promise<string | null> {
  const photo = await prisma.statePhoto.findFirst({
    where: { id, reservationId, phase, confirmedAt: null },
    select: { key: true },
  });
  if (!photo) return null;

  const { count } = await prisma.statePhoto.deleteMany({
    where: { id, confirmedAt: null },
  });
  return count === 1 ? photo.key : null;
}

// «Confirmar fotos»: marca todas las fotos de la fase a la vez. Solo cambia las que no estaban
// confirmadas, así que con un doble clic la segunda petición no cambia nada (devuelve 0).
export async function confirmStatePhotos(
  reservationId: string,
  phase: StatePhotoPhase,
  at: Date,
): Promise<number> {
  const { count } = await prisma.statePhoto.updateMany({
    where: { reservationId, phase, confirmedAt: null },
    data: { confirmedAt: at },
  });
  return count;
}

// Si la fase ya está confirmada: lo pide «Ya tengo el objeto» y la recogida del rider (US-09.02).
export async function hasConfirmedStatePhotos(
  reservationId: string,
  phase: StatePhotoPhase,
): Promise<boolean> {
  const confirmed = await prisma.statePhoto.count({
    where: { reservationId, phase, confirmedAt: { not: null } },
  });
  return confirmed > 0;
}
