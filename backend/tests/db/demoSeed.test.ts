import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_DEMAND_ITEM,
  DEMO_ITEMS,
  DEMO_RESERVATIONS,
} from '../../prisma/demoData.js';
import {
  DEMO_USERS,
  DEV_USERS,
  DEV_PASSWORD,
  demandNeighbours,
  PRODUCTION_DEMO_RIDERS,
  demoPasswordError,
  upsertDemoDemand,
  upsertDemoItems,
  upsertDemoReservations,
  upsertDemoRiders,
  upsertUsers,
  assignDemoRider,
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

  it('deja un alquiler finalizado de ana sin valorar, también al repetir el seed', async () => {
    const userIds = await seedWithReservations();
    const finished = await prisma.reservation.findFirstOrThrow({
      where: { status: 'finished', renterId: userIds[0] },
      include: { item: true },
    });
    expect(finished.endDate.getTime()).toBeLessThan(TODAY.getTime());
    // ana la valora al probar la demo…
    await prisma.rating.create({
      data: {
        reservationId: finished.id,
        authorId: finished.renterId,
        ratedUserId: finished.item.ownerId,
        type: 'rental',
        score: 5,
      },
    });

    // …y repetir el seed la deja otra vez sin valorar.
    await upsertDemoReservations(prisma, userIds, TODAY);

    expect(await prisma.rating.count()).toBe(0);
  });

  it('hay una reserva pagada de cada modo, con la entrega pendiente, y repetir el seed reinicia el seguimiento', async () => {
    const userIds = await seedWithReservations();
    const paidReservations = await prisma.reservation.findMany({
      where: { status: 'paid' },
      include: { delivery: true },
    });
    expect(
      paidReservations.map(({ deliveryMode }) => deliveryMode).sort(),
    ).toEqual(['home', 'pickup_point', 'rider']);
    for (const reservation of paidReservations) {
      expect(reservation.delivery?.status).toBe('pending');
    }
    const paid = paidReservations.find(
      ({ deliveryMode }) => deliveryMode === 'pickup_point',
    )!;
    expect(paid.delivery?.status).toBe('pending');
    // ana la recibe y la devuelve al probar la demo…
    await prisma.reservation.update({
      where: { id: paid.id },
      data: { status: 'finished' },
    });
    await prisma.delivery.update({
      where: { reservationId: paid.id },
      data: { status: 'delivered', deliveredAt: TODAY, returnedAt: TODAY },
    });

    // …y repetir el seed la deja otra vez pagada y con la entrega pendiente.
    await upsertDemoReservations(prisma, userIds, TODAY);

    const again = await prisma.reservation.findUniqueOrThrow({
      where: { id: paid.id },
      include: { delivery: true },
    });
    expect(again.status).toBe('paid');
    expect(again.delivery).toMatchObject({
      status: 'pending',
      deliveredAt: null,
      returnedAt: null,
      codeAttempts: 0,
    });
  });

  it('las entregas con rider tienen su código de 6 cifras', async () => {
    await seedWithReservations();

    const riderDeliveries = await prisma.delivery.findMany({
      where: { reservation: { deliveryMode: 'rider' } },
    });

    expect(riderDeliveries.length).toBeGreaterThan(0);
    for (const delivery of riderDeliveries) {
      expect(delivery.deliveryCode).toMatch(/^[0-9]{6}$/);
    }
  });

  it('asigna el rider aceptado a la reserva pagada con rider, también al repetir el seed', async () => {
    const userIds = await seedWithReservations();
    await upsertDemoRiders(prisma, DEMO_PASSWORD, 4);

    expect(
      await assignDemoRider(prisma, userIds, 'dani@rentit.test', TODAY),
    ).toBe(1);
    const assigned = await prisma.delivery.findFirstOrThrow({
      where: { riderId: { not: null } },
      include: { rider: true, reservation: { include: { item: true } } },
    });
    expect(assigned.reservation.item.title).toBe('Hidrolimpiadora Kärcher');
    expect(assigned.rider?.username).toBe('dani');
    expect(assigned).toMatchObject({ status: 'assigned', assignedAt: TODAY });

    // Repetir el seed reinicia la entrega y la vuelve a asignar: sigue habiendo una sola.
    await upsertDemoReservations(prisma, userIds, TODAY);
    await assignDemoRider(prisma, userIds, 'dani@rentit.test', TODAY);
    expect(
      await prisma.delivery.count({ where: { riderId: { not: null } } }),
    ).toBe(1);
  });

  it('falla con un mensaje claro si el rider de la demo no existe', async () => {
    const userIds = await seedWithReservations();

    await expect(
      assignDemoRider(prisma, userIds, 'nadie@rentit.test', TODAY),
    ).rejects.toThrow('crea antes los riders');
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
    return upsertDemoRiders(prisma, DEMO_PASSWORD, 4, PRODUCTION_DEMO_RIDERS);
  }

  it('crea un rider pendiente y uno aceptado con la contraseña de la demo', async () => {
    expect(await seedRiders()).toBe(2);

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

    expect(await prisma.user.count({ where: { isRider: true } })).toBe(2);
    expect(await prisma.riderApplication.count()).toBe(2);
  });
});
