// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 13/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { ADMIN_ONLY_WITHDRAW_MESSAGE } from '../../src/services/adminService.js';
import {
  ALREADY_WITHDRAWN_BY_ADMIN_MESSAGE,
  INVALID_DETAILS_MESSAGE,
  INVALID_REASON_MESSAGE,
  ITEM_NOT_FOUND_MESSAGE,
} from '../../src/services/adminItemWithdrawService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import {
  createTestAdmin,
  createTestUser,
  TEST_PASSWORD,
} from '../helpers/users.js';

// El admin retira un objeto con motivo (US-11.03, #317).

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

beforeEach(async () => {
  await resetDb();
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

async function setup() {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const admin = await createTestAdmin();
  const item = await createTestItem(owner.id);
  return { owner, renter, admin, item, token: await loginAs(admin.email) };
}

function withdraw(id: string, token?: string, body?: unknown) {
  const call = request(app).post(`/api/admin/objetos/${id}/retirar`);
  if (token) call.set('Authorization', `Bearer ${token}`);
  return body === undefined ? call : call.send(body as object);
}

describe('acceso: solo un admin', () => {
  it('401 sin sesión', async () => {
    const response = await withdraw(UNKNOWN_ID, undefined, { reason: 'scam' });

    expect(response.status).toBe(401);
  });

  it('403 si no es admin, antes de validar nada', async () => {
    const { item } = await setup();
    const token = await loginAs('ana@rentit.test');

    const response = await withdraw(item.id, token, { reason: 'nope' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: ADMIN_ONLY_WITHDRAW_MESSAGE });
    expect(
      (await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).status,
    ).toBe('published');
  });

  it('403 si el admin está bloqueado', async () => {
    const { admin, item, token } = await setup();
    await prisma.user.update({
      where: { id: admin.id },
      data: { status: 'blocked' },
    });

    const response = await withdraw(item.id, token, { reason: 'scam' });

    expect(response.status).toBe(403);
  });
});

describe('validación', () => {
  it.each([undefined, null, 'estafa', 5, 'SCAM'])(
    '400 con el motivo %j',
    async (reason) => {
      const { item, token } = await setup();

      const response = await withdraw(item.id, token, { reason });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: INVALID_REASON_MESSAGE,
        field: 'reason',
      });
    },
  );

  it('400 sin cuerpo', async () => {
    const { item, token } = await setup();

    const response = await withdraw(item.id, token);

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('reason');
  });

  it.each([5, 'x'.repeat(501), '  ' + 'x'.repeat(501)])(
    '400 con detalles no válidos (%j)',
    async (details) => {
      const { item, token } = await setup();

      const response = await withdraw(item.id, token, {
        reason: 'scam',
        details,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: INVALID_DETAILS_MESSAGE,
        field: 'details',
      });
    },
  );

  it.each([undefined, null, '', '   '])(
    '400 con motivo «otro» y detalles %j',
    async (details) => {
      const { item, token } = await setup();

      const response = await withdraw(item.id, token, {
        reason: 'other',
        details,
      });

      expect(response.status).toBe(400);
      expect(response.body.field).toBe('details');
    },
  );

  it('los detalles de 500 caracteres valen y se recortan', async () => {
    const { item, token } = await setup();

    const response = await withdraw(item.id, token, {
      reason: 'scam',
      details: `  ${'x'.repeat(500)}  `,
    });

    expect(response.status).toBe(204);
    const moderation = await prisma.itemModeration.findUniqueOrThrow({
      where: { itemId: item.id },
    });
    expect(moderation.details).toBe('x'.repeat(500));
  });

  it('unos detalles en blanco con otro motivo se guardan como null', async () => {
    const { item, token } = await setup();

    await withdraw(item.id, token, { reason: 'prohibited', details: '   ' });

    const moderation = await prisma.itemModeration.findUniqueOrThrow({
      where: { itemId: item.id },
    });
    expect(moderation.details).toBeNull();
  });

  it('un id que no es UUID da 404', async () => {
    const { token } = await setup();

    const response = await withdraw('no-es-uuid', token, { reason: 'scam' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: ITEM_NOT_FOUND_MESSAGE });
  });

  it('un objeto que no existe da 404', async () => {
    const { token } = await setup();

    const response = await withdraw(UNKNOWN_ID, token, { reason: 'scam' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: ITEM_NOT_FOUND_MESSAGE });
  });
});

