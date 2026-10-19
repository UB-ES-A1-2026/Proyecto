import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUserById } = vi.hoisted(() => ({
  findUserById: vi.fn(),
}));

vi.mock('../../src/repositories/userRepository.js', () => ({
  findUserById,
}));

import { getProfile } from '../../src/services/userService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('userService.getProfile', () => {
  it('throws a 401 AppError when the user does not exist', async () => {
    findUserById.mockResolvedValue(null);

    await expect(getProfile('missing-user')).rejects.toMatchObject({
      name: 'AppError',
      status: 401,
      message: 'Sesión no válida o caducada. Inicia sesión de nuevo.',
    });
  });

  it('returns only public profile fields', async () => {
    const createdAt = new Date('2026-10-19T12:00:00.000Z');
    findUserById.mockResolvedValue({
      id: 'user-id',
      username: 'ana',
      email: 'ana@rentit.test',
      role: 'user',
      createdAt,
      passwordHash: 'private-hash',
      status: 'active',
      updatedAt: new Date('2026-10-20T12:00:00.000Z'),
    });

    const profile = await getProfile('user-id');

    expect(profile).toEqual({
      id: 'user-id',
      username: 'ana',
      email: 'ana@rentit.test',
      role: 'user',
      createdAt,
    });
    expect(profile).not.toHaveProperty('passwordHash');
    expect(profile).not.toHaveProperty('status');
    expect(profile).not.toHaveProperty('updatedAt');
  });
});
