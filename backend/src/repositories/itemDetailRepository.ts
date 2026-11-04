import { itemDetailInclude } from './detailIncludes.js';
import { prisma } from './prisma.js';

export function findItemDetailById(id: string) {
  return prisma.item.findUnique({ where: { id }, include: itemDetailInclude });
}
