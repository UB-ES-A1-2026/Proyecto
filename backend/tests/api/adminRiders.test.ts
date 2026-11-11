// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { ADMIN_ONLY_MESSAGE } from '../../src/services/adminService.js';
import {
  ALREADY_REVIEWED_MESSAGE,
  APPLICATION_NOT_FOUND_MESSAGE,
  INVALID_REASON_MESSAGE,
  INVALID_STATUS_MESSAGE,
} from '../../src/services/riderReviewService.js';
import { isApprovedRider } from '../../src/services/riderService.js';
import { resetDb } from '../helpers/db.js';
import {
  createTestAdmin,
  createTestRider,
  createTestUser,
  TEST_PASSWORD,
} from '../helpers/users.js';

// Revisión de las solicitudes de rider por un admin (US-11.03, #317).

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

async function adminToken() {
  const admin = await createTestAdmin();
  return { admin, token: await loginAs(admin.email) };
}

async function applicationOf(userId: string) {
  return prisma.riderApplication.findUniqueOrThrow({ where: { userId } });
}

function list(token?: string, query = '') {
  const call = request(app).get(`/api/admin/riders${query}`);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

function decide(
  action: 'aceptar' | 'rechazar',
  id: string,
  token?: string,
  body?: object,
) {
  const call = request(app).post(`/api/admin/riders/${id}/${action}`);
  if (token) call.set('Authorization', `Bearer ${token}`);
  return body ? call.send(body) : call;
}

describe('acceso: solo un admin', () => {
  it.each([
    ['GET /api/admin/riders', () => list],
    [
      'POST aceptar',
      () => (token?: string) => decide('aceptar', UNKNOWN_ID, token),
    ],
    [
      'POST rechazar',
      () => (token?: string) => decide('rechazar', UNKNOWN_ID, token),
    ],
  ])('%s: 401 sin sesión', async (_name, build) => {
    const response = await build()();

    expect(response.status).toBe(401);
  });

  it.each([
    ['GET /api/admin/riders', () => list],
    [
      'POST aceptar',
      () => (token?: string) => decide('aceptar', UNKNOWN_ID, token),
    ],
    [
      'POST rechazar',
      () => (token?: string) => decide('rechazar', UNKNOWN_ID, token),
    ],
  ])('%s: 403 si no es admin', async (_name, build) => {
    await createTestUser();
    const token = await loginAs('ana@rentit.test');

    const response = await build()(token);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: ADMIN_ONLY_MESSAGE });
  });

  it('un rider aprobado tampoco puede revisar', async () => {
    await createTestRider('approved');
    const token = await loginAs('rider@rentit.test');

    expect((await list(token)).status).toBe(403);
  });

  it('el 403 llega antes que la validación del motivo y del id', async () => {
    await createTestUser();
    const token = await loginAs('ana@rentit.test');

    const response = await decide('rechazar', 'no-es-uuid', token, {
      reason: 'x'.repeat(501),
    });

    expect(response.status).toBe(403);
  });
});

