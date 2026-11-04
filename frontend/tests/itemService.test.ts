import { afterEach, describe, expect, it, vi } from 'vitest';
import { getItemDetail } from '../src/services/itemService';

afterEach(() => vi.restoreAllMocks());

describe('getItemDetail', () => {
  it('solicita el objeto con el id codificado y sin cabecera de sesión', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 'objeto/1' }));

    await getItemDetail('objeto/1');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/api/objetos/objeto%2F1');
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
  });

  it('envía la sesión solo cuando se proporciona el token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 'objeto-1' }));

    await getItemDetail('objeto-1', 'token-de-prueba');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/api/objetos/objeto-1');
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer token-de-prueba',
    );
  });
});
