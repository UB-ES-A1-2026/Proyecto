import type { DeliveryMode } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { confirmDeliveryPhotos } from '../helpers/statePhotos.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';
import { publish } from '../../src/services/realtimeService.js';

// El canal en tiempo real de verdad, pero espiado: así se comprueba a quién avisa y con qué.
vi.mock('../../src/services/realtimeService.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/services/realtimeService.js')
    >();
  return { ...actual, publish: vi.fn(actual.publish) };
});

// Seguimiento de la entrega (US-05.02, #288): un test por cada caso del contrato.
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 18/11/2026

const CODE = '048213';

beforeEach(async () => {
  await resetDb();
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

// ana es la propietaria, bruno el arrendatario y rita la rider. La reserva está pagada y, con
// rider, rita ya ha aceptado el trabajo (eso lo hará US-10.01).
// Con `photos: false`, el propietario aún no ha confirmado las fotos de la entrega (US-09.02).
async function setUp(
  mode: DeliveryMode = 'rider',
  { photos = true }: { photos?: boolean } = {},
) {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const rider = await createTestUser({
    username: 'rita',
    email: 'rita@rentit.test',
  });
  const item = await createTestItem(owner.id, {
    homeDelivery: true,
    riderDelivery: true,
    pickupPointDelivery: true,
  });
  // Los puntos de recogida los crea la migración.
  const point = await prisma.pickupPoint.findFirstOrThrow();
  const reservation = await createTestReservation(item.id, renter.id, {
    status: 'paid',
  });
  const withRider = mode === 'rider';
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      deliveryMode: mode,
      delivery: {
        create: withRider
          ? {
              riderId: rider.id,
              deliveryCode: CODE,
              status: 'assigned',
              assignedAt: new Date(),
            }
          : mode === 'pickup_point'
            ? { pickupPointId: point.id }
            : {},
      },
    },
  });

  if (photos) await confirmDeliveryPhotos(reservation.id, owner.id);

  return {
    reservation,
    owner,
    renter,
    item,
    point,
    rider,
    renterToken: await loginAs('bruno@rentit.test'),
    ownerToken: await loginAs('ana@rentit.test'),
    riderToken: await loginAs('rita@rentit.test'),
  };
}

function track(id: string, token?: string) {
  const call = request(app).get(`/api/entregas/${id}`);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

describe('GET /api/entregas/:id', () => {
  it('shows the renter the rider steps in order and the delivery code', async () => {
    const { reservation, rider, owner, renter, item, renterToken } =
      await setUp();

    const response = await track(reservation.id, renterToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      reservationId: reservation.id,
      role: 'renter',
      item: { id: item.id, title: item.title },
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      slot: 'asap',
      renter: { id: renter.id, username: 'bruno' },
      owner: { id: owner.id, username: 'ana' },
      pickupAddress: null,
      reservationStatus: 'paid',
      mode: 'rider',
      status: 'assigned',
      steps: [
        { status: 'assigned', at: expect.any(String) },
        { status: 'picked_up', at: null },
        { status: 'on_the_way', at: null },
        { status: 'delivered', at: null },
      ],
      returnedAt: null,
      rider: { id: rider.id, username: 'rita' },
      deliveryCode: CODE,
      deliveryPhotosConfirmed: true,
    });
  });

  it('never shows the code to the owner or the rider', async () => {
    const { reservation, ownerToken, riderToken } = await setUp();

    const asOwner = await track(reservation.id, ownerToken);
    const asRider = await track(reservation.id, riderToken);

    expect(asOwner.status).toBe(200);
    expect(asOwner.body.deliveryCode).toBeNull();
    expect(asRider.status).toBe(200);
    expect(asRider.body.deliveryCode).toBeNull();
  });

  it('tells the renter where to pick the object up, and nobody else', async () => {
    const home = await setUp('home');
    const asRenter = await track(home.reservation.id, home.renterToken);
    const asOwner = await track(home.reservation.id, home.ownerToken);

    expect(asRenter.body.role).toBe('renter');
    expect(asRenter.body.pickupAddress).toBe('Carrer de Prova, 1');
    expect(asOwner.body.role).toBe('owner');
    expect(asOwner.body.pickupAddress).toBeNull();
  });

  it('with a pickup point, the address is the point name and address', async () => {
    const { reservation, point, renterToken } = await setUp('pickup_point');

    const response = await track(reservation.id, renterToken);

    expect(response.body.pickupAddress).toBe(`${point.name}, ${point.address}`);
    expect(response.body.slot).toBeNull();
  });

  it('hides the code once the object has been delivered', async () => {
    const { reservation, renterToken } = await setUp();
    await prisma.delivery.update({
      where: { reservationId: reservation.id },
      data: { status: 'delivered', deliveredAt: new Date() },
    });

    const response = await track(reservation.id, renterToken);

    expect(response.body.deliveryCode).toBeNull();
  });

  it.each(['home', 'pickup_point'] as const)(
    'with %s delivery the steps are pending and delivered, without code',
    async (mode) => {
      const { reservation, renterToken } = await setUp(mode);

      const response = await track(reservation.id, renterToken);

      expect(response.status).toBe(200);
      expect(response.body.steps).toEqual([
        { status: 'pending', at: null },
        { status: 'delivered', at: null },
      ]);
      expect(response.body.rider).toBeNull();
      expect(response.body.deliveryCode).toBeNull();
    },
  );

  it('returns 401 without a session', async () => {
    const { reservation } = await setUp();

    expect((await track(reservation.id)).status).toBe(401);
  });

  it('returns 403 to someone outside the reservation', async () => {
    const { reservation } = await setUp();
    await createTestUser({ username: 'carla', email: 'carla@rentit.test' });
    const token = await loginAs('carla@rentit.test');

    const response = await track(reservation.id, token);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error:
        'Solo las personas de esta reserva y su rider pueden ver la entrega.',
    });
  });

  it.each(['00000000-0000-0000-0000-000000000000', 'no-es-un-id'])(
    'returns 404 when the reservation %s does not exist',
    async (id) => {
      const { renterToken } = await setUp();

      expect((await track(id, renterToken)).status).toBe(404);
    },
  );

  it('returns 404 for a reservation without delivery (before US-05.01)', async () => {
    const { reservation, renterToken } = await setUp();
    const old = await createTestReservation(
      reservation.itemId,
      reservation.renterId,
      { startDate: '2026-12-20', endDate: '2026-12-21' },
    );

    const response = await track(old.id, renterToken);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'No hemos encontrado esta entrega.',
    });
  });
});

