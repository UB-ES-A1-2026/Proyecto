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

const PROFILE = {
  id: 'u1',
  username: 'ana',
  email: 'ana@rentit.test',
  role: 'user',
  createdAt: '2026-10-18T10:00:00.000Z',
};

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => handler(String(input)));
}

afterEach(() => localStorage.clear());

describe('pantalla de perfil (US-01.2, #29)', () => {
  it('sin sesión redirige al login', () => {
    const { router } = renderRoute('/perfil');

    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('tras iniciar sesión vuelve al perfil', async () => {
    mockFetch((url) =>
      url.endsWith('/auth/login') ? Response.json(SESSION) : Response.json(PROFILE),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/perfil');

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@rentit.test');
    await user.type(screen.getByLabelText('Contraseña'), 'Rentit2026');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/perfil'));
    expect(await screen.findByText('ana@rentit.test')).toBeInTheDocument();
  });

  it('pide el perfil con el token y muestra los datos de la cuenta', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    const fetchMock = mockFetch(() => Response.json(PROFILE));

    renderRoute('/perfil');

    expect(screen.getByRole('heading', { level: 1, name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.getByText('Cargando tu perfil…')).toBeInTheDocument();
    expect(await screen.findByText('ana@rentit.test')).toBeInTheDocument();
    expect(screen.getByText('ana')).toBeInTheDocument();
    expect(screen.getByText('18 de octubre de 2026')).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/usuarios/me');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
  });

  it('si la sesión ya no es válida (401) la borra y vuelve al login', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() =>
      Response.json(
        { error: 'Sesión no válida o caducada. Inicia sesión de nuevo.' },
        { status: 401 },
      ),
    );

    const { router } = renderRoute('/perfil');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(router.state.location.state).toEqual({ from: '/perfil' });
  });

  it('muestra un aviso si no se puede cargar el perfil', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    renderRoute('/perfil');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se puede conectar con el servidor. Inténtalo más tarde.',
    );
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
  });
});

describe('redirección después del login', () => {
  it('no sale de la aplicación si «from» empieza por //', async () => {
    mockFetch(() => Response.json(SESSION));
    const user = userEvent.setup();
    const { router } = renderRoute({ pathname: '/login', state: { from: '//ejemplo.com' } });

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@rentit.test');
    await user.type(screen.getByLabelText('Contraseña'), 'Rentit2026');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(localStorage.getItem(SESSION_KEY)).not.toBeNull());
    expect(router.state.location.pathname).toBe('/');
  });
});
