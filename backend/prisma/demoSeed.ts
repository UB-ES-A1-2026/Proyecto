// Funciones comunes de los seeds (#97): crear usuarios y objetos sin duplicarlos si se ejecutan
// varias veces. Las usan seed.ts (desarrollo) y seed-demo.ts (demo en producción).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026
import bcrypt from 'bcrypt';
import type { PrismaClient, UserRole } from '@prisma/client';
import { DEMO_ITEMS, DEMO_RESERVATIONS } from './demoData.js';

// Contraseña de las cuentas del seed de desarrollo: está en el repo, que es público.
export const DEV_PASSWORD = 'Rentit2026';

export const DEMO_PASSWORD_MIN_LENGTH = 12;

// Cuentas de la demo en producción. Su contraseña llega por DEMO_PASSWORD, nunca desde el repo.
export const DEMO_USERS = [
  { username: 'laura', email: 'laura@demo.rentit.test' },
  { username: 'jordi', email: 'jordi@demo.rentit.test' },
  { username: 'marta', email: 'marta@demo.rentit.test' },
] as const;

export interface SeedUser {
  username: string;
  email: string;
  role?: UserRole;
}

// Comprueba la contraseña de la demo antes de tocar la BD. Devuelve el mensaje de error o null.
export function demoPasswordError(password: string | undefined): string | null {
  if (!password) {
    return 'Falta la variable de entorno DEMO_PASSWORD con la contraseña de las cuentas de la demo.';
  }
  if (password.length < DEMO_PASSWORD_MIN_LENGTH) {
    return `DEMO_PASSWORD debe tener al menos ${DEMO_PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password === DEV_PASSWORD) {
    return 'DEMO_PASSWORD no puede ser la contraseña del seed de desarrollo, que es pública.';
  }
  return null;
}

// Crea o actualiza los usuarios (por email) con la contraseña indicada y devuelve sus ids en el mismo orden.
export async function upsertUsers(
  prisma: PrismaClient,
  users: readonly SeedUser[],
  password: string,
  bcryptRounds: number,
): Promise<string[]> {
  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  const ids: string[] = [];

  for (const user of users) {
    const saved = await prisma.user.upsert({
      where: { email: user.email },
      update: { username: user.username, role: user.role, passwordHash },
      create: { ...user, passwordHash },
    });
    ids.push(saved.id);
  }

  return ids;
}

// Crea o actualiza los objetos de DEMO_ITEMS. Un objeto ya existe si su propietario tiene otro con
// el mismo título; en ese caso se actualiza en lugar de duplicarlo.
export async function upsertDemoItems(
  prisma: PrismaClient,
  ownerIds: readonly string[],
): Promise<number> {
  const categories = await prisma.category.findMany();
  const categoryIdByName = new Map(
    categories.map(({ id, name }) => [name, id]),
  );

  for (const { owner, category, ...item } of DEMO_ITEMS) {
    const ownerId = ownerIds[owner];
    const categoryId = categoryIdByName.get(category);

    if (!ownerId) {
      throw new Error(`Falta el propietario ${owner} para «${item.title}»`);
    }
    if (!categoryId) {
      throw new Error(
        `No existe la categoría «${category}»: aplica antes las migraciones (npm run db:deploy)`,
      );
    }

    const data = { ...item, ownerId, categoryId };
    const existing = await prisma.item.findFirst({
      where: { ownerId, title: item.title },
      select: { id: true },
    });

    if (existing) {
      await prisma.item.update({ where: { id: existing.id }, data });
    } else {
      await prisma.item.create({ data });
    }
  }

  return DEMO_ITEMS.length;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Fecha (sin hora) a N días de `today`, a medianoche UTC, como guarda Prisma las columnas DATE.
function daysFrom(today: Date, days: number): Date {
  const midnight = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return new Date(midnight + days * DAY_MS);
}

// Crea o actualiza las solicitudes de DEMO_RESERVATIONS (US-04.02 a US-04.04). Necesita que
// existan antes los usuarios y los objetos. Hay como mucho una por objeto y arrendatario: si ya
// existe, se le devuelven las fechas, el importe y el estado del catálogo, así que repetir el
// seed deja otra vez pendientes las que se hayan aceptado o rechazado al probar.
export async function upsertDemoReservations(
  prisma: PrismaClient,
  userIds: readonly string[],
  today = new Date(),
): Promise<number> {
  for (const reservation of DEMO_RESERVATIONS) {
    const ownerId = userIds[reservation.item.owner];
    const renterId = userIds[reservation.renter];
    if (!ownerId || !renterId) {
      throw new Error(
        `Faltan usuarios para la solicitud de «${reservation.item.title}»`,
      );
    }

    const item = await prisma.item.findFirst({
      where: { ownerId, title: reservation.item.title },
      select: { id: true, dailyPrice: true, deposit: true },
    });
    if (!item) {
      throw new Error(
        `No existe «${reservation.item.title}»: crea antes los objetos (upsertDemoItems)`,
      );
    }

    const data = {
      itemId: item.id,
      renterId,
      startDate: daysFrom(today, reservation.startInDays),
      endDate: daysFrom(today, reservation.startInDays + reservation.days - 1),
      totalPrice: item.dailyPrice.times(reservation.days),
      status: reservation.status,
    };
    const existing = await prisma.reservation.findFirst({
      where: { itemId: item.id, renterId },
      select: { id: true },
    });

    const { id } = existing
      ? await prisma.reservation.update({ where: { id: existing.id }, data })
      : await prisma.reservation.create({ data });

    // Pagos (US-07.01, #284): al repetir el seed se borra el pago que se haya hecho al probar,
    // para que la reserva «aceptada» se pueda volver a pagar, y la «pagada» lleva el suyo.
    // Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 11/11/2026
    await prisma.payment.deleteMany({ where: { reservationId: id } });
    if (reservation.status === 'paid') {
      await prisma.payment.create({
        data: {
          reservationId: id,
          rentalAmount: data.totalPrice,
          depositAmount: item.deposit,
          status: 'paid',
          // La fianza se retiene el día antes de empezar (#72): de momento, «pendiente». Sin fianza
          // (menos de 0,50 €) no hay estado. Sin referencias: es un pago sin pasarela.
          depositStatus: item.deposit.gte(0.5) ? 'pending' : null,
        },
      });
    }
  }

  return DEMO_RESERVATIONS.length;
}