function advance(id: string, body: unknown, token?: string) {
  const call = request(app)
    .post(`/api/entregas/${id}/estado`)
    .send(body as object);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

describe('POST /api/entregas/:id/estado', () => {
  it('lets the rider advance the steps in order, saving the time of each', async () => {
    const { reservation, riderToken } = await setUp();

    const pickedUp = await advance(
      reservation.id,
      { status: 'picked_up' },
      riderToken,
    );
    const onTheWay = await advance(
      reservation.id,
      { status: 'on_the_way' },
      riderToken,
    );

    expect(pickedUp.status).toBe(200);
    expect(pickedUp.body.status).toBe('picked_up');
    expect(onTheWay.status).toBe(200);
    expect(onTheWay.body.status).toBe('on_the_way');
    expect(onTheWay.body.steps).toEqual([
      { status: 'assigned', at: expect.any(String) },
      { status: 'picked_up', at: expect.any(String) },
      { status: 'on_the_way', at: expect.any(String) },
      { status: 'delivered', at: null },
    ]);
  });

  it('returns 409 when skipping a step or going back', async () => {
    const { reservation, riderToken } = await setUp();

    const skip = await advance(
      reservation.id,
      { status: 'on_the_way' },
      riderToken,
    );
    await advance(reservation.id, { status: 'picked_up' }, riderToken);
    const again = await advance(
      reservation.id,
      { status: 'picked_up' },
      riderToken,
    );

    expect(skip.status).toBe(409);
    expect(skip.body).toEqual({
      error:
        'La entrega no puede pasar a ese estado: los estados van en orden.',
    });
    expect(again.status).toBe(409);
  });

  it('only changes once on a double click', async () => {
    const { reservation, riderToken } = await setUp();

    const responses = await Promise.all([
      advance(reservation.id, { status: 'picked_up' }, riderToken),
      advance(reservation.id, { status: 'picked_up' }, riderToken),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
  });

  it('returns 403 when the renter or the owner try to advance it', async () => {
    const { reservation, renterToken, ownerToken } = await setUp();

    const byRenter = await advance(
      reservation.id,
      { status: 'picked_up' },
      renterToken,
    );
    const byOwner = await advance(
      reservation.id,
      { status: 'picked_up' },
      ownerToken,
    );

    expect(byRenter.status).toBe(403);
    expect(byRenter.body).toEqual({
      error: 'Solo el rider de esta entrega puede cambiar su estado.',
    });
    expect(byOwner.status).toBe(403);
  });

  it('returns 403 for a delivery without rider', async () => {
    const { reservation, renterToken } = await setUp('home');

    const response = await advance(
      reservation.id,
      { status: 'picked_up' },
      renterToken,
    );

    expect(response.status).toBe(403);
  });

  it('returns 409 while the reservation is not paid', async () => {
    const { reservation, riderToken } = await setUp();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'accepted' },
    });

    const response = await advance(
      reservation.id,
      { status: 'picked_up' },
      riderToken,
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'La entrega empieza cuando la reserva está pagada.',
    });
  });

  it.each([undefined, 'flying', 3])(
    'returns 400 when the status is %j',
    async (status) => {
      const { reservation, riderToken } = await setUp();

      const response = await advance(reservation.id, { status }, riderToken);

      expect(response.status).toBe(400);
      expect(response.body.field).toBe('status');
    },
  );

  it('returns 401 without a session', async () => {
    const { reservation } = await setUp();

    const response = await advance(reservation.id, { status: 'picked_up' });

    expect(response.status).toBe(401);
  });
});

