import { prisma } from './prisma.js';

export function listCategories() {
  return prisma.category.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
