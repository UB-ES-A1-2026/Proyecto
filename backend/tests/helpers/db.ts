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

// Tablas que no se vacían: el historial de Prisma y los datos de referencia que crean las
// migraciones (las categorías existen también en producción y los tests cuentan con ellas).
export const PRESERVED_TABLES = ['_prisma_migrations', 'categoria'] as const;

export async function resetDb(): Promise<void> {
  assertTestDatabase();

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  `;

  const tablesToEmpty = tables.filter(
    ({ tablename }) =>
      !(PRESERVED_TABLES as readonly string[]).includes(tablename),
  );

  if (tablesToEmpty.length === 0) {
    return;
  }

  const quotedTables = tablesToEmpty
    .map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`)
    .join(', ');

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`,
  );
}