// Lleva la entrega hasta «En camino», el paso anterior a «Entregada».
async function onTheWay(id: string, riderToken: string) {
  await advance(id, { status: 'picked_up' }, riderToken);
  await advance(id, { status: 'on_the_way' }, riderToken);
}

function deliver(id: string, code: unknown, token: string) {
  return advance(id, { status: 'delivered', code }, token);
}

describe('fotos del estado obligatorias antes de entregar (US-09.02, #454)', () => {
  it('tells the three of them whether the delivery photos are confirmed', async () => {
    const { reservation, renterToken, ownerToken, riderToken } = await setUp(
      'rider',
      { photos: false },
    );

    for (const token of [renterToken, ownerToken, riderToken]) {
      const response = await track(reservation.id, token);
      expect(response.status).toBe(200);
      expect(response.body.deliveryPhotosConfirmed).toBe(false);
    }
  });

  it('returns 409 when the rider picks it up before the owner confirms the photos', async () => {
    const { reservation, riderToken } = await setUp('rider', { photos: false });

    const response = await advance(
      reservation.id,
      { status: 'picked_up' },
      riderToken,
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'El propietario todavía no ha subido las fotos del estado.',
    });
    const delivery = await prisma.delivery.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(delivery.status).toBe('assigned');
  });

  it.each(['home', 'pickup_point'] as const)(
    'with %s delivery, «Ya tengo el objeto» returns 409 until the photos are confirmed',
    async (mode) => {
      const { reservation, renterToken, owner } = await setUp(mode, {
        photos: false,
      });
      // Una foto subida pero sin confirmar no basta.
      await prisma.statePhoto.create({
        data: {
          reservationId: reservation.id,
          uploadedById: owner.id,
          phase: 'delivery',
          key: `reservas/${reservation.id}/entrega/sin-confirmar.jpg`,
          order: 1,
        },
      });

      const response = await request(app)
        .post(`/api/entregas/${reservation.id}/recibida`)
        .set('Authorization', `Bearer ${renterToken}`);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: 'El propietario todavía no ha subido las fotos del estado.',
      });
      const saved = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      expect(saved.status).toBe('paid');
    },
  );
});

