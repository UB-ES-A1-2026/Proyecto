// Datos de la demo en producción (#97): 3 cuentas, 1 admin (US-11.03), 3 riders (US-10.03) y los
// objetos de demoData.ts.
// La contraseña de las cuentas sale de DEMO_PASSWORD (secreto de GitHub), nunca del repo.
// Se lanza desde el workflow «Datos de demo» (docs/despliegue.md). Se puede ejecutar varias veces.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026
import { PrismaClient } from '@prisma/client';
import {
  DEMO_ADMIN,
  DEMO_USERS,
  demandNeighbours,
  PRODUCTION_DEMO_RIDERS,
  demoPasswordError,
  upsertDemoDemand,
  upsertDemoItems,
  upsertDemoModerations,
  upsertDemoReservations,
  upsertDemoRiders,
  upsertUsers,
  assignDemoRider,
} from './demoSeed.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const password = process.env.DEMO_PASSWORD;
  const error = demoPasswordError(password);
  if (error || !password) {
    throw new Error(error ?? 'Falta DEMO_PASSWORD');
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? '10');
  const ownerIds = await upsertUsers(prisma, DEMO_USERS, password, rounds);
  const items = await upsertDemoItems(prisma, ownerIds);
  const reservations = await upsertDemoReservations(prisma, ownerIds);
  // Seis vecinos con solicitudes pendientes en las mismas fechas (US-04.07).
  const neighbourIds = await upsertUsers(
    prisma,
    demandNeighbours('demo.rentit.test'),
    password,
    rounds,
  );
  const demand = await upsertDemoDemand(prisma, ownerIds, neighbourIds);

  // El admin revisa los riders de la demo: se crea antes que ellos.
  await upsertUsers(prisma, [DEMO_ADMIN], password, rounds);
  // El admin retira de la demo un objeto sospechoso (US-11.03).
  await upsertDemoModerations(prisma, ownerIds, DEMO_ADMIN.email);
  const riders = await upsertDemoRiders(
    prisma,
    password,
    rounds,
    PRODUCTION_DEMO_RIDERS,
    DEMO_ADMIN.email,
  );
  // pau, el rider aceptado de la demo, ya ha aceptado el trabajo de la «Hidrolimpiadora Kärcher»
  // (US-05.02, #288).
  await assignDemoRider(prisma, ownerIds, 'pau@demo.rentit.test');

  // Nunca se escribe la contraseña en el log.
  console.info(
    `Datos de demo listos: ${DEMO_USERS.length} cuentas (${DEMO_USERS.map(({ email }) => email).join(', ')}), el admin ${DEMO_ADMIN.email}, ${riders} riders, ${items} objetos y ${reservations + demand} solicitudes`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
