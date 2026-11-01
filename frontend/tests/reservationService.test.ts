import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMyReservations } from '../src/services/reservationService';

afterEach(() => vi.restoreAllMocks());

describe('getMyReservations', () => {
  it('solicita las reservas del usuario incluyendo el token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ sent: [], received: [] }));

    await expect(getMyReservations('token-de-prueba')).resolves.toEqual({
      sent: [],
      received: [],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/usuarios/me/reservas');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
  });
});
