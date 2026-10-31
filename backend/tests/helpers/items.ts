import { prisma } from '../../src/repositories/prisma.js';

// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 27/10/2026

// Una de las categorías que crea la migración (las mantiene resetDb()).
export async function getTestCategory(name = 'Herramientas y bricolaje') {
  return prisma.category.findUniqueOrThrow({ where: { name } });
}

// Crea un objeto directamente en la BD de tests para el propietario indicado.
export async function createTestItem(
  ownerId: string,
  overrides: Partial<{
    title: string;
    dailyPrice: number;
    deposit: number;
    neighborhood: string;
    status: 'published' | 'paused' | 'withdrawn';
    categoryId: string;
  }> = {},
) {
  const categoryId = overrides.categoryId ?? (await getTestCategory()).id;

  return prisma.item.create({
    data: {
      ownerId,
      categoryId,
      title: overrides.title ?? 'Taladro percutor',
      description: 'Taladro con maletín y brocas para madera y pared.',
      dailyPrice: overrides.dailyPrice ?? 5,
      deposit: overrides.deposit ?? 30,
      neighborhood: overrides.neighborhood ?? 'Gràcia',
      status: overrides.status ?? 'published',
    },
  });
}
