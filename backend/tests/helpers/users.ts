import bcrypt from 'bcrypt';
import { prisma } from '../../src/repositories/prisma.js';

export const TEST_PASSWORD = 'contraseña-segura';

// Crea un usuario directamente en la BD de tests (coste bajo de bcrypt para que los tests vayan rápido).
export async function createTestUser(
  overrides: Partial<{
    username: string;
    email: string;
    status: 'active' | 'blocked';
    isRider: boolean;
    role: 'user' | 'admin';
  }> = {},
) {
  return prisma.user.create({
    data: {
      username: overrides.username ?? 'ana',
      email: overrides.email ?? 'ana@rentit.test',
      status: overrides.status ?? 'active',
      isRider: overrides.isRider ?? false,
      role: overrides.role ?? 'user',
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
    },
  });
}

// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
// Crea una cuenta de rider con su solicitud en el estado indicado (por defecto, pendiente).
export async function createTestRider(
  status: 'pending' | 'approved' | 'rejected' = 'pending',
  overrides: Partial<{
    username: string;
    email: string;
    reviewedById: string;
    rejectionReason: string;
    createdAt: Date;
  }> = {},
) {
  const user = await createTestUser({
    username: overrides.username ?? 'rider',
    email: overrides.email ?? 'rider@rentit.test',
    isRider: true,
  });

  await prisma.riderApplication.create({
    data: {
      userId: user.id,
      phone: '612345678',
      zone: 'Gràcia',
      vehicle: 'bike',
      days: ['monday', 'friday'],
      slots: ['morning'],
      termsAcceptedAt: new Date(),
      status,
      // Una solicitud resuelta siempre tiene fecha de revisión (CHECK de la BD, US-11.03).
      reviewedAt: status === 'pending' ? null : new Date(),
      reviewedById: status === 'pending' ? null : overrides.reviewedById,
      rejectionReason: status === 'rejected' ? overrides.rejectionReason : null,
      ...(overrides.createdAt && { createdAt: overrides.createdAt }),
    },
  });

  return user;
}

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Crea una cuenta de admin (US-11.03).
export function createTestAdmin(
  overrides: Partial<{ username: string; email: string }> = {},
) {
  return createTestUser({
    username: overrides.username ?? 'admin',
    email: overrides.email ?? 'admin@rentit.test',
    role: 'admin',
  });
}
