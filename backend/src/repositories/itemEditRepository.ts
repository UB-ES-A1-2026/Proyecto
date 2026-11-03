// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026
import { itemDetailInclude } from '../services/itemDetail.js';
import { prisma } from './prisma.js';

// Los objetos del usuario en cualquier estado, del más nuevo al más antiguo.
export function findItemsByOwner(ownerId: string) {
  return prisma.item.findMany({
    where: { ownerId },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      dailyPrice: true,
      neighborhood: true,
      status: true,
    },
  });
}

export function findItemOwner(id: string) {
  return prisma.item.findUnique({
    where: { id },
    select: { ownerId: true },
  });
}

export function updateItemById(
  id: string,
  data: {
    title: string;
    description: string;
    dailyPrice: string;
    deposit: string;
  },
) {
  return prisma.item.update({
    where: { id },
    data,
    include: itemDetailInclude,
  });
}
