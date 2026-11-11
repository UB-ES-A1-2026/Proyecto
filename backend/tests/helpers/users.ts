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
  }> = {},
) {
  return prisma.user.create({
    data: {
      username: overrides.username ?? 'ana',
      email: overrides.email ?? 'ana@rentit.test',
      status: overrides.status ?? 'active',
      isRider: overrides.isRider ?? false,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
    },
  });
}

// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
// Crea una cuenta de rider con su solicitud en el estado indicado (por defecto, pendiente).
export async function createTestRider(
  status: 'pending' | 'approved' | 'rejected' = 'pending',
  overrides: Partial<{ username: string; email: string }> = {},
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
    },
  });

  return user;
}
