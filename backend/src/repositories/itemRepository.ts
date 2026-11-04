import { itemDetailInclude } from './detailIncludes.js';
import { prisma } from './prisma.js';

export function findCategoryById(id: string) {
  return prisma.category.findUnique({ where: { id } });
}

export function createItem(data: {
  ownerId: string;
  categoryId: string;
  title: string;
  description: string;
  dailyPrice: string;
  deposit: string;
  neighborhood: string;
  homeDelivery: boolean;
  riderDelivery: boolean;
  pickupPointDelivery: boolean;
  status: 'published' | 'paused';
}) {
  return prisma.item.create({ data, include: itemDetailInclude });
}
