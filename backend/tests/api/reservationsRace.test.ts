// Dos segundos pasos del 3D Secure con el mismo PaymentIntent (US-07.01, T10 #285): el bloqueo
// pertenece a la reserva que sí se creó y no se debe soltar.
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import * as reservationRepository from '../../src/repositories/reservationRepository.js';
import { release } from '../../src/services/paymentGateway.js';
import { todayInSpain } from '../../src/services/reservationService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

vi.mock('../../src/services/paymentGateway.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/services/paymentGateway.js')
    >();
  return { ...actual, release: vi.fn(actual.release) };
});

vi.mock(
  '../../src/repositories/reservationRepository.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../src/repositories/reservationRepository.js')
      >();
    return {
      ...actual,
      isRentalReferenceUsed: vi.fn(actual.isRentalReferenceUsed),
      findReservationConflict: vi.fn(actual.findReservationConflict),
    };
  },
);

function day(offset: number): string {
  const date = new Date(`${todayInSpain()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function setUpWithCreatedReservation() {
  const owner = await createTestUser();
  await createTestUser({ username: 'bruno', email: 'bruno@rentit.test' });
  const item = await createTestItem(owner.id);
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'bruno@rentit.test', password: TEST_PASSWORD });
  const token = login.body.token as string;
  const body = { itemId: item.id, startDate: day(10), endDate: day(12) };
  const post = (extra: object) =>
    request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, ...extra });

  const first = await post({ confirmationTokenId: 'ctoken_3ds' });
  const paymentIntentId = first.body.paymentIntentId as string;
  expect((await post({ paymentIntentId })).status).toBe(201);
  return { post, paymentIntentId };
}

beforeEach(async () => {
  await resetDb();
  vi.mocked(release).mockClear();
});

describe('segundo paso del 3D Secure repetido con el mismo PaymentIntent', () => {
  it('responde 409 sin soltar el bloqueo de la reserva ya creada', async () => {
    const { post, paymentIntentId } = await setUpWithCreatedReservation();

    const again = await post({ paymentIntentId });

    expect(again.status).toBe(409);
    expect(release).not.toHaveBeenCalled();
    expect(await prisma.reservation.count()).toBe(1);
  });

  it('si la carrera pasa la comprobación previa, el conflicto al guardar tampoco lo suelta', async () => {
    const { post, paymentIntentId } = await setUpWithCreatedReservation();
    // La segunda petición llega «a la vez»: cuando comprueba, la primera aún no había guardado.
    vi.mocked(
      reservationRepository.isRentalReferenceUsed,
    ).mockResolvedValueOnce(false);
    vi.mocked(
      reservationRepository.findReservationConflict,
    ).mockResolvedValueOnce(null);

    const again = await post({ paymentIntentId });

    expect(again.status).toBe(409);
    expect(again.body.field).toBe('paymentIntentId');
    expect(release).not.toHaveBeenCalled();
    expect(await prisma.reservation.count()).toBe(1);
  });
});
