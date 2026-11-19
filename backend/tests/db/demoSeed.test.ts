import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_DEMAND_ITEM,
  DEMO_ITEMS,
  DEMO_MODERATIONS,
  DEMO_RESERVATIONS,
} from '../../prisma/demoData.js';
import {
  DEMO_ADMIN,
  DEMO_USERS,
  DEV_USERS,
  DEV_PASSWORD,
  demandNeighbours,
  PRODUCTION_DEMO_RIDERS,
  demoPasswordError,
  upsertDemoDemand,
  upsertDemoItems,
  upsertDemoModerations,
  upsertDemoReservations,
  upsertDemoRiders,
  upsertUsers,
} from '../../prisma/demoSeed.js';
import { prisma } from '../../src/repositories/prisma.js';
import { quoteRiderFee } from '../../src/services/deliveryFee.js';
import { isKnownNeighborhood } from '../../src/services/neighborhoods.js';
import { resetDb } from '../helpers/db.js';

// Datos de demo (#97): las cuentas y los objetos se crean bien, no se duplican al repetir el
// seed y la contraseña de la demo nunca puede ser la pública del seed de desarrollo.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026

const DEMO_PASSWORD = 'una-contraseña-larga';

async function seedDemo(password = DEMO_PASSWORD) {
  const ownerIds = await upsertUsers(prisma, DEMO_USERS, password, 4);
  await upsertDemoItems(prisma, ownerIds);
  return ownerIds;
}

beforeEach(async () => {
  await resetDb();
});

describe('demoPasswordError', () => {
  it('rechaza una contraseña vacía, corta o la del seed de desarrollo', () => {
    expect(demoPasswordError(undefined)).toMatch('DEMO_PASSWORD');
    expect(demoPasswordError('')).toMatch('DEMO_PASSWORD');
    expect(demoPasswordError('corta')).toMatch('al menos 12');
    expect(demoPasswordError(DEV_PASSWORD)).not.toBeNull();
  });

  it('acepta una contraseña de 12 caracteres o más', () => {
    expect(demoPasswordError(DEMO_PASSWORD)).toBeNull();
  });
});