describe('retirar', () => {
  it.each(['scam', 'prohibited', 'misleading'] as const)(
    '204 sin cuerpo con el motivo %s: retira y guarda la moderación',
    async (reason) => {
      const { admin, item, token } = await setup();

      const response = await withdraw(item.id, token, {
        reason,
        details: 'Detalle',
      });

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(
        (await prisma.item.findUniqueOrThrow({ where: { id: item.id } }))
          .status,
      ).toBe('withdrawn');
      expect(
        await prisma.itemModeration.findUniqueOrThrow({
          where: { itemId: item.id },
        }),
      ).toMatchObject({ adminId: admin.id, reason, details: 'Detalle' });
    },
  );

  it('con motivo «otro» y detalles retira', async () => {
    const { item, token } = await setup();

    const response = await withdraw(item.id, token, {
      reason: 'other',
      details: 'Incumple las normas',
    });

    expect(response.status).toBe(204);
  });

  it('retira también un objeto pausado', async () => {
    const { owner, token } = await setup();
    const paused = await createTestItem(owner.id, {
      title: 'Pausado',
      status: 'paused',
    });

    expect((await withdraw(paused.id, token, { reason: 'scam' })).status).toBe(
      204,
    );
  });

  it('409 si ya está retirado (por el admin o por su dueño) y no cambia nada', async () => {
    const { owner, token, item } = await setup();
    await withdraw(item.id, token, { reason: 'scam' });
    const byOwner = await createTestItem(owner.id, {
      title: 'Retirado por el dueño',
      status: 'withdrawn',
    });

    const again = await withdraw(item.id, token, { reason: 'prohibited' });
    const other = await withdraw(byOwner.id, token, { reason: 'scam' });

    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: ALREADY_WITHDRAWN_BY_ADMIN_MESSAGE });
    expect(other.status).toBe(409);
    expect(await prisma.itemModeration.count()).toBe(1);
    expect(
      (
        await prisma.itemModeration.findUniqueOrThrow({
          where: { itemId: item.id },
        })
      ).reason,
    ).toBe('scam');
  });

  it('dos retiradas a la vez: solo una gana', async () => {
    const { item, token } = await setup();

    const responses = await Promise.all([
      withdraw(item.id, token, { reason: 'scam' }),
      withdraw(item.id, token, { reason: 'prohibited' }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([204, 409]);
    expect(await prisma.itemModeration.count()).toBe(1);
  });
});

describe('reservas del objeto retirado', () => {
  it('cancela las pendientes y aceptadas con motivo; no toca las demás', async () => {
    const { renter, item, token } = await setup();
    const states = [
      'pending',
      'accepted',
      'rejected',
      'cancelled',
      'paid',
      'in_progress',
      'finished',
    ] as const;
    const reservations = [];
    for (const status of states) {
      reservations.push(
        await createTestReservation(item.id, renter.id, { status }),
      );
    }

    const response = await withdraw(item.id, token, { reason: 'scam' });

    expect(response.status).toBe(204);
    const after = await prisma.reservation.findMany({
      where: { itemId: item.id },
    });
    const byOriginal = new Map(
      reservations.map((reservation, index) => [reservation.id, states[index]]),
    );
    for (const reservation of after) {
      const before = byOriginal.get(reservation.id);
      if (before === 'pending' || before === 'accepted') {
        expect(reservation.status).toBe('cancelled');
        expect(reservation.cancellationReason).toBe('item_withdrawn');
      } else {
        expect(reservation.status).toBe(before);
        expect(reservation.cancellationReason).toBeNull();
      }
    }
  });

  it('no toca las reservas de otros objetos', async () => {
    const { owner, renter, item, token } = await setup();
    const other = await createTestItem(owner.id, { title: 'Otro objeto' });
    const untouched = await createTestReservation(other.id, renter.id);

    await withdraw(item.id, token, { reason: 'scam' });

    expect(
      (
        await prisma.reservation.findUniqueOrThrow({
          where: { id: untouched.id },
        })
      ).status,
    ).toBe('pending');
  });

  it('si falla la retirada (409), las reservas siguen como estaban', async () => {
    const { renter, item, token } = await setup();
    await prisma.item.update({
      where: { id: item.id },
      data: { status: 'withdrawn' },
    });
    const reservation = await createTestReservation(item.id, renter.id);

    const response = await withdraw(item.id, token, { reason: 'scam' });

    expect(response.status).toBe(409);
    expect(
      (
        await prisma.reservation.findUniqueOrThrow({
          where: { id: reservation.id },
        })
      ).status,
    ).toBe('pending');
  });
});
