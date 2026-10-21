import { prisma } from '../../src/repositories/prisma.js';

function assertTestDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('No se puede vaciar la base de datos: falta DATABASE_URL');
  }

  let databaseName: string;

  try {
    databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  } catch {
    throw new Error('No se puede vaciar la base de datos: DATABASE_URL no es válida');
  }

  if (databaseName !== 'rentit_test') {
    throw new Error('resetDb() solo puede ejecutarse con la base de datos rentit_test');
  }
}

export async function resetDb(): Promise<void> {
  assertTestDatabase();

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const quotedTables = tables
    .map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`)
    .join(', ');

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`,
  );
}
