import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicProfile } from '../src/services/userService';
import { renderRoute } from './renderRoute';

// Solo hay un perfil, el público (US-01.4): «Mi perfil» y /perfil llevan al de la persona con sesión.
const SESSION_KEY = 'rentit.session';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

function profile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    id: 'u1',
    username: 'ana',
    bio: null,
    photo: null,
    memberSince: '2026-10-18T10:00:00.000Z',
    rating: { average: null, count: 0 },
    items: [],
    isOwnProfile: true,
    ...overrides,
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => handler(String(input), init));
}

afterEach(() => localStorage.clear());

describe('«Mi perfil» es tu perfil público (US-01.4, #301)', () => {
  it('sin sesión /perfil redirige al login', () => {
    const { router } = renderRoute('/perfil');

    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('tras iniciar sesión, /perfil lleva al perfil público propio', async () => {
    mockFetch((url) =>
      url.endsWith('/auth/login') ? Response.json(SESSION) : Response.json(profile()),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/perfil');

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@rentit.test');
    await user.type(screen.getByLabelText('Contraseña'), 'Rentit2026');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/usuarios/u1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'ana' })).toBeInTheDocument();
  });

  it('con sesión, /perfil redirige al perfil público de la cuenta y lo pide con el token', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    const fetchMock = mockFetch(() => Response.json(profile()));

    const { router } = renderRoute('/perfil');

    expect(await screen.findByRole('heading', { level: 1, name: 'ana' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/usuarios/u1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/usuarios/u1');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
  });

  it('en tu perfil ves tu correo, «Editar perfil», «Publicar un objeto» y «Cerrar sesión»', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Response.json(profile()));

    renderRoute('/usuarios/u1');

    expect(await screen.findByText('Tu perfil · así lo ven los demás')).toBeInTheDocument();
    const header = within(screen.getByRole('heading', { level: 1, name: 'ana' }).closest('div')!);
    expect(header.getByText('ana@rentit.test')).toBeInTheDocument();
    expect(header.getByText('solo lo ves tú')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar perfil' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Publicar un objeto' })).toHaveAttribute(
      'href',
      '/objetos/nuevo',
    );
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('en el perfil de otra persona no ves nada de eso, ni su correo', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Response.json(profile({ id: 'u2', username: 'bruno', isOwnProfile: false })));

    const { container } = renderRoute('/usuarios/u2');

    expect(await screen.findByRole('heading', { level: 1, name: 'bruno' })).toBeInTheDocument();
    expect(screen.queryByText('Tu perfil · así lo ven los demás')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar perfil' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Publicar un objeto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('ana@rentit.test');
  });

  it('se puede cerrar sesión aunque el perfil no cargue', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Response.json({ error: 'Algo ha ido mal.' }, { status: 500 }));

    renderRoute('/usuarios/u1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo ha ido mal.');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('si la sesión ya no es válida (401) la borra y enseña el perfil como a un visitante', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch((_url, init) =>
      new Headers(init?.headers).has('Authorization')
        ? Response.json({ error: 'Sesión no válida o caducada.' }, { status: 401 })
        : Response.json(profile({ isOwnProfile: false })),
    );

    renderRoute('/usuarios/u1');

    expect(await screen.findByRole('heading', { level: 1, name: 'ana' })).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar perfil' })).not.toBeInTheDocument();
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
