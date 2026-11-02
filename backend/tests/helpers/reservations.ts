import { prisma } from '../../src/repositories/prisma.js';

// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026

// Crea una reserva directamente en la BD de tests. Las fechas van en formato «AAAA-MM-DD».
export async function createTestReservation(
  itemId: string,
  renterId: string,
  overrides: Partial<{
    startDate: string;
    endDate: string;
    totalPrice: number;
    status:
      | 'pending'
      | 'accepted'
      | 'rejected'
      | 'cancelled'
      | 'paid'
      | 'in_progress'
      | 'finished';
  }> = {},
) {
  return prisma.reservation.create({
    data: {
      itemId,
      renterId,
      startDate: new Date(overrides.startDate ?? '2026-12-01'),
      endDate: new Date(overrides.endDate ?? '2026-12-03'),
      totalPrice: overrides.totalPrice ?? 15,
      status: overrides.status ?? 'pending',
    },
  });
}
