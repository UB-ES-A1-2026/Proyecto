// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 18/10/2026
// Datos de desarrollo y de demo (#98). Se puede ejecutar varias veces: actualiza en lugar de duplicar.
// Desde #97 también crea los objetos de ejemplo de demoData.ts. NUNCA contra producción: la
// contraseña está en el repo (docs/despliegue.md). Para producción está seed-demo.ts.
import { PrismaClient } from '@prisma/client';
import {
  DEV_ADMIN_EMAIL,
  DEV_PASSWORD,
  DEV_USERS,
  upsertDemoItems,
  upsertDemoModerations,
  upsertDemoReservations,
  upsertDemoRiders,
  upsertUsers,
  demandNeighbours,
  upsertDemoDemand,
  assignDemoRider,
  upsertDemoRiderJobs,
} from './demoSeed.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? '10');
  const [anaId, brunoId] = await upsertUsers(
    prisma,
    DEV_USERS,
    DEV_PASSWORD,
    rounds,
  );

  // Los objetos son de ana y bruno; admin no publica nada.
  const items = await upsertDemoItems(prisma, [anaId, brunoId, anaId]);
  // El admin retira un objeto de bruno con motivo (US-11.03).
  await upsertDemoModerations(prisma, [anaId, brunoId, anaId], DEV_ADMIN_EMAIL);
  // Las solicitudes son entre ana (0 y 2) y bruno (1), con los mismos dueños que los objetos: así
  // también se pueden usar los objetos del tercer dueño (US-05.02, #288).
  const reservations = await upsertDemoReservations(prisma, [
    anaId,
    brunoId,
    anaId,
  ]);
  // Seis vecinos con solicitudes pendientes en las mismas fechas (US-04.07).
  const neighbourIds = await upsertUsers(
    prisma,
    demandNeighbours('rentit.test'),
    DEV_PASSWORD,
    rounds,
  );
  const demand = await upsertDemoDemand(prisma, [anaId, brunoId], neighbourIds);
  // Dos trabajos de rider disponibles, de vecino5 y vecino6 a ana (US-10.01, #292).
  const riderJobs = await upsertDemoRiderJobs(
    prisma,
    [anaId, brunoId, anaId],
    neighbourIds,
  );

  // Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
  // Cuatro cuentas de rider (US-10.03, US-11.03 y US-10.01): carla pendiente, dani y oscar
  // aceptados y eva rechazada; las resueltas las revisó el admin de arriba.
  const riders = await upsertDemoRiders(prisma, DEV_PASSWORD, rounds);
  // dani ya ha aceptado el trabajo de la «Hidrolimpiadora Kärcher» (US-05.02, #288).
  await assignDemoRider(prisma, [anaId, brunoId, anaId], 'dani@rentit.test');

  console.info(
    `Seed completado: ${DEV_USERS.length} usuarios de prueba, ${riders} riders, ${items} objetos y ${reservations + demand + riderJobs} solicitudes`,
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