describe('seed de la demo', () => {
  it('crea las 3 cuentas con la contraseña indicada, guardada solo como hash', async () => {
    await seedDemo();

    const users = await prisma.user.findMany({ orderBy: { username: 'asc' } });
    expect(users.map(({ email }) => email)).toEqual([
      'jordi@demo.rentit.test',
      'laura@demo.rentit.test',
      'marta@demo.rentit.test',
    ]);
    for (const user of users) {
      expect(user.passwordHash).not.toContain(DEMO_PASSWORD);
      expect(await bcrypt.compare(DEMO_PASSWORD, user.passwordHash)).toBe(true);
    }
  });

  it('crea todos los objetos del catálogo con su propietario, categoría y estado', async () => {
    const ownerIds = await seedDemo();

    const items = await prisma.item.findMany({ include: { category: true } });
    expect(items).toHaveLength(DEMO_ITEMS.length);

    for (const demo of DEMO_ITEMS) {
      const item = items.find(({ title }) => title === demo.title);
      expect(item?.ownerId).toBe(ownerIds[demo.owner]);
      expect(item?.category.name).toBe(demo.category);
      expect(item?.status).toBe(demo.status);
      expect(item?.dailyPrice.toNumber()).toBe(demo.dailyPrice);
    }
  });

  it('cada cuenta de la demo publica algo y hay al menos un objeto pausado', async () => {
    const ownerIds = await seedDemo();

    for (const ownerId of ownerIds) {
      expect(
        await prisma.item.count({ where: { ownerId, status: 'published' } }),
      ).toBeGreaterThan(0);
    }
    expect(
      await prisma.item.count({ where: { status: 'paused' } }),
    ).toBeGreaterThan(0);
  });

  it('se puede repetir: no duplica nada y actualiza la contraseña', async () => {
    await seedDemo();
    await seedDemo('otra-contraseña-larga');

    expect(await prisma.user.count()).toBe(DEMO_USERS.length);
    expect(await prisma.item.count()).toBe(DEMO_ITEMS.length);

    const laura = await prisma.user.findUniqueOrThrow({
      where: { email: 'laura@demo.rentit.test' },
    });
    expect(
      await bcrypt.compare('otra-contraseña-larga', laura.passwordHash),
    ).toBe(true);
  });

  // US-05.01 (#281) – revisado por Alex Matos, 11/11/2026
  it('todos los objetos con entrega en casa o por rider llevan dirección, con barrio de la lista', async () => {
    await seedDemo();

    const items = await prisma.item.findMany();
    for (const item of items) {
      expect(isKnownNeighborhood(item.neighborhood), item.title).toBe(true);
      if (item.homeDelivery || item.riderDelivery) {
        expect(item.address, item.title).toBeTruthy();
      }
      expect(
        item.homeDelivery || item.riderDelivery || item.pickupPointDelivery,
        item.title,
      ).toBe(true);
    }
  });

  // Bios de ejemplo para el perfil público (US-01.4, #300) – revisado por Alex Matos, 11/11/2026
  it('las 3 cuentas de la demo llevan una bio corta que cabe en el perfil', async () => {
    await seedDemo();

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(DEMO_USERS.length);
    for (const user of users) {
      expect(user.bio).toBeTruthy();
      expect(user.bio!.length).toBeLessThanOrEqual(500);
    }
  });

  it('repetir el seed deja la bio de ejemplo aunque se hubiera editado', async () => {
    await seedDemo();
    await prisma.user.updateMany({ data: { bio: 'Cambiada' } });

    await seedDemo();

    const laura = await prisma.user.findUniqueOrThrow({
      where: { email: 'laura@demo.rentit.test' },
    });
    expect(laura.bio).toBe(DEMO_USERS[0].bio);
    expect(await prisma.user.count()).toBe(DEMO_USERS.length);
  });

  it('el seed de desarrollo da bio a ana y bruno, no al admin, y no duplica', async () => {
    await upsertUsers(prisma, DEV_USERS, DEV_PASSWORD, 4);
    await upsertUsers(prisma, DEV_USERS, DEV_PASSWORD, 4);

    const bios = Object.fromEntries(
      (await prisma.user.findMany()).map(({ username, bio }) => [
        username,
        bio,
      ]),
    );
    expect(Object.keys(bios).sort()).toEqual(['admin', 'ana', 'bruno']);
    expect(bios.ana).toBeTruthy();
    expect(bios.bruno).toBeTruthy();
    expect(bios.admin).toBeNull();
  });

  it('falla con un mensaje claro si falta un propietario', async () => {
    await expect(upsertDemoItems(prisma, [])).rejects.toThrow(
      'Falta el propietario',
    );
  });
});

