// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 18/10/2026
// Datos de desarrollo y de demo (#98). Se puede ejecutar varias veces: actualiza en lugar de duplicar.
// Desde #97 también crea los objetos de ejemplo de demoData.ts. NUNCA contra producción: la
// contraseña está en el repo (docs/despliegue.md). Para producción está seed-demo.ts.
import { PrismaClient } from '@prisma/client';
import {
  DEV_PASSWORD,
  DEV_USERS,
  upsertDemoItems,
  upsertDemoReservations,
  upsertDemoRiders,
  upsertUsers,
  demandNeighbours,
  upsertDemoDemand,
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
  // Las solicitudes son entre ana (0) y bruno (1).
  const reservations = await upsertDemoReservations(prisma, [anaId, brunoId]);
  // Seis vecinos con solicitudes pendientes en las mismas fechas (US-04.07).
  const neighbourIds = await upsertUsers(
    prisma,
    demandNeighbours('rentit.test'),
    DEV_PASSWORD,
    rounds,
  );
  const demand = await upsertDemoDemand(prisma, [anaId, brunoId], neighbourIds);

  // Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
  // Tres cuentas de rider (US-10.03 y US-11.03): carla pendiente, dani aceptada y eva rechazada;
  // las dos resueltas las revisó el admin de arriba.
  const riders = await upsertDemoRiders(prisma, DEV_PASSWORD, rounds);

  console.info(
    `Seed completado: ${DEV_USERS.length} usuarios de prueba, ${riders} riders, ${items} objetos y ${reservations + demand} solicitudes`,
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
