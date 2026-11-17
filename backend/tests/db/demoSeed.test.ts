import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_DEMAND_ITEM,
  DEMO_ITEMS,
  DEMO_RESERVATIONS,
} from '../../prisma/demoData.js';
import {
  DEMO_USERS,
  DEV_PASSWORD,
  demandNeighbours,
  PRODUCTION_DEMO_RIDERS,
  demoPasswordError,
  upsertDemoDemand,
  upsertDemoItems,
  upsertDemoReservations,
  upsertDemoRiders,
  upsertUsers,
} from '../../prisma/demoSeed.js';
import { prisma } from '../../src/repositories/prisma.js';
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
