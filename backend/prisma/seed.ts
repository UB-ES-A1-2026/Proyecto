// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 18/10/2026
// Datos de desarrollo y de demo (#98). Se puede ejecutar varias veces: actualiza en lugar de duplicar.
// Desde #97 también crea los objetos de ejemplo de demoData.ts. NUNCA contra producción: la
// contraseña está en el repo (docs/despliegue.md). Para producción está seed-demo.ts.
import { PrismaClient, UserRole } from '@prisma/client';
import { DEV_PASSWORD, upsertDemoItems, upsertUsers } from './demoSeed.js';

const prisma = new PrismaClient();

const demoUsers = [
  { username: 'ana', email: 'ana@rentit.test', role: UserRole.user },
  { username: 'bruno', email: 'bruno@rentit.test', role: UserRole.user },
  { username: 'admin', email: 'admin@rentit.test', role: UserRole.admin },
];

async function main(): Promise<void> {
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? '10');
  const [anaId, brunoId] = await upsertUsers(
    prisma,
    demoUsers,
    DEV_PASSWORD,
    rounds,
  );

  // Los objetos son de ana y bruno; admin no publica nada.
  const items = await upsertDemoItems(prisma, [anaId, brunoId, anaId]);

  console.info(
    `Seed completado: ${demoUsers.length} usuarios de prueba y ${items} objetos`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
