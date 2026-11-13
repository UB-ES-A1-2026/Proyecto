// Funciones comunes de los seeds (#97): crear usuarios y objetos sin duplicarlos si se ejecutan
// varias veces. Las usan seed.ts (desarrollo) y seed-demo.ts (demo en producción).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026
import bcrypt from 'bcrypt';
import {
  UserRole,
  type PrismaClient,
  type RiderApplicationStatus,
  type RiderSlot,
  type RiderVehicle,
  type RiderWeekday,
} from '@prisma/client';
import {
  DEMO_DEMAND_ITEM,
  DEMO_DEMAND_REQUESTS,
  DEMO_ITEMS,
  DEMO_RESERVATIONS,
} from './demoData.js';

// Contraseña de las cuentas del seed de desarrollo: está en el repo, que es público.
export const DEV_PASSWORD = 'Rentit2026';

export const DEMO_PASSWORD_MIN_LENGTH = 12;

// Cuentas de la demo en producción. Su contraseña llega por DEMO_PASSWORD, nunca desde el repo.
export const DEMO_USERS = [
  {
    username: 'laura',
    email: 'laura@demo.rentit.test',
    bio: 'Vivo en Gràcia y me encanta el bricolaje. Presto mis herramientas a los vecinos.',
  },
  {
    username: 'jordi',
    email: 'jordi@demo.rentit.test',
    bio: 'Aficionado al camping y a la montaña. Todo mi material está cuidado y listo para usar.',
  },
  {
    username: 'marta',
    email: 'marta@demo.rentit.test',
    bio: 'Madre de dos peques: alquilo cosas de bebé y de fiestas que ya no uso a diario.',
  },
] as const;

// Cuentas del seed de desarrollo (seed.ts), con la bio de ejemplo de US-01.4 (#300).
export const DEV_USERS: readonly SeedUser[] = [
  {
    username: 'ana',
    email: 'ana@rentit.test',
    role: UserRole.user,
    bio: 'Vecina de Sants. Alquilo herramientas y cosas de jardín.',
  },
  {
    username: 'bruno',
    email: 'bruno@rentit.test',
    role: UserRole.user,
    bio: 'Me gusta el deporte y viajar ligero. Pregúntame por mi material.',
  },
  { username: 'admin', email: 'admin@rentit.test', role: UserRole.admin },
];

export interface SeedUser {
  username: string;
  email: string;
  role?: UserRole;
  // Bio de ejemplo (US-01.4, #300). Si no se indica, la bio existente no se toca.
  bio?: string;
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
      update: {
        username: user.username,
        role: user.role,
        bio: user.bio,
        passwordHash,
      },
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
      // Las pendientes tienen 48 h para responder desde que se carga el seed (#72).
      expiresAt:
        reservation.status === 'pending'
          ? new Date(today.getTime() + 48 * 60 * 60 * 1000)
          : null,
    };

    const existing = await prisma.reservation.findFirst({
      where: { itemId: item.id, renterId },
      select: { id: true },
    });

    const { id } = existing
      ? await prisma.reservation.update({ where: { id: existing.id }, data })
      : await prisma.reservation.create({ data });

    // Pagos (US-07.01, #72): la pendiente tiene el importe bloqueado («autorizado») y la pagada,
    // cobrado. Al repetir el seed se rehace el pago, por si se ha cambiado al probar. Las aceptadas
    // y rechazadas son del flujo antiguo y no llevan pago. Sin referencias: pagos sin pasarela.
    // Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 14/11/2026
    await prisma.payment.deleteMany({ where: { reservationId: id } });
    if (reservation.status === 'pending' || reservation.status === 'paid') {
      await prisma.payment.create({
        data: {
          reservationId: id,
          rentalAmount: data.totalPrice,
          depositAmount: item.deposit,
          status: reservation.status === 'paid' ? 'paid' : 'authorized',
          // La fianza se retiene el día antes de empezar (#72): de momento, «pendiente». Sin fianza
          // (menos de 0,50 €) no hay estado.
          depositStatus: item.deposit.gte(0.5) ? 'pending' : null,
        },
      });
    }
  }

  return DEMO_RESERVATIONS.length;
}

// Vecinos que solo hacen las solicitudes de DEMO_DEMAND_REQUESTS (US-04.07): uno por solicitud,
// porque el seed guarda como mucho una solicitud por objeto y arrendatario.
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 12/11/2026
export function demandNeighbours(domain: string): SeedUser[] {
  return DEMO_DEMAND_REQUESTS.map((_, index) => ({
    username: `vecino${index + 1}`,
    email: `vecino${index + 1}@${domain}`,
  }));
}