describe('POST /api/entregas/:id/estado con el código de entrega', () => {
  it('with the right code marks it delivered and the reservation in progress', async () => {
    const { reservation, riderToken } = await setUp();
    await onTheWay(reservation.id, riderToken);

    const response = await deliver(reservation.id, CODE, riderToken);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('delivered');
    expect(response.body.reservationStatus).toBe('in_progress');
    expect(response.body.steps[3]).toEqual({
      status: 'delivered',
      at: expect.any(String),
    });
  });

  it('with a wrong code returns 400, counts the attempt and changes nothing', async () => {
    const { reservation, riderToken } = await setUp();
    await onTheWay(reservation.id, riderToken);

    const response = await deliver(reservation.id, '111111', riderToken);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'El código no es correcto. Te quedan 4 intentos.',
      field: 'code',
    });
    const delivery = await prisma.delivery.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(delivery.status).toBe('on_the_way');
    expect(delivery.codeAttempts).toBe(1);
  });

  it('locks the code after 5 wrong attempts, even if the 6th is right', async () => {
    const { reservation, riderToken } = await setUp();
    await onTheWay(reservation.id, riderToken);

    const wrong = [];
    for (let i = 0; i < 5; i += 1) {
      wrong.push(await deliver(reservation.id, '111111', riderToken));
    }
    const right = await deliver(reservation.id, CODE, riderToken);

    expect(wrong[3]?.body.error).toBe(
      'El código no es correcto. Te queda 1 intento.',
    );
    expect(wrong[4]?.body.error).toBe(
      'El código se ha bloqueado tras 5 intentos fallidos.',
    );
    expect(right.status).toBe(409);
    expect(right.body.field).toBe('code');
  });

  it.each([undefined, '12345', '1234567', 'abcdef', 123456])(
    'returns 400 without counting an attempt when the code is %j',
    async (code) => {
      const { reservation, riderToken } = await setUp();
      await onTheWay(reservation.id, riderToken);

      const response = await deliver(reservation.id, code, riderToken);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'El código de entrega tiene 6 cifras.',
        field: 'code',
      });
      const delivery = await prisma.delivery.findUniqueOrThrow({
        where: { reservationId: reservation.id },
      });
      expect(delivery.codeAttempts).toBe(0);
    },
  );

  it('returns 409 when marking it delivered before «En camino»', async () => {
    const { reservation, riderToken } = await setUp();

    const response = await deliver(reservation.id, CODE, riderToken);

    expect(response.status).toBe(409);
  });

  it('only delivers once on a double click', async () => {
    const { reservation, riderToken } = await setUp();
    await onTheWay(reservation.id, riderToken);

    const responses = await Promise.all([
      deliver(reservation.id, CODE, riderToken),
      deliver(reservation.id, CODE, riderToken),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const saved = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(saved.status).toBe('in_progress');
  });
});

function received(id: string, token?: string) {
  const call = request(app).post(`/api/entregas/${id}/recibida`);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

describe('POST /api/entregas/:id/recibida («Ya tengo el objeto»)', () => {
  it.each(['home', 'pickup_point'] as const)(
    'with %s delivery the renter marks it delivered and the reservation is in progress',
    async (mode) => {
      const { reservation, renterToken } = await setUp(mode);

      const response = await received(reservation.id, renterToken);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('delivered');
      expect(response.body.reservationStatus).toBe('in_progress');
      expect(response.body.steps).toEqual([
        { status: 'pending', at: null },
        { status: 'delivered', at: expect.any(String) },
      ]);
    },
  );

  it('returns 403 when the owner tries to mark it', async () => {
    const { reservation, ownerToken } = await setUp('home');

    const response = await received(reservation.id, ownerToken);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Solo el arrendatario puede marcar este paso.',
    });
  });

  it('returns 409 with rider: the rider marks it with the code', async () => {
    const { reservation, renterToken } = await setUp('rider');

    const response = await received(reservation.id, renterToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Con rider, la entrega la marca el rider con tu código.',
    });
  });

  it('returns 409 while the reservation is not paid', async () => {
    const { reservation, renterToken } = await setUp('home');
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'accepted' },
    });

    expect((await received(reservation.id, renterToken)).status).toBe(409);
  });

  it('only changes once on a double click', async () => {
    const { reservation, renterToken } = await setUp('home');

    const responses = await Promise.all([
      received(reservation.id, renterToken),
      received(reservation.id, renterToken),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
  });

  it('returns 401 without a session', async () => {
    const { reservation } = await setUp('home');

    expect((await received(reservation.id)).status).toBe(401);
  });
});

