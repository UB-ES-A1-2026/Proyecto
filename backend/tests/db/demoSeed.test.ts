import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_DEMAND_ITEM,
  DEMO_ITEMS,
  DEMO_MODERATIONS,
  DEMO_RESERVATIONS,
  DEMO_RIDER_JOBS,
} from '../../prisma/demoData.js';
import {
  DEMO_ADMIN,
  DEMO_USERS,
  DEV_ADMIN_EMAIL,
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
  assignDemoRider,
  upsertDemoRiderJobs,
} from '../../prisma/demoSeed.js';
import { prisma } from '../../src/repositories/prisma.js';
import { quoteRiderFee } from '../../src/services/deliveryFee.js';
import { isKnownNeighborhood } from '../../src/services/neighborhoods.js';
import { resetDb } from '../helpers/db.js';
import { createTestAdmin } from '../helpers/users.js';

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
    // Las tres del seguimiento; las pagadas de cancelar (US-04.05) no se tocan aquí.
    const paidReservations = await prisma.reservation.findMany({
      where: {
        status: 'paid',
        item: {
          title: {
            in: [
              'Bicicleta de montaña talla M',
              'Cortacésped eléctrico',
              'Hidrolimpiadora Kärcher',
            ],
          },
        },
      },
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

  it('las tres pagadas del seguimiento tienen confirmadas las fotos de la entrega y la tabla de paddle no (US-09.02)', async () => {
    const userIds = await seedWithReservations();
    const photosOf = async (title: string) => {
      const reservation = await prisma.reservation.findFirstOrThrow({
        where: { status: 'paid', item: { title } },
        include: { statePhotos: true },
      });
      return { id: reservation.id, photos: reservation.statePhotos };
    };

    for (const title of [
      'Bicicleta de montaña talla M',
      'Cortacésped eléctrico',
      'Hidrolimpiadora Kärcher',
    ]) {
      const { photos } = await photosOf(title);
      expect(photos.length, title).toBeGreaterThan(0);
      for (const photo of photos) {
        expect(photo.phase).toBe('delivery');
        expect(photo.confirmedAt).not.toBeNull();
      }
    }
    const paddle = await photosOf('Tabla de paddle surf hinchable');
    expect(paddle.photos).toEqual([]);

    // Marta sube una foto a la tabla de paddle al probar la demo…
    await prisma.statePhoto.create({
      data: {
        reservationId: paddle.id,
        uploadedById: userIds[2]!,
        phase: 'delivery',
        key: `reservas/${paddle.id}/entrega/probando.jpg`,
        order: 1,
      },
    });
    // …y repetir el seed la quita y deja igual las demás.
    await upsertDemoReservations(prisma, userIds, TODAY);
    expect((await photosOf('Tabla de paddle surf hinchable')).photos).toEqual(
      [],
    );
    expect(
      (await photosOf('Cortacésped eléctrico')).photos.length,
    ).toBeGreaterThan(0);
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
    // Las solicitudes resueltas las revisa el admin del seed (US-11.03).
    await createTestAdmin({ email: DEV_ADMIN_EMAIL });
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
  it('las pendientes tienen el importe bloqueado y 48 h para responder, la pagada y la cancelada su pago y las demás ninguno', async () => {
    await seedWithReservations();

    const reservations = await prisma.reservation.findMany({
      include: { payment: true, item: true },
    });
    const twoDays = 48 * 60 * 60 * 1000;

    for (const reservation of reservations) {
      const { payment, item } = reservation;

      if (
        reservation.status === 'pending' ||
        reservation.status === 'paid' ||
        reservation.status === 'cancelled'
      ) {
        expect(payment?.status).toBe(
          { pending: 'authorized', paid: 'paid', cancelled: 'refunded' }[
            reservation.status
          ],
        );
        expect(payment?.rentalAmount.toFixed(2)).toBe(
          reservation.totalPrice.toFixed(2),
        );
        expect(payment?.depositAmount.toFixed(2)).toBe(item.deposit.toFixed(2));
        // Sin fianza (el carro, 0 €) no hay estado de fianza.
        expect(payment?.depositStatus).toBe(
          item.deposit.gte(0.5)
            ? reservation.status === 'cancelled'
              ? 'released'
              : 'pending'
            : null,
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

  // Cancelaciones (US-04.05, #308) – revisado por Alex Matos, 17/11/2026
  it('hay una reserva ya cancelada con su cancelación, y las pagadas para cancelar con y sin penalización', async () => {
    const userIds = await seedWithReservations();

    const cancelled = await prisma.reservation.findMany({
      where: { status: 'cancelled' },
      include: { cancellation: true, item: true },
    });
    expect(cancelled).toHaveLength(1);
    const [reservation] = cancelled;
    expect(reservation?.cancellation?.cancelledById).toBe(userIds[1]);
    expect(reservation?.cancellation?.penaltyPercent).toBe(35);
    // 2 días de la tienda (8 €/día): 16 €, el 35 % son 5,60 € y se devuelven 10,40 €.
    expect(reservation?.cancellation?.penaltyAmount.toFixed(2)).toBe('5.60');
    expect(reservation?.cancellation?.refundAmount.toFixed(2)).toBe('10.40');

    // Las no canceladas no llevan cancelación.
    expect(await prisma.cancellation.count()).toBe(1);

    // Una pagada a 8 días o más (sin penalización) y otra a 3–7 días (35 %), contando desde hoy.
    const paid = await prisma.reservation.findMany({
      where: { status: 'paid' },
    });
    const daysLeft = paid.map(({ startDate }) =>
      Math.round((startDate.getTime() - Date.UTC(2026, 10, 3)) / 86_400_000),
    );
    expect(daysLeft.some((days) => days >= 8)).toBe(true);
    expect(daysLeft.some((days) => days >= 3 && days <= 7)).toBe(true);
  });

  it('una reserva cancelada no ocupa las fechas del objeto', async () => {
    await seedWithReservations();

    const { item, startDate } = await prisma.reservation.findFirstOrThrow({
      where: { status: 'cancelled' },
      include: { item: true },
    });

    expect(item.title).toBe('Tienda de campaña para 4 personas');
    expect(
      await prisma.reservation.count({
        where: {
          itemId: item.id,
          startDate,
          status: { in: ['accepted', 'paid', 'in_progress'] },
        },
      }),
    ).toBe(0);
  });

  it('repetir el seed deja otra vez cancelada y pagada lo que se haya cambiado al probar', async () => {
    const userIds = await seedWithReservations();
    const cancelled = await prisma.reservation.findFirstOrThrow({
      where: { status: 'cancelled' },
    });
    const paid = await prisma.reservation.findFirstOrThrow({
      where: { status: 'paid' },
    });
    // Como si se hubiera cancelado la pagada y «descancelado» la cancelada.
    await prisma.reservation.update({
      where: { id: cancelled.id },
      data: { status: 'accepted' },
    });
    await prisma.cancellation.deleteMany({
      where: { reservationId: cancelled.id },
    });
    await prisma.reservation.update({
      where: { id: paid.id },
      data: { status: 'cancelled' },
    });
    await prisma.cancellation.create({
      data: {
        reservationId: paid.id,
        cancelledById: userIds[0] as string,
        penaltyPercent: 0,
        penaltyAmount: 0,
        refundAmount: 10,
      },
    });

    await upsertDemoReservations(prisma, userIds, TODAY);

    expect(
      (
        await prisma.reservation.findUniqueOrThrow({
          where: { id: cancelled.id },
        })
      ).status,
    ).toBe('cancelled');
    expect(
      (await prisma.reservation.findUniqueOrThrow({ where: { id: paid.id } }))
        .status,
    ).toBe('paid');
    expect(await prisma.cancellation.count()).toBe(1);
    expect(
      await prisma.cancellation.count({
        where: { reservationId: cancelled.id },
      }),
    ).toBe(1);
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

  it('crea un rider pendiente, dos aceptados y uno rechazado con la contraseña de la demo', async () => {
    expect(await seedRiders()).toBe(4);

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
      ['ona@demo.rentit.test', 'approved'],
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

    expect(await prisma.user.count({ where: { isRider: true } })).toBe(4);
    expect(await prisma.riderApplication.count()).toBe(4);
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

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 21/11/2026
describe('trabajos de rider de la demo (US-10.01, #292)', () => {
  const TODAY = new Date('2026-11-21T10:00:00.000Z');

  async function seedJobs() {
    const ownerIds = await seedDemo();
    await upsertDemoReservations(prisma, ownerIds, TODAY);
    const neighbourIds = await upsertUsers(
      prisma,
      demandNeighbours('demo.rentit.test'),
      DEMO_PASSWORD,
      4,
    );
    await upsertDemoDemand(prisma, ownerIds, neighbourIds, TODAY);
    await upsertDemoRiderJobs(prisma, ownerIds, neighbourIds, TODAY);
    return { ownerIds, neighbourIds };
  }

  // Los de DEMO_RIDER_JOBS (la hidrolimpiadora también va con rider, pero el seed le asigna dani).
  function availableJobs() {
    return prisma.reservation.findMany({
      where: {
        item: { title: { in: DEMO_RIDER_JOBS.map(({ item }) => item.title) } },
        status: 'paid',
        deliveryMode: 'rider',
        delivery: { riderId: null, status: 'pending' },
      },
      include: { item: true, delivery: true, payment: true },
    });
  }

  it('deja dos trabajos disponibles: pagados, con rider, sin rider y desde mañana', async () => {
    const { ownerIds, neighbourIds } = await seedJobs();

    const jobs = await availableJobs();

    expect(jobs.map(({ item }) => item.title).sort()).toEqual(
      DEMO_RIDER_JOBS.map(({ item }) => item.title).sort(),
    );
    for (const job of jobs) {
      const demo = DEMO_RIDER_JOBS.find(
        ({ item }) => item.title === job.item.title,
      )!;
      expect(job.item.ownerId).toBe(ownerIds[demo.item.owner]);
      expect(job.renterId).toBe(neighbourIds[demo.neighbour]);
      expect(job.item.riderDelivery).toBe(true);
      expect(job.startDate).toEqual(
        new Date(Date.UTC(2026, 10, 21 + demo.startInDays)),
      );
      expect(job.delivery).toMatchObject({
        slot: demo.delivery.slot,
        deliveryAddress: demo.delivery.address,
        deliveryNeighborhood: demo.delivery.neighborhood,
        assignedAt: null,
      });
      expect(job.delivery?.fee?.toFixed(2)).toBe(
        quoteRiderFee(job.item.neighborhood, demo.delivery.neighborhood).fee,
      );
      expect(job.delivery?.deliveryCode).toMatch(/^[0-9]{6}$/);
      expect(job.payment?.status).toBe('paid');
    }
  });

  it('usa objetos que no tiene ninguna otra reserva de la demo', async () => {
    await seedJobs();

    for (const { item } of DEMO_RIDER_JOBS) {
      expect(
        await prisma.reservation.count({
          where: { item: { title: item.title } },
        }),
        item.title,
      ).toBe(1);
    }
  });

  it('repetir el seed vuelve a dejarlos disponibles y no duplica nada', async () => {
    const { ownerIds, neighbourIds } = await seedJobs();
    // Los riders resueltos los revisa el admin de la demo (US-11.03).
    await upsertUsers(prisma, [DEMO_ADMIN], DEMO_PASSWORD, 4);
    await upsertDemoRiders(
      prisma,
      DEMO_PASSWORD,
      4,
      PRODUCTION_DEMO_RIDERS,
      DEMO_ADMIN.email,
    );
    const pau = await prisma.user.findUniqueOrThrow({
      where: { email: 'pau@demo.rentit.test' },
    });
    const reservationCount = await prisma.reservation.count();
    // pau acepta los dos trabajos al probar la demo…
    await prisma.delivery.updateMany({
      where: {
        reservation: { renterId: { in: neighbourIds }, status: 'paid' },
      },
      data: { riderId: pau.id, status: 'assigned', assignedAt: TODAY },
    });
    expect(await availableJobs()).toHaveLength(0);

    // …y repetir el seed los deja otra vez sin rider.
    await upsertDemoRiderJobs(prisma, ownerIds, neighbourIds, TODAY);

    expect(await availableJobs()).toHaveLength(DEMO_RIDER_JOBS.length);
    expect(await prisma.reservation.count()).toBe(reservationCount);
  });

  it('falla con un mensaje claro si faltan los vecinos', async () => {
    const ownerIds = await seedDemo();

    await expect(upsertDemoRiderJobs(prisma, ownerIds, [])).rejects.toThrow(
      'Faltan usuarios para el trabajo de rider',
    );
  });
});