describe('GET /api/admin/riders', () => {
  it('por defecto lista las pendientes, de la más antigua a la más nueva, con su forma', async () => {
    const { token } = await adminToken();
    const newer = await createTestRider('pending', {
      username: 'nueva',
      email: 'nueva@rentit.test',
      createdAt: new Date('2026-11-10T10:00:00.000Z'),
    });
    const older = await createTestRider('pending', {
      username: 'vieja',
      email: 'vieja@rentit.test',
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
    });
    await createTestRider('approved', {
      username: 'otra',
      email: 'otra@rentit.test',
    });

    const response = await list(token);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(
      response.body.map(({ username }: { username: string }) => username),
    ).toEqual(['vieja', 'nueva']);
    const application = await applicationOf(older.id);
    expect(response.body[0]).toEqual({
      id: application.id,
      username: 'vieja',
      email: 'vieja@rentit.test',
      phone: '612345678',
      zone: 'Gràcia',
      vehicle: 'bike',
      days: ['monday', 'friday'],
      slots: ['morning'],
      createdAt: '2026-11-01T10:00:00.000Z',
      status: 'pending',
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    });
    expect(response.body[1].id).toBe((await applicationOf(newer.id)).id);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('sin solicitudes devuelve una lista vacía', async () => {
    const { token } = await adminToken();

    const response = await list(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('filtra por estado y ordena las resueltas por fecha de revisión descendente', async () => {
    const { admin, token } = await adminToken();
    const first = await createTestRider('rejected', {
      username: 'uno',
      email: 'uno@rentit.test',
      reviewedById: admin.id,
      rejectionReason: 'Sin cobertura.',
    });
    const second = await createTestRider('rejected', {
      username: 'dos',
      email: 'dos@rentit.test',
      reviewedById: admin.id,
    });
    await createTestRider('approved', {
      username: 'tres',
      email: 'tres@rentit.test',
      reviewedById: admin.id,
    });
    await createTestRider('pending', {
      username: 'cuatro',
      email: 'cuatro@rentit.test',
    });
    await prisma.riderApplication.update({
      where: { userId: first.id },
      data: { reviewedAt: new Date('2026-11-05T10:00:00.000Z') },
    });
    await prisma.riderApplication.update({
      where: { userId: second.id },
      data: { reviewedAt: new Date('2026-11-09T10:00:00.000Z') },
    });

    const rejected = await list(token, '?estado=rechazada');
    const approved = await list(token, '?estado=aceptada');

    expect(rejected.status).toBe(200);
    expect(
      rejected.body.map(({ username }: { username: string }) => username),
    ).toEqual(['dos', 'uno']);
    expect(rejected.body[1]).toMatchObject({
      status: 'rejected',
      reviewedAt: '2026-11-05T10:00:00.000Z',
      reviewedBy: { id: admin.id, username: 'admin' },
      rejectionReason: 'Sin cobertura.',
    });
    expect(approved.body).toHaveLength(1);
    expect(approved.body[0]).toMatchObject({
      username: 'tres',
      status: 'approved',
      reviewedBy: { id: admin.id, username: 'admin' },
    });
  });

  it.each(['otra', '', 'APROBADA'])(
    'estado «%s» no válido: 400 con el campo estado',
    async (estado) => {
      const { token } = await adminToken();

      const response = await list(token, `?estado=${estado}`);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: INVALID_STATUS_MESSAGE,
        field: 'estado',
      });
    },
  );

  it('un estado repetido (array) tampoco es válido', async () => {
    const { token } = await adminToken();

    const response = await list(token, '?estado=pendiente&estado=aceptada');

    expect(response.status).toBe(400);
  });
});

describe('POST /api/admin/riders/:id/aceptar', () => {
  it('acepta: la cuenta pasa a rider aprobado y se guarda quién y cuándo', async () => {
    const { admin, token } = await adminToken();
    const rider = await createTestRider('pending');
    const { id } = await applicationOf(rider.id);
    expect(await isApprovedRider(rider.id)).toBe(false);

    const response = await decide('aceptar', id, token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id,
      username: 'rider',
      email: 'rider@rentit.test',
      phone: '612345678',
      zone: 'Gràcia',
      vehicle: 'bike',
      days: ['monday', 'friday'],
      slots: ['morning'],
      createdAt: expect.any(String),
      status: 'approved',
      reviewedAt: expect.any(String),
      reviewedBy: { id: admin.id, username: 'admin' },
      rejectionReason: null,
    });
    expect(await isApprovedRider(rider.id)).toBe(true);
    expect((await applicationOf(rider.id)).reviewedById).toBe(admin.id);
  });

  it('ignora un motivo enviado al aceptar', async () => {
    const { token } = await adminToken();
    const rider = await createTestRider('pending');
    const { id } = await applicationOf(rider.id);

    const response = await decide('aceptar', id, token, {
      reason: 'no debería guardarse',
    });

    expect(response.status).toBe(200);
    expect(response.body.rejectionReason).toBeNull();
  });

  it('404 con un id desconocido o que no es un UUID', async () => {
    const { token } = await adminToken();

    for (const id of [UNKNOWN_ID, 'no-es-uuid']) {
      const response = await decide('aceptar', id, token);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: APPLICATION_NOT_FOUND_MESSAGE });
    }
  });

  it('409 si ya estaba aceptada y no cambia la revisión original', async () => {
    const { admin, token } = await adminToken();
    const rider = await createTestRider('pending');
    const { id } = await applicationOf(rider.id);
    await decide('aceptar', id, token);
    const before = await applicationOf(rider.id);
    const other = await createTestAdmin({
      username: 'otro',
      email: 'otro@rentit.test',
    });

    const response = await decide('aceptar', id, await loginAs(other.email));

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: ALREADY_REVIEWED_MESSAGE });
    expect(await applicationOf(rider.id)).toEqual(before);
    expect(before.reviewedById).toBe(admin.id);
  });
});

