import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/repositories/prisma.js';
import {
  createSession,
  findValidSession,
  hashToken,
  revokeSession,
} from '../../src/services/sessionService.js';
import { resetDb } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

beforeEach(async () => {
  await resetDb();
});

describe('sessionService', () => {
  it('stores only the SHA-256 hash of the token and expires in 7 days', async () => {
    const user = await createTestUser();

    const { token, expiresAt } = await createSession(user.id);
    const stored = await prisma.session.findFirstOrThrow({
      where: { userId: user.id },
    });

    expect(token).toHaveLength(43); // 32 bytes en base64url
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toBe(token);
    const days = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('finds a valid session by its token', async () => {
    const user = await createTestUser();
    const { token } = await createSession(user.id);

    const session = await findValidSession(token);

    expect(session?.userId).toBe(user.id);
  });

  it('returns null for unknown, revoked or expired sessions', async () => {
    const user = await createTestUser();
    const revoked = await createSession(user.id);
    const expired = await createSession(user.id);
    const revokedSession = await findValidSession(revoked.token);
    await revokeSession(revokedSession!.id);
    await prisma.session.update({
      where: { tokenHash: hashToken(expired.token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await findValidSession('token-que-no-existe')).toBeNull();
    expect(await findValidSession(revoked.token)).toBeNull();
    expect(await findValidSession(expired.token)).toBeNull();
  });
});