// Solicitudes de ejemplo (US-04.02 a US-04.04) – revisado por Alex Matos, 03/11/2026
describe('solicitudes de la demo', () => {
  const TODAY = new Date('2026-11-03T22:30:00.000Z');

  async function seedWithReservations() {
    const ownerIds = await seedDemo();
    await upsertDemoReservations(prisma, ownerIds, TODAY);
    return ownerIds;
  }

  it('crea cada solicitud con su objeto, arrendatario, fechas, importe y estado', async () => {
    const userIds = await seedWithReservations();

    const reservations = await prisma.reservation.findMany({
      include: { item: true },
    });
    expect(reservations).toHaveLength(DEMO_RESERVATIONS.length);

    for (const demo of DEMO_RESERVATIONS) {
      const reservation = reservations.find(
        ({ item }) => item.title === demo.item.title,
      );
      expect(reservation?.item.ownerId).toBe(userIds[demo.item.owner]);
      expect(reservation?.renterId).toBe(userIds[demo.renter]);
      expect(reservation?.status).toBe(demo.status);
      expect(reservation?.totalPrice.toFixed(2)).toBe(
        reservation?.item.dailyPrice.times(demo.days).toFixed(2),
      );
      const start = new Date(Date.UTC(2026, 10, 3 + demo.startInDays));
      const end = new Date(
        Date.UTC(2026, 10, 3 + demo.startInDays + demo.days - 1),
      );
      expect(reservation?.startDate).toEqual(start);
      expect(reservation?.endDate).toEqual(end);
    }
  });

  it('nadie solicita su propio objeto y hay pendientes en las dos direcciones', async () => {
    const userIds = await seedWithReservations();

    for (const demo of DEMO_RESERVATIONS) {
      expect(demo.renter).not.toBe(demo.item.owner);
    }
    for (const [owner, renter] of [
      [0, 1],
      [1, 0],
    ]) {
      expect(
        await prisma.reservation.count({
          where: {
            status: 'pending',
            renterId: userIds[renter],
            item: { ownerId: userIds[owner] },
          },
        }),
      ).toBeGreaterThan(0);
    }
  });

  it('se puede repetir: no duplica y vuelve a dejar el estado del catálogo', async () => {
    const userIds = await seedWithReservations();
    await prisma.reservation.updateMany({ data: { status: 'accepted' } });

    await upsertDemoReservations(prisma, userIds, TODAY);

    expect(await prisma.reservation.count()).toBe(DEMO_RESERVATIONS.length);
    expect(
      await prisma.reservation.count({ where: { status: 'pending' } }),
    ).toBe(
      DEMO_RESERVATIONS.filter(({ status }) => status === 'pending').length,
    );
  });

  it('falla con un mensaje claro si no se han creado antes los objetos', async () => {
    const userIds = await upsertUsers(prisma, DEMO_USERS, DEMO_PASSWORD, 4);

    await expect(
      upsertDemoReservations(prisma, userIds, TODAY),
    ).rejects.toThrow('crea antes los objetos');
  });

  // Pagos (US-07.01, #284) – revisado por Francesc Curto, 11/11/2026
  it('las pendientes tienen el importe bloqueado y 48 h para responder, la pagada su pago y las demás ninguno', async () => {
    await seedWithReservations();

    const reservations = await prisma.reservation.findMany({
      include: { payment: true, item: true },
    });
    const twoDays = 48 * 60 * 60 * 1000;

    for (const reservation of reservations) {
      const { payment, item } = reservation;

      if (reservation.status === 'pending' || reservation.status === 'paid') {
        expect(payment?.status).toBe(
          reservation.status === 'paid' ? 'paid' : 'authorized',
        );
        expect(payment?.rentalAmount.toFixed(2)).toBe(
          reservation.totalPrice.toFixed(2),
        );
        expect(payment?.depositAmount.toFixed(2)).toBe(item.deposit.toFixed(2));
        // Sin fianza (el carro, 0 €) no hay estado de fianza.
        expect(payment?.depositStatus).toBe(
          item.deposit.gte(0.5) ? 'pending' : null,
        );
        // Pagos sin pasarela: la T10 no debe llamar a Stripe con ellos.
        expect(payment?.rentalReference).toBeNull();
      } else {
        expect(payment).toBeNull();
      }

      expect(reservation.expiresAt?.getTime() ?? null).toBe(
        reservation.status === 'pending' ? TODAY.getTime() + twoDays : null,
      );
    }
  });

  it('repetir el seed deja otra vez sin pagar la solicitud aceptada que se pagó al probar', async () => {
    const userIds = await seedWithReservations();
    const accepted = await prisma.reservation.findFirstOrThrow({
      where: { status: 'accepted' },
      include: { item: true },
    });
    await prisma.reservation.update({
      where: { id: accepted.id },
      data: { status: 'paid' },
    });
    await prisma.payment.create({
      data: {
        reservationId: accepted.id,
        rentalAmount: accepted.totalPrice,
        depositAmount: accepted.item.deposit,
        depositStatus: 'pending',
      },
    });

    await upsertDemoReservations(prisma, userIds, TODAY);

    expect(
      (
        await prisma.reservation.findUniqueOrThrow({
          where: { id: accepted.id },
        })
      ).status,
    ).toBe('accepted');
    expect(
      await prisma.payment.count({ where: { reservationId: accepted.id } }),
    ).toBe(0);
  });

  // Entrega de las solicitudes (US-05.01, #281) – revisado por Alex Matos, 11/11/2026
  it('cada solicitud tiene su entrega, con un modo que el objeto ofrece, y hay uno de cada', async () => {
    await seedWithReservations();

    const reservations = await prisma.reservation.findMany({
      include: { item: true, delivery: { include: { pickupPoint: true } } },
    });
    expect(await prisma.delivery.count()).toBe(DEMO_RESERVATIONS.length);

    for (const reservation of reservations) {
      const offers = {
        home: reservation.item.homeDelivery,
        rider: reservation.item.riderDelivery,
        pickup_point: reservation.item.pickupPointDelivery,
      };
      expect(reservation.deliveryMode, reservation.item.title).not.toBeNull();
      expect(offers[reservation.deliveryMode!], reservation.item.title).toBe(
        true,
      );
      expect(reservation.delivery, reservation.item.title).not.toBeNull();
    }
    expect(
      new Set(reservations.map(({ deliveryMode }) => deliveryMode)),
    ).toEqual(new Set(['home', 'rider', 'pickup_point']));
  });

  it('las entregas por rider llevan la tarifa calculada y las de punto, el punto', async () => {
    await seedWithReservations();

    const deliveries = await prisma.delivery.findMany({
      include: { pickupPoint: true, reservation: { include: { item: true } } },
    });
    for (const delivery of deliveries) {
      const { deliveryMode, item } = delivery.reservation;
      if (deliveryMode === 'rider') {
        expect(delivery.fee?.toFixed(2)).toBe(
          quoteRiderFee(item.neighborhood, delivery.deliveryNeighborhood!).fee,
        );
        expect(delivery.deliveryAddress).toBeTruthy();
        expect(delivery.pickupPoint).toBeNull();
      } else if (deliveryMode === 'pickup_point') {
        expect(delivery.pickupPoint).not.toBeNull();
        expect(delivery.fee).toBeNull();
      } else {
        expect(delivery.pickupPointId).toBeNull();
        expect(delivery.fee).toBeNull();
      }
    }
  });

  it('repetir el seed no duplica las entregas y las deja como en el catálogo', async () => {
    const userIds = await seedWithReservations();
    await prisma.delivery.updateMany({ data: { slot: '19:00-21:00' } });

    await upsertDemoReservations(prisma, userIds, TODAY);

    expect(await prisma.delivery.count()).toBe(DEMO_RESERVATIONS.length);
    expect(
      await prisma.delivery.count({ where: { slot: '19:00-21:00' } }),
    ).toBe(0);
  });
});

