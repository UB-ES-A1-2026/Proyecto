import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

const SESSION_KEY = 'rentit.session';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

function mockFetch(logoutResponse: () => Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input).endsWith('/health')) return Response.json({ status: 'ok' });
    return logoutResponse();
  });
}

afterEach(() => localStorage.clear());

describe('cerrar sesión (US-01.3, #104)', () => {
  it('no muestra el botón si no hay sesión', () => {
    mockFetch(() => new Response(null, { status: 204 }));

    renderRoute('/');

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });

  it('invalida la sesión en la API, borra el token y lleva al login', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    const fetchMock = mockFetch(() => new Response(null, { status: 204 }));
    const { router } = renderRoute('/');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    const logoutCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/logout'));
    expect(logoutCall?.[1]?.method).toBe('POST');
    expect(logoutCall?.[1]?.headers).toMatchObject({ Authorization: 'Bearer token-de-prueba' });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });

  it('borra el token del navegador aunque la API responda que la sesión ya no era válida', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() =>
      Response.json(
        { error: 'Sesión no válida o caducada. Inicia sesión de nuevo.' },
        { status: 401 },
      ),
    );
    const { router } = renderRoute('/');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