function returned(id: string, token?: string) {
  const call = request(app).post(`/api/entregas/${id}/devuelta`);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

// Reserva «En curso»: con domicilio, el arrendatario ya ha marcado «Ya tengo el objeto».
async function inProgress() {
  const data = await setUp('home');
  await received(data.reservation.id, data.renterToken);
  return data;
}

describe('POST /api/entregas/:id/devuelta («He devuelto el objeto»)', () => {
  it('finishes the reservation and saves the time of the return', async () => {
    const { reservation, renterToken } = await inProgress();

    const response = await returned(reservation.id, renterToken);

    expect(response.status).toBe(200);
    expect(response.body.reservationStatus).toBe('finished');
    expect(response.body.returnedAt).toEqual(expect.any(String));
  });

  it('returns 409 while the reservation is not in progress', async () => {
    const { reservation, renterToken } = await setUp('home');

    const response = await returned(reservation.id, renterToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error:
        'Solo puedes marcar «He devuelto el objeto» con el alquiler en curso.',
    });
  });

  it('returns 403 when the owner tries to mark it', async () => {
    const { reservation, ownerToken } = await inProgress();

    const response = await returned(reservation.id, ownerToken);

    expect(response.status).toBe(403);
  });

  it('only finishes once on a double click', async () => {
    const { reservation, renterToken } = await inProgress();

    const responses = await Promise.all([
      returned(reservation.id, renterToken),
      returned(reservation.id, renterToken),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
  });

  it('returns 401 without a session', async () => {
    const { reservation } = await inProgress();

    expect((await returned(reservation.id)).status).toBe(401);
  });
});

describe('aviso en tiempo real al cambiar el estado', () => {
  beforeEach(() => {
    vi.mocked(publish).mockClear();
  });

  it('tells the renter, the owner and the rider, without the code', async () => {
    const { reservation, rider, renterToken, riderToken } = await setUp();
    const { renterId } = reservation;
    void renterToken;

    await advance(reservation.id, { status: 'picked_up' }, riderToken);

    const owner = await prisma.item.findUniqueOrThrow({
      where: { id: reservation.itemId },
    });
    expect(vi.mocked(publish)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publish)).toHaveBeenCalledWith(
      [renterId, owner.ownerId, rider.id],
      'entrega.estado',
      {
        reservationId: reservation.id,
        status: 'picked_up',
        at: expect.any(String),
      },
    );
    expect(JSON.stringify(vi.mocked(publish).mock.calls)).not.toContain(CODE);
  });

  it('does not notify anything when the change is rejected', async () => {
    const { reservation, riderToken } = await setUp();

    await advance(reservation.id, { status: 'on_the_way' }, riderToken);

    expect(vi.mocked(publish)).not.toHaveBeenCalled();
  });

  it('notifies «Ya tengo el objeto» and «He devuelto el objeto» without rider', async () => {
    const { reservation, renterToken } = await setUp('home');

    await received(reservation.id, renterToken);
    await returned(reservation.id, renterToken);

    const statuses = vi
      .mocked(publish)
      .mock.calls.map(([userIds, , data]) => [
        userIds.length,
        (data as { status: string }).status,
      ]);
    expect(statuses).toEqual([
      [2, 'delivered'],
      [2, 'finished'],
    ]);
  });
});

function renewCode(id: string, token?: string) {
  const call = request(app).post(`/api/entregas/${id}/codigo`);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

describe('POST /api/entregas/:id/codigo (código nuevo)', () => {
  it('after locking the code, the renter gets a new one and the rider can deliver with it', async () => {
    const { reservation, renterToken, riderToken } = await setUp();
    await onTheWay(reservation.id, riderToken);
    for (let i = 0; i < 5; i += 1) {
      await deliver(reservation.id, '111111', riderToken);
    }

    const renewed = await renewCode(reservation.id, renterToken);

    expect(renewed.status).toBe(200);
    const newCode = renewed.body.deliveryCode as string;
    expect(newCode).toMatch(/^[0-9]{6}$/);
    const delivery = await prisma.delivery.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(delivery.codeAttempts).toBe(0);
    expect(delivery.deliveryCode).toBe(newCode);

    const delivered = await deliver(reservation.id, newCode, riderToken);
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe('delivered');
  });

  it('notifies the rider that the code has changed, without sending it', async () => {
    const { reservation, renterToken } = await setUp();
    vi.mocked(publish).mockClear();

    const renewed = await renewCode(reservation.id, renterToken);

    expect(vi.mocked(publish)).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(publish).mock.calls)).not.toContain(
      renewed.body.deliveryCode,
    );
  });

  it('returns 403 when the rider or the owner try to change it', async () => {
    const { reservation, riderToken, ownerToken } = await setUp();

    expect((await renewCode(reservation.id, riderToken)).status).toBe(403);
    expect((await renewCode(reservation.id, ownerToken)).status).toBe(403);
  });

  it('returns 409 without rider: there is no code', async () => {
    const { reservation, renterToken } = await setUp('home');

    const response = await renewCode(reservation.id, renterToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Solo hay código de entrega con rider.',
    });
  });

  it('returns 409 once the object has been delivered', async () => {
    const { reservation, renterToken, riderToken } = await setUp();
    await onTheWay(reservation.id, riderToken);
    await deliver(reservation.id, CODE, riderToken);

    const response = await renewCode(reservation.id, renterToken);

    expect(response.status).toBe(409);
  });

  it('returns 401 without a session', async () => {
    const { reservation } = await setUp();

    expect((await renewCode(reservation.id)).status).toBe(401);
  });
});
