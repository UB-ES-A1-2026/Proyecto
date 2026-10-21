import bcrypt from 'bcrypt';
import { prisma } from '../../src/repositories/prisma.js';

export const TEST_PASSWORD = 'contraseña-segura';

// Crea un usuario directamente en la BD de tests (coste bajo de bcrypt para que los tests vayan rápido).
export async function createTestUser(
  overrides: Partial<{
    username: string;
    email: string;
    status: 'active' | 'blocked';
  }> = {},
) {
  return prisma.user.create({
    data: {
      username: overrides.username ?? 'ana',
      email: overrides.email ?? 'ana@rentit.test',
      status: overrides.status ?? 'active',
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
    },
  });
}
