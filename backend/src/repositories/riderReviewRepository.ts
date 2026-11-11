// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Revisión de las solicitudes de rider por un admin (US-11.03, #317).
import type { Prisma, RiderApplicationStatus } from '@prisma/client';
import { prisma } from './prisma.js';

const reviewInclude = {
  user: { select: { username: true, email: true } },
  reviewedBy: { select: { id: true, username: true } },
} as const;

export type ReviewedApplicationRow = Prisma.RiderApplicationGetPayload<{
  include: typeof reviewInclude;
}>;

// Pendientes: la más antigua primero (hay que atenderlas en orden). Resueltas: la última
// revisada primero. El id desempata para que el orden sea estable.
export function findApplicationsByStatus(
  status: RiderApplicationStatus,
): Promise<ReviewedApplicationRow[]> {
  const orderBy: Prisma.RiderApplicationOrderByWithRelationInput[] =
    status === 'pending'
      ? [{ createdAt: 'asc' }, { id: 'asc' }]
      : [{ reviewedAt: 'desc' }, { id: 'asc' }];

  return prisma.riderApplication.findMany({
    where: { status },
    include: reviewInclude,
    orderBy,
  });
}

export function findApplicationById(
  id: string,
): Promise<ReviewedApplicationRow | null> {
  return prisma.riderApplication.findUnique({
    where: { id },
    include: reviewInclude,
  });
}

// Transición única: solo cambia si sigue pendiente, aunque dos admins pulsen a la vez (la
// condición y el cambio son una sola sentencia). Devuelve si esta petición la resolvió.
export async function resolveIfPending(
  id: string,
  data: {
    status: 'approved' | 'rejected';
    reviewedById: string;
    rejectionReason: string | null;
  },
): Promise<boolean> {
  const { count } = await prisma.riderApplication.updateMany({
    where: { id, status: 'pending' },
    data: { ...data, reviewedAt: new Date() },
  });

  return count === 1;
}
