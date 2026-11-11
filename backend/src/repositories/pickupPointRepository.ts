// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { prisma } from './prisma.js';

export function listPickupPoints() {
  return prisma.pickupPoint.findMany();
}

export function findPickupPointById(id: string) {
  return prisma.pickupPoint.findUnique({ where: { id } });
}
