// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/errors/appError.js';

const { findUserById } = vi.hoisted(() => ({ findUserById: vi.fn() }));

vi.mock('../../src/repositories/userRepository.js', () => ({ findUserById }));

const { ADMIN_ONLY_MESSAGE, assertAdmin } =
  await import('../../src/services/adminService.js');

beforeEach(() => {
  findUserById.mockReset();
});

describe('assertAdmin', () => {
  it('deja pasar a un admin', async () => {
    findUserById.mockResolvedValue({
      id: 'u1',
      role: 'admin',
      status: 'active',
    });

    await expect(assertAdmin('u1')).resolves.toBeUndefined();
  });

  it.each([
    { id: 'u1', role: 'user', status: 'active' },
    // Un admin bloqueado pierde el acceso aunque su sesión siga abierta.
    { id: 'u1', role: 'admin', status: 'blocked' },
    null,
  ])('responde 403 si el usuario no es admin (%j)', async (user) => {
    findUserById.mockResolvedValue(user);

    await expect(assertAdmin('u1')).rejects.toMatchObject({
      status: 403,
      message: ADMIN_ONLY_MESSAGE,
    });
    await expect(assertAdmin('u1')).rejects.toBeInstanceOf(AppError);
  });
});

describe('mensaje', () => {
  it('es el del contrato', () => {
    expect(ADMIN_ONLY_MESSAGE).toBe(
      'Solo un admin puede revisar las solicitudes de rider.',
    );
  });
});
