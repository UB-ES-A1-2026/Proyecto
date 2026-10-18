// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 18/10/2026
// Datos de desarrollo y de demo (#98). Se puede ejecutar varias veces: actualiza en lugar de duplicar.
import bcrypt from 'bcrypt';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

// Contraseña común de las cuentas de prueba. Solo para local y demos: no es un secreto.
const DEMO_PASSWORD = 'Rentit2026';

const demoUsers = [
  { username: 'ana', email: 'ana@rentit.test', role: UserRole.user },
  { username: 'bruno', email: 'bruno@rentit.test', role: UserRole.user },
  { username: 'admin', email: 'admin@rentit.test', role: UserRole.admin },
];

async function main(): Promise<void> {
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? '10');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, rounds);

  for (const user of demoUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { username: user.username, role: user.role, passwordHash },
      create: { ...user, passwordHash },
    });
  }

  console.info(`Seed completado: ${demoUsers.length} usuarios de prueba`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