describe('POST /api/admin/riders/:id/rechazar', () => {
  it('rechaza con motivo: la cuenta queda rechazada y el motivo se recorta', async () => {
    const { admin, token } = await adminToken();
    const rider = await createTestRider('pending');
    const { id } = await applicationOf(rider.id);

    const response = await decide('rechazar', id, token, {
      reason: '  Zona sin cobertura.  ',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id,
      status: 'rejected',
      reviewedBy: { id: admin.id, username: 'admin' },
      rejectionReason: 'Zona sin cobertura.',
    });
    expect(response.body.reviewedAt).toEqual(expect.any(String));
    expect(await isApprovedRider(rider.id)).toBe(false);
    expect((await applicationOf(rider.id)).status).toBe('rejected');
  });

  it.each([
    ['sin cuerpo', undefined],
    ['con cuerpo vacío', {}],
    ['con motivo vacío', { reason: '' }],
    ['con motivo en blanco', { reason: '   ' }],
    ['con motivo null', { reason: null }],
  ])('rechaza %s: el motivo queda en null', async (_case, body) => {
    const { token } = await adminToken();
    const rider = await createTestRider('pending');
    const { id } = await applicationOf(rider.id);

    const response = await decide('rechazar', id, token, body);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('rejected');
    expect(response.body.rejectionReason).toBeNull();
  });

  it('acepta un motivo de 500 caracteres', async () => {
    const { token } = await adminToken();
    const rider = await createTestRider('pending');
    const { id } = await applicationOf(rider.id);

    const response = await decide('rechazar', id, token, {
      reason: 'x'.repeat(500),
    });

    expect(response.status).toBe(200);
    expect(response.body.rejectionReason).toHaveLength(500);
  });

  it.each([['x'.repeat(501)], [42], [['a']]])(
    'motivo no válido (%#): 400 con el campo reason y sin tocar la solicitud',
    async (reason) => {
      const { token } = await adminToken();
      const rider = await createTestRider('pending');
      const { id } = await applicationOf(rider.id);

      const response = await decide('rechazar', id, token, { reason });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: INVALID_REASON_MESSAGE,
        field: 'reason',
      });
      expect((await applicationOf(rider.id)).status).toBe('pending');
    },
  );

  it('404 con un id desconocido o que no es un UUID', async () => {
    const { token } = await adminToken();

    for (const id of [UNKNOWN_ID, 'no-es-uuid']) {
      const response = await decide('rechazar', id, token);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: APPLICATION_NOT_FOUND_MESSAGE });
    }
  });

  it('409 si ya estaba aceptada: sigue aceptada y sin motivo', async () => {
    const { token } = await adminToken();
    const rider = await createTestRider('pending');
    const { id } = await applicationOf(rider.id);
    await decide('aceptar', id, token);

    const response = await decide('rechazar', id, token, { reason: 'tarde' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: ALREADY_REVIEWED_MESSAGE });
    const application = await applicationOf(rider.id);
    expect(application.status).toBe('approved');
    expect(application.rejectionReason).toBeNull();
    expect(await isApprovedRider(rider.id)).toBe(true);
  });

  it('409 si ya estaba rechazada', async () => {
    const { token } = await adminToken();
    const rider = await createTestRider('pending');
    const { id } = await applicationOf(rider.id);
    await decide('rechazar', id, token, { reason: 'primero' });

    const response = await decide('rechazar', id, token, { reason: 'segundo' });

    expect(response.status).toBe(409);
    expect((await applicationOf(rider.id)).rejectionReason).toBe('primero');
  });
});

describe('resolver dos veces a la vez', () => {
  it.each([
    ['aceptar', 'aceptar'],
    ['rechazar', 'rechazar'],
    ['aceptar', 'rechazar'],
  ] as const)(
    '%s y %s en paralelo: una sola gana (200) y la otra recibe 409',
    async (first, second) => {
      const { token } = await adminToken();
      const other = await createTestAdmin({
        username: 'otro',
        email: 'otro@rentit.test',
      });
      const otherToken = await loginAs(other.email);
      const rider = await createTestRider('pending');
      const { id } = await applicationOf(rider.id);

      const responses = await Promise.all([
        decide(first, id, token),
        decide(second, id, otherToken),
      ]);

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
      const winner = responses.find(({ status }) => status === 200)!;
      expect((await applicationOf(rider.id)).status).toBe(winner.body.status);
    },
  );
});

describe('el rider ve el resultado en su perfil', () => {
  it('tras rechazarla con motivo, /usuarios/me muestra el motivo', async () => {
    const { token } = await adminToken();
    const rider = await createTestRider('pending');
    const { id } = await applicationOf(rider.id);
    await decide('rechazar', id, token, { reason: 'Zona sin cobertura.' });

    const response = await request(app)
      .get('/api/usuarios/me')
      .set('Authorization', `Bearer ${await loginAs('rider@rentit.test')}`);

    expect(response.body).toMatchObject({
      isRider: true,
      riderStatus: 'rejected',
      riderRejectionReason: 'Zona sin cobertura.',
    });
  });

  it('tras aceptarla, /usuarios/me no trae motivo', async () => {
    const { token } = await adminToken();
    const rider = await createTestRider('pending');
    const { id } = await applicationOf(rider.id);
    await decide('aceptar', id, token);

    const response = await request(app)
      .get('/api/usuarios/me')
      .set('Authorization', `Bearer ${await loginAs('rider@rentit.test')}`);

    expect(response.body).toMatchObject({
      riderStatus: 'approved',
      riderRejectionReason: null,
    });
  });
});
