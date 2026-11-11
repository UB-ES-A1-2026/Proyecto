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
    address: string | null;
    homeDelivery: boolean;
    riderDelivery: boolean;
    pickupPointDelivery: boolean;
    status: 'published' | 'paused' | 'withdrawn';
    categoryId: string;
  }> = {},
) {
  const categoryId = overrides.categoryId ?? (await getTestCategory()).id;
  // Un objeto con domicilio o rider necesita dirección para poder solicitarse (US-05.01, #281):
  // salvo que el test la indique (también con null), se le pone una.
  const needsAddress = overrides.homeDelivery || overrides.riderDelivery;
  const address =
    overrides.address !== undefined
      ? overrides.address
      : needsAddress
        ? 'Carrer de Prova, 1'
        : null;

  return prisma.item.create({
    data: {
      ownerId,
      categoryId,
      title: overrides.title ?? 'Taladro percutor',
      description: 'Taladro con maletín y brocas para madera y pared.',
      dailyPrice: overrides.dailyPrice ?? 5,
      deposit: overrides.deposit ?? 30,
      neighborhood: overrides.neighborhood ?? 'Gràcia',
      address,
      homeDelivery: overrides.homeDelivery ?? false,
      riderDelivery: overrides.riderDelivery ?? false,
      pickupPointDelivery: overrides.pickupPointDelivery ?? false,
      status: overrides.status ?? 'published',
    },
  });
}
