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

import { register } from '../../src/services/authService.js';

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
