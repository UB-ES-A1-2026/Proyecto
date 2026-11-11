// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026
import { itemDetailInclude } from './detailIncludes.js';
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
      address: true,
      status: true,
    },
  });
}

export function findItemOwnerAndStatus(id: string) {
  return prisma.item.findUnique({
    where: { id },
    select: {
      ownerId: true,
      status: true,
      homeDelivery: true,
      riderDelivery: true,
      pickupPointDelivery: true,
      address: true,
    },
  });
}

export function updateItemById(
  id: string,
  data: {
    title: string;
    description: string;
    dailyPrice: string;
    deposit: string;
    homeDelivery?: boolean | undefined;
    riderDelivery?: boolean | undefined;
    pickupPointDelivery?: boolean | undefined;
    address?: string | null | undefined;
    neighborhood?: string | undefined;
  },
) {
  return prisma.item.update({
    where: { id },
    data,
    include: itemDetailInclude,
  });
}
