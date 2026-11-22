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
import { quoteRiderFee } from '../src/services/deliveryFee.js';
import { generateDeliveryCode } from '../src/services/deliveryCode.js';
import {
  DEMO_DEMAND_ITEM,
  DEMO_DEMAND_REQUESTS,
  DEMO_ITEMS,
  DEMO_MODERATIONS,
  DEMO_RESERVATIONS,
  DEMO_RIDER_JOBS,
  type DemoDelivery,
  type DemoReservation,
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
// Admin de la demo en producción (US-11.03): revisa las solicitudes de rider. No va en DEMO_USERS
// porque no es dueño de objetos ni solicita nada. Misma contraseña que el resto (DEMO_PASSWORD).
export const DEMO_ADMIN = {
  username: 'admin',
  email: 'admin@demo.rentit.test',
  role: 'admin',
} as const satisfies SeedUser;

// Admin del seed de desarrollo (seed.ts), que revisa los riders de ejemplo.
export const DEV_ADMIN_EMAIL = 'admin@rentit.test';

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

// Estado del pago según el de la reserva. Una cancelada con pago se reembolsó (US-04.05).
const PAYMENT_STATUS = {
  pending: 'authorized',
  paid: 'paid',
  cancelled: 'refunded',
} as const;

// Fecha (sin hora) a N días de `today`, a medianoche UTC, como guarda Prisma las columnas DATE.
function daysFrom(today: Date, days: number): Date {
  const midnight = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return new Date(midnight + days * DAY_MS);
}

// Columnas de `entrega` de una solicitud de la demo (US-05.01, #281). Todas se escriben siempre,
// con NULL las que no tocan, para que repetir el seed deje la entrega como en el catálogo.
async function demoDeliveryData(
  prisma: PrismaClient,
  delivery: DemoDelivery,
  itemNeighborhood: string,
) {
  // El seguimiento (US-05.02, #288) vuelve al principio: repetir el seed deja otra vez la entrega
  // pendiente, sin rider, sin intentos de código y sin la hora de ningún paso.
  const empty = {
    pickupPointId: null,
    slot: null,
    deliveryAddress: null,
    deliveryNeighborhood: null,
    fee: null,
    status: 'pending' as const,
    riderId: null,
    deliveryCode: null,
    codeAttempts: 0,
    assignedAt: null,
    pickedUpAt: null,
    onTheWayAt: null,
    deliveredAt: null,
    returnedAt: null,
  };

  switch (delivery.mode) {
    case 'home':
      return empty;
    case 'rider':
      return {
        ...empty,
        slot: delivery.slot,
        deliveryAddress: delivery.address,
        deliveryNeighborhood: delivery.neighborhood,
        fee: quoteRiderFee(itemNeighborhood, delivery.neighborhood).fee,
        // Como al solicitar: con rider, la entrega tiene su código (US-05.02, #288).
        deliveryCode: generateDeliveryCode(),
      };
    case 'pickup_point': {
      const point = await prisma.pickupPoint.findFirst({
        where: { name: delivery.pickupPoint },
        select: { id: true },
      });
      if (!point) {
        throw new Error(
          `No existe el punto de recogida «${delivery.pickupPoint}»: aplica antes las migraciones (npm run db:deploy)`,
        );
      }
      return { ...empty, pickupPointId: point.id };
    }
  }
}

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Crea o actualiza las solicitudes de DEMO_RESERVATIONS (US-04.02 a US-04.04 y, desde US-05.01, con su entrega). Necesita que
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

    // Quién la canceló (US-04.05, #308), solo en las canceladas.
    const cancelledById = reservation.cancellation
      ? userIds[reservation.cancellation.by]
      : undefined;
    await upsertDemoReservation(
      prisma,
      ownerId,
      renterId,
      reservation,
      today,
      cancelledById,
    );
  }

  return DEMO_RESERVATIONS.length;
}