describe('demanda de fechas de la demo (US-04.07, #311)', () => {
  it('deja 6 solicitudes pendientes de vecinos distintos que coinciden el día 10', async () => {
    const ownerIds = await seedDemo();
    const neighbourIds = await upsertUsers(
      prisma,
      demandNeighbours('demo.rentit.test'),
      DEMO_PASSWORD,
      4,
    );
    const today = new Date('2026-12-01T10:00:00.000Z');

    // Dos veces: repetir el seed no duplica nada.
    await upsertDemoDemand(prisma, ownerIds, neighbourIds, today);
    await upsertDemoDemand(prisma, ownerIds, neighbourIds, today);

    const requests = await prisma.reservation.findMany({
      where: { renterId: { in: neighbourIds } },
    });
    const day10 = new Date('2026-12-11T00:00:00.000Z').getTime();

    // Todas sobre la bici de bruno o jordi: ningún e2e la retira ni la solicita (las pendientes
    // impedirían retirarla, #110).
    const item = await prisma.item.findFirstOrThrow({
      where: {
        ownerId: ownerIds[DEMO_DEMAND_ITEM.owner],
        title: 'Bicicleta de montaña talla M',
      },
    });

    expect(requests).toHaveLength(6);
    expect(requests.every(({ itemId }) => itemId === item.id)).toBe(true);
    expect(new Set(requests.map(({ renterId }) => renterId)).size).toBe(6);
    expect(requests.every(({ status }) => status === 'pending')).toBe(true);
    expect(
      requests.filter(
        ({ startDate, endDate }) =>
          startDate.getTime() <= day10 && endDate.getTime() >= day10,
      ),
    ).toHaveLength(6);
  });

  it('falla con un mensaje claro si faltan los vecinos', async () => {
    const ownerIds = await seedDemo();

    await expect(upsertDemoDemand(prisma, ownerIds, [])).rejects.toThrow(
      'Falta el vecino 1',
    );
  });
});

// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
describe('riders de la demo (US-10.03)', () => {
  async function seedRiders() {
    await upsertUsers(prisma, [DEMO_ADMIN], DEMO_PASSWORD, 4);
    return upsertDemoRiders(
      prisma,
      DEMO_PASSWORD,
      4,
      PRODUCTION_DEMO_RIDERS,
      DEMO_ADMIN.email,
    );
  }

  it('crea un rider pendiente, uno aceptado y uno rechazado con la contraseña de la demo', async () => {
    expect(await seedRiders()).toBe(3);

    const riders = await prisma.user.findMany({
      where: { isRider: true },
      include: { riderApplication: true },
      orderBy: { username: 'asc' },
    });
    expect(
      riders.map(({ email, riderApplication }) => [
        email,
        riderApplication?.status,
      ]),
    ).toEqual([
      ['bruna@demo.rentit.test', 'rejected'],
      ['nuria@demo.rentit.test', 'pending'],
      ['pau@demo.rentit.test', 'approved'],
    ]);
    for (const rider of riders) {
      expect(await bcrypt.compare(DEMO_PASSWORD, rider.passwordHash)).toBe(
        true,
      );
    }
  });

  it('repetir el seed no duplica las cuentas ni las solicitudes', async () => {
    await seedRiders();
    await seedRiders();

    expect(await prisma.user.count({ where: { isRider: true } })).toBe(3);
    expect(await prisma.riderApplication.count()).toBe(3);
    expect(await prisma.user.count({ where: { role: 'admin' } })).toBe(1);
  });
});

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
describe('admin de la demo (US-11.03)', () => {
  async function seedAdminAndRiders() {
    await upsertUsers(prisma, [DEMO_ADMIN], DEMO_PASSWORD, 4);
    await upsertDemoRiders(
      prisma,
      DEMO_PASSWORD,
      4,
      PRODUCTION_DEMO_RIDERS,
      DEMO_ADMIN.email,
    );
  }

  it('existe con rol admin y la contraseña de la demo, y no es dueño de la demo de objetos', async () => {
    await seedAdminAndRiders();

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@demo.rentit.test' },
    });
    expect(admin).toMatchObject({ username: 'admin', role: 'admin' });
    expect(await bcrypt.compare(DEMO_PASSWORD, admin.passwordHash)).toBe(true);
    expect(DEMO_USERS.map(({ email }) => email)).not.toContain(admin.email);
  });

  it('las solicitudes resueltas las revisó el admin; la pendiente, nadie', async () => {
    await seedAdminAndRiders();

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: DEMO_ADMIN.email },
    });
    const applications = await prisma.riderApplication.findMany();

    for (const application of applications) {
      if (application.status === 'pending') {
        expect(application.reviewedById).toBeNull();
        expect(application.reviewedAt).toBeNull();
      } else {
        expect(application.reviewedById).toBe(admin.id);
        expect(application.reviewedAt).toBeInstanceOf(Date);
      }
    }
    expect(
      applications.find(({ status }) => status === 'rejected')?.rejectionReason,
    ).toBeTruthy();
  });
});

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 13/11/2026
describe('objeto retirado por el admin en la demo (US-11.03)', () => {
  async function seedWithModeration() {
    const ownerIds = await seedDemo();
    await upsertUsers(prisma, [DEMO_ADMIN], DEMO_PASSWORD, 4);
    await upsertDemoModerations(prisma, ownerIds, DEMO_ADMIN.email);
    return ownerIds;
  }

  it('el objeto queda retirado, con su motivo y el admin de la demo', async () => {
    const ownerIds = await seedWithModeration();

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: DEMO_ADMIN.email },
    });
    const moderations = await prisma.itemModeration.findMany({
      include: { item: true },
    });
    expect(moderations).toHaveLength(DEMO_MODERATIONS.length);

    for (const demo of DEMO_MODERATIONS) {
      const moderation = moderations.find(
        ({ item }) => item.title === demo.item.title,
      );
      expect(moderation?.item.ownerId).toBe(ownerIds[demo.item.owner]);
      expect(moderation?.item.status).toBe('withdrawn');
      expect(moderation?.adminId).toBe(admin.id);
      expect(moderation?.reason).toBe(demo.reason);
      expect(moderation?.details).toBe(demo.details);
    }
  });

  it('no tiene reservas activas y se puede repetir sin duplicar', async () => {
    const ownerIds = await seedWithModeration();
    await prisma.itemModeration.updateMany({ data: { reason: 'other' } });

    await upsertDemoModerations(prisma, ownerIds, DEMO_ADMIN.email);

    expect(await prisma.itemModeration.count()).toBe(DEMO_MODERATIONS.length);
    expect((await prisma.itemModeration.findFirstOrThrow()).reason).toBe(
      DEMO_MODERATIONS[0]?.reason,
    );
    expect(
      await prisma.reservation.count({
        where: { item: { moderation: { isNot: null } } },
      }),
    ).toBe(0);
  });

  it('falla con un mensaje claro si falta el admin o el objeto', async () => {
    const ownerIds = await seedDemo();
    await expect(
      upsertDemoModerations(prisma, ownerIds, DEMO_ADMIN.email),
    ).rejects.toThrow('No existe el admin');

    await resetDb();
    await upsertUsers(prisma, [DEMO_ADMIN], DEMO_PASSWORD, 4);
    await expect(
      upsertDemoModerations(prisma, [], DEMO_ADMIN.email),
    ).rejects.toThrow('crea antes los objetos');
  });
});
