// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { prisma } from './prisma.js';

// Lo que hace falta de un objeto para ofrecer sus modos de entrega (US-05.01, #281).
export function findItemDeliveryInfo(id: string) {
  return prisma.item.findUnique({
    where: { id },
    select: {
      status: true,
      neighborhood: true,
      homeDelivery: true,
      riderDelivery: true,
      pickupPointDelivery: true,
    },
  });
}
