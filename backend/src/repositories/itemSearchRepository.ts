import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export interface ItemSearchCriteria {
  text?: string;
  // Filtros de US-03.02 (#117). Todos opcionales y combinados con AND.
  categoryId?: string;
  // Importe en texto con punto decimal («10.50»): Prisma lo compara como Decimal, sin floats.
  maxPrice?: string;
  neighborhood?: string;
}

// Solo objetos publicados: los pausados y retirados no salen en la búsqueda (#112).
function buildWhere(criteria: ItemSearchCriteria): Prisma.ItemWhereInput {
  const where: Prisma.ItemWhereInput = { status: 'published' };

  if (criteria.categoryId) {
    where.categoryId = criteria.categoryId;
  }

  if (criteria.maxPrice) {
    where.dailyPrice = { lte: criteria.maxPrice };
  }

  if (criteria.neighborhood) {
    where.neighborhood = {
      contains: criteria.neighborhood,
      mode: 'insensitive',
    };
  }

  if (criteria.text) {
    where.OR = [
      { title: { contains: criteria.text, mode: 'insensitive' } },
      { description: { contains: criteria.text, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function searchItems(
  criteria: ItemSearchCriteria,
  { skip, take }: { skip: number; take: number },
) {
  const where = buildWhere(criteria);

  const [items, total] = await prisma.$transaction([
    prisma.item.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
      select: {
        id: true,
        title: true,
        dailyPrice: true,
        neighborhood: true,
        category: { select: { id: true, name: true } },
      },
    }),
    prisma.item.count({ where }),
  ]);

  return { items, total };
}
