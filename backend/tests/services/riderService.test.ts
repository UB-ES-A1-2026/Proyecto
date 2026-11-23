// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertNotRiderAccount,
  isApprovedRider,
} from '../../src/services/riderService.js';
import { resetDb } from '../helpers/db.js';
import { createTestRider, createTestUser } from '../helpers/users.js';

beforeEach(async () => {
  await resetDb();
});

describe('isApprovedRider', () => {
  it('is true only for a rider with an approved application', async () => {
    const approved = await createTestRider('approved');
    expect(await isApprovedRider(approved.id)).toBe(true);
  });

  it.each(['pending', 'rejected'] as const)(
    'is false for a rider whose application is %s',
    async (status) => {
      const rider = await createTestRider(status);
      expect(await isApprovedRider(rider.id)).toBe(false);
    },
  );

  it('is false for a regular user and for an unknown id', async () => {
    const user = await createTestUser();
    expect(await isApprovedRider(user.id)).toBe(false);
    expect(await isApprovedRider(randomUUID())).toBe(false);
  });
});

describe('assertNotRiderAccount', () => {
  it.each(['pending', 'approved', 'rejected'] as const)(
    'throws a 403 for a rider with a %s application',
    async (status) => {
      const rider = await createTestRider(status);

      await expect(assertNotRiderAccount(rider.id)).rejects.toMatchObject({
        name: 'AppError',
        status: 403,
        message:
          'Las cuentas de rider no pueden solicitar ni publicar objetos.',
      });
    },
  );

  it('lets a regular user through', async () => {
    const user = await createTestUser();
    await expect(assertNotRiderAccount(user.id)).resolves.toBeUndefined();
  });
});
