import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '../src/services/apiClient';

describe('apiRequest', () => {
  it('envía el token en la cabecera Authorization y el body en JSON', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ok: true }));

    await apiRequest('/auth/login', { method: 'POST', body: { email: 'a@b.c' }, token: 'abc' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/auth/login');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer abc',
    });
    expect(init?.body).toBe('{"email":"a@b.c"}');
  });

  it('convierte la respuesta { error, field } en un ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: 'Email incorrecto', field: 'email' }, { status: 400 }),
    );

    const error = await apiRequest('/auth/login').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: 'Email incorrecto', field: 'email' });
  });

  it('devuelve undefined en un 204', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('lanza un ApiError con estado 0 si no hay conexión', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiRequest('/health')).rejects.toMatchObject({ status: 0 });
  });
});
