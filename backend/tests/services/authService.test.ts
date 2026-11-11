import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createUser, findUserByEmail, findUserByUsername } = vi.hoisted(() => ({
  createUser: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserByUsername: vi.fn(),
}));

vi.mock('../../src/repositories/userRepository.js', () => ({
  createUser,
  findUserByEmail,
  findUserByUsername,
}));

vi.mock('../../src/services/sessionService.js', () => ({
  createSession: vi.fn(),
  revokeSession: vi.fn(),
}));

const { closeSession } = vi.hoisted(() => ({ closeSession: vi.fn() }));

vi.mock('../../src/services/realtimeService.js', () => ({ closeSession }));

import { logout, register } from '../../src/services/authService.js';
import { revokeSession } from '../../src/services/sessionService.js';

function uniqueConstraintError(target: string) {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed',
    {
      code: 'P2002',
      clientVersion: Prisma.prismaVersion.client,
      meta: { target: [target] },
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  findUserByEmail.mockResolvedValue(null);
  findUserByUsername.mockResolvedValue(null);
});

describe('authService.register unique constraint conflicts', () => {
  it.each([
    [
      'email',
      {
        error: 'Ya existe una cuenta con este correo electrónico.',
        field: 'email',
      },
    ],
    [
      'username',
      {
        error: 'Este nombre de usuario ya está en uso.',
        field: 'username',
      },
    ],
  ])('converts P2002 for %s to a 409 AppError', async (target, expected) => {
    createUser.mockRejectedValue(uniqueConstraintError(target));

    await expect(
      register({
        username: 'ana',
        email: 'ana@rentit.test',
        password: '12345678',
      }),
    ).rejects.toMatchObject({
      name: 'AppError',
      status: 409,
      message: expected.error,
      field: expected.field,
    });
  });
});

// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
describe('authService.logout', () => {
  it('revokes the session and then closes its realtime streams', async () => {
    const order: string[] = [];
    vi.mocked(revokeSession).mockImplementation(async () => {
      order.push('revoke');
    });
    closeSession.mockImplementation(() => order.push('close'));

    await logout('sesion-1');

    expect(revokeSession).toHaveBeenCalledWith('sesion-1');
    expect(closeSession).toHaveBeenCalledWith('sesion-1');
    expect(order).toEqual(['revoke', 'close']);
  });
});