// Una solicitud del catálogo con su entrega y su pago. Hay como mucho una por objeto y
// arrendatario: si ya existe, vuelve a dejarla como en el catálogo.
async function upsertDemoReservation(
  prisma: PrismaClient,
  ownerId: string,
  renterId: string,
  reservation: Pick<
    DemoReservation,
    'item' | 'delivery' | 'startInDays' | 'days' | 'status' | 'cancellation'
  >,
  today: Date,
  cancelledById?: string,
): Promise<void> {
  const item = await prisma.item.findFirst({
    where: { ownerId, title: reservation.item.title },
    select: { id: true, dailyPrice: true, deposit: true, neighborhood: true },
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
    deliveryMode: reservation.delivery.mode,
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
  // Repetir el seed borra las valoraciones hechas al probar: vuelve a salir «Valorar» (#295).
  await prisma.rating.deleteMany({ where: { reservationId: id } });

  const delivery = await demoDeliveryData(
    prisma,
    reservation.delivery,
    item.neighborhood,
  );
  await prisma.delivery.upsert({
    where: { reservationId: id },
    update: delivery,
    create: { reservationId: id, ...delivery },
  });

  // Pagos (US-07.01, #72): la pendiente tiene el importe bloqueado («autorizado») y la pagada,
  // cobrado. Al repetir el seed se rehace el pago, por si se ha cambiado al probar. Las aceptadas
  // y rechazadas son del flujo antiguo y no llevan pago. Sin referencias: pagos sin pasarela.
  // Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 14/11/2026
  await prisma.payment.deleteMany({ where: { reservationId: id } });
  const hasPayment =
    reservation.status === 'pending' ||
    reservation.status === 'paid' ||
    reservation.status === 'cancelled';
  if (hasPayment) {
    await prisma.payment.create({
      data: {
        reservationId: id,
        rentalAmount: data.totalPrice,
        // Con rider, la tarifa se bloquea y se cobra con el alquiler (US-05.01).
        deliveryAmount: delivery.fee ?? 0,
        depositAmount: item.deposit,
        status: PAYMENT_STATUS[reservation.status],
        // La fianza se retiene el día antes de empezar (#72): de momento, «pendiente». Sin fianza
        // (menos de 0,50 €) no hay estado. En la cancelada (US-04.05) ya está liberada.
        depositStatus: item.deposit.gte(0.5)
          ? reservation.status === 'cancelled'
            ? 'released'
            : 'pending'
          : null,
      },
    });
  }

  // Cancelaciones (US-04.05, #308): quién canceló, con qué penalización y lo reembolsado. Se
  // rehacen en cada ejecución, así que una reserva cancelada al probar vuelve a su estado.
  await prisma.cancellation.deleteMany({ where: { reservationId: id } });
  if (reservation.status === 'cancelled') {
    if (!reservation.cancellation || !cancelledById) {
      throw new Error(
        `Falta quién canceló la reserva de «${reservation.item.title}»`,
      );
    }
    const penaltyAmount = data.totalPrice
      .times(reservation.cancellation.penaltyPercent)
      .dividedBy(100)
      .toDecimalPlaces(2);
    await prisma.cancellation.create({
      data: {
        reservationId: id,
        cancelledById,
        // Un día antes de hoy: ya está cancelada de antes de cargar el seed.
        cancelledAt: new Date(today.getTime() - DAY_MS),
        penaltyPercent: reservation.cancellation.penaltyPercent,
        penaltyAmount,
        refundAmount: data.totalPrice.minus(penaltyAmount),
      },
    });
  }
}

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 21/11/2026
// Crea o actualiza las reservas de DEMO_RIDER_JOBS (US-10.01, #292): pagadas, con rider y sin
// rider asignado. Va después de crear los vecinos (demandNeighbours). Repetir el seed deja otra vez
// cada trabajo disponible: sin rider, con la entrega pendiente y las fechas a partir de hoy.
export async function upsertDemoRiderJobs(
  prisma: PrismaClient,
  ownerIds: readonly string[],
  neighbourIds: readonly string[],
  today = new Date(),
): Promise<number> {
  for (const job of DEMO_RIDER_JOBS) {
    const ownerId = ownerIds[job.item.owner];
    const renterId = neighbourIds[job.neighbour];
    if (!ownerId || !renterId) {
      throw new Error(
        `Faltan usuarios para el trabajo de rider de «${job.item.title}»`,
      );
    }

    await upsertDemoReservation(
      prisma,
      ownerId,
      renterId,
      { ...job, status: 'paid' },
      today,
    );
  }

  return DEMO_RIDER_JOBS.length;
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
// Cuentas de rider de ejemplo (US-10.03 y US-11.03): una pendiente de revisión, una aceptada y
// una rechazada con motivo; las resueltas las revisó el admin del seed.
export interface SeedRider {
  username: string;
  email: string;
  phone: string;
  zone: string;
  vehicle: RiderVehicle;
  days: RiderWeekday[];
  slots: RiderSlot[];
  status: RiderApplicationStatus;
  rejectionReason?: string;
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
  {
    username: 'eva',
    email: 'eva@rentit.test',
    phone: '634567890',
    zone: 'Sants',
    vehicle: 'on_foot',
    days: ['tuesday', 'thursday'],
    slots: ['night'],
    status: 'rejected',
    rejectionReason: 'Zona sin cobertura de reparto por ahora.',
  },
  // Segundo rider aceptado (US-10.01, #292): con dani, para el e2e de dos riders que aceptan el
  // mismo trabajo.
  {
    username: 'oscar',
    email: 'oscar@rentit.test',
    phone: '656789012',
    zone: 'Sants',
    vehicle: 'bike',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    slots: ['morning', 'afternoon'],
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
  {
    username: 'bruna',
    email: 'bruna@demo.rentit.test',
    phone: '645678901',
    zone: 'Sant Martí',
    vehicle: 'car',
    days: ['wednesday'],
    slots: ['night'],
    status: 'rejected',
    rejectionReason: 'Necesitamos más disponibilidad semanal.',
  },
  // Segundo rider aceptado (US-10.01, #292), como oscar en local.
  {
    username: 'ona',
    email: 'ona@demo.rentit.test',
    phone: '667890123',
    zone: 'Les Corts',
    vehicle: 'motorbike',
    days: ['monday', 'wednesday', 'friday', 'saturday'],
    slots: ['afternoon', 'night'],
    status: 'approved',
  },
];

// Crea o actualiza las cuentas de rider (por email) con su solicitud. Repetir el seed deja otra
// vez cada solicitud en el estado del catálogo, igual que las reservas de demo. Las aceptadas y
// rechazadas quedan revisadas por `reviewerEmail`, que debe existir ya.
export async function upsertDemoRiders(
  prisma: PrismaClient,
  password: string,
  bcryptRounds: number,
  riders: readonly SeedRider[] = DEMO_RIDERS,
  reviewerEmail: string = DEV_ADMIN_EMAIL,
): Promise<number> {
  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  const reviewer = await prisma.user.findUnique({
    where: { email: reviewerEmail },
    select: { id: true },
  });
  if (!reviewer) {
    throw new Error(
      `No existe el admin ${reviewerEmail}: crea antes los usuarios del seed`,
    );
  }

  for (const { username, email, rejectionReason, ...application } of riders) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { username, isRider: true, passwordHash },
      create: { username, email, isRider: true, passwordHash },
    });
    const reviewed = application.status !== 'pending';
    const data = {
      ...application,
      termsAcceptedAt: new Date(),
      reviewedById: reviewed ? reviewer.id : null,
      reviewedAt: reviewed ? new Date() : null,
      rejectionReason:
        application.status === 'rejected' ? (rejectionReason ?? null) : null,
    };

    await prisma.riderApplication.upsert({
      where: { userId: user.id },
      update: data,
      create: { ...data, userId: user.id },
    });
  }

  return riders.length;
}

// Asigna el rider indicado a las entregas de DEMO_RESERVATIONS con riderAssigned (US-05.02, #288),
// como si ya hubiera aceptado el trabajo (US-10.01). Va después de upsertDemoRiders. Devuelve
// cuántas entregas ha asignado.
export async function assignDemoRider(
  prisma: PrismaClient,
  userIds: readonly string[],
  riderEmail: string,
  now = new Date(),
): Promise<number> {
  const rider = await prisma.user.findUnique({
    where: { email: riderEmail },
    select: { id: true },
  });
  if (!rider) {
    throw new Error(
      `No existe el rider «${riderEmail}»: crea antes los riders (upsertDemoRiders)`,
    );
  }

  let assigned = 0;
  for (const reservation of DEMO_RESERVATIONS) {
    if (!reservation.riderAssigned) continue;
    const ownerId = userIds[reservation.item.owner];
    const renterId = userIds[reservation.renter];
    const { count } = await prisma.delivery.updateMany({
      where: {
        reservation: {
          renterId,
          item: { ownerId, title: reservation.item.title },
        },
      },
      data: { riderId: rider.id, status: 'assigned', assignedAt: now },
    });
    assigned += count;
  }

  return assigned;
}

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 13/11/2026
// Crea o actualiza la retirada del admin de los objetos de DEMO_MODERATIONS (US-11.03). Necesita
// que existan antes los objetos (upsertDemoItems) y el admin. Repetirlo deja el objeto retirado
// con el motivo del catálogo.
export async function upsertDemoModerations(
  prisma: PrismaClient,
  ownerIds: readonly string[],
  adminEmail: string,
): Promise<number> {
  const admin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });
  if (!admin) {
    throw new Error(
      `No existe el admin ${adminEmail}: crea antes los usuarios del seed`,
    );
  }

  for (const { item: demoItem, reason, details } of DEMO_MODERATIONS) {
    const ownerId = ownerIds[demoItem.owner];
    const item = ownerId
      ? await prisma.item.findFirst({
          where: { ownerId, title: demoItem.title },
          select: { id: true },
        })
      : null;
    if (!item) {
      throw new Error(
        `No existe «${demoItem.title}»: crea antes los objetos (upsertDemoItems)`,
      );
    }

    await prisma.item.update({
      where: { id: item.id },
      data: { status: 'withdrawn' },
    });
    const data = { adminId: admin.id, reason, details };
    await prisma.itemModeration.upsert({
      where: { itemId: item.id },
      update: data,
      create: { ...data, itemId: item.id },
    });
  }

  return DEMO_MODERATIONS.length;
}