// Crea o actualiza las solicitudes pendientes de DEMO_DEMAND_REQUESTS. Repetir el seed las
// vuelve a dejar pendientes y con las fechas a partir de hoy.
export async function upsertDemoDemand(
  prisma: PrismaClient,
  ownerIds: readonly string[],
  neighbourIds: readonly string[],
  today = new Date(),
): Promise<number> {
  const ownerId = ownerIds[DEMO_DEMAND_ITEM.owner];
  if (!ownerId) {
    throw new Error(`Falta el propietario de «${DEMO_DEMAND_ITEM.title}»`);
  }

  const item = await prisma.item.findFirst({
    where: { ownerId, title: DEMO_DEMAND_ITEM.title },
    select: { id: true, dailyPrice: true },
  });
  if (!item) {
    throw new Error(
      `No existe «${DEMO_DEMAND_ITEM.title}»: crea antes los objetos (upsertDemoItems)`,
    );
  }

  for (const [index, request] of DEMO_DEMAND_REQUESTS.entries()) {
    const renterId = neighbourIds[index];
    if (!renterId) {
      throw new Error(`Falta el vecino ${index + 1} para la demanda de fechas`);
    }

    const data = {
      itemId: item.id,
      renterId,
      startDate: daysFrom(today, request.startInDays),
      endDate: daysFrom(today, request.startInDays + request.days - 1),
      totalPrice: item.dailyPrice.times(request.days),
      status: 'pending' as const,
    };
    const existing = await prisma.reservation.findFirst({
      where: { itemId: item.id, renterId },
      select: { id: true },
    });

    if (existing) {
      await prisma.reservation.update({ where: { id: existing.id }, data });
    } else {
      await prisma.reservation.create({ data });
    }
  }

  return DEMO_DEMAND_REQUESTS.length;
}

// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
// Cuentas de rider de ejemplo (US-10.03): una pendiente de revisión y una ya aceptada.
export interface SeedRider {
  username: string;
  email: string;
  phone: string;
  zone: string;
  vehicle: RiderVehicle;
  days: RiderWeekday[];
  slots: RiderSlot[];
  status: RiderApplicationStatus;
}

// Las del seed de desarrollo.
export const DEMO_RIDERS: readonly SeedRider[] = [
  {
    username: 'carla',
    email: 'carla@rentit.test',
    phone: '612345678',
    zone: 'Gràcia',
    vehicle: 'bike',
    days: ['monday', 'wednesday', 'friday'],
    slots: ['afternoon'],
    status: 'pending',
  },
  {
    username: 'dani',
    email: 'dani@rentit.test',
    phone: '698765432',
    zone: 'Eixample',
    vehicle: 'motorbike',
    days: ['saturday', 'sunday'],
    slots: ['morning', 'afternoon', 'night'],
    status: 'approved',
  },
];

// Las de la demo en producción (seed-demo.ts), con el mismo dominio que DEMO_USERS: sin ellas no se
// puede enseñar «Hazte rider» ni la revisión del admin en la demo.
export const PRODUCTION_DEMO_RIDERS: readonly SeedRider[] = [
  {
    username: 'nuria',
    email: 'nuria@demo.rentit.test',
    phone: '623456789',
    zone: 'Gràcia',
    vehicle: 'bike',
    days: ['monday', 'tuesday', 'thursday'],
    slots: ['afternoon', 'night'],
    status: 'pending',
  },
  {
    username: 'pau',
    email: 'pau@demo.rentit.test',
    phone: '687654321',
    zone: 'Poblenou',
    vehicle: 'scooter',
    days: ['friday', 'saturday', 'sunday'],
    slots: ['morning', 'afternoon'],
    status: 'approved',
  },
];

// Crea o actualiza las cuentas de rider (por email) con su solicitud. Repetir el seed deja otra
// vez cada solicitud en el estado del catálogo, igual que las reservas de demo.
export async function upsertDemoRiders(
  prisma: PrismaClient,
  password: string,
  bcryptRounds: number,
  riders: readonly SeedRider[] = DEMO_RIDERS,
): Promise<number> {
  const passwordHash = await bcrypt.hash(password, bcryptRounds);

  for (const { username, email, ...application } of riders) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { username, isRider: true, passwordHash },
      create: { username, email, isRider: true, passwordHash },
    });
    const data = { ...application, termsAcceptedAt: new Date() };

    await prisma.riderApplication.upsert({
      where: { userId: user.id },
      update: data,
      create: { ...data, userId: user.id },
    });
  }

  return riders.length;
}
