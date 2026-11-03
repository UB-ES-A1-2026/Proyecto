// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026
import type { ItemStatus } from '@prisma/client';
import { prisma } from './prisma.js';

export function findItemOwner(id: string) {
  return prisma.item.findUnique({
    where: { id },
    select: { ownerId: true },
  });
}

// Cambia el estado solo si sigue siendo `from`, en una única sentencia: si llegan dos peticiones
// a la vez, solo una lo cambia. Devuelve false si el objeto no estaba en ese estado.
export async function changeItemStatus(
  id: string,
  from: ItemStatus,
  to: ItemStatus,
): Promise<boolean> {
  const { count } = await prisma.item.updateMany({
    where: { id, status: from },
    data: { status: to },
  });

  return count === 1;
}

export function findItemSummary(id: string) {
  return prisma.item.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      title: true,
      dailyPrice: true,
      neighborhood: true,
      status: true,
    },
  });
}
