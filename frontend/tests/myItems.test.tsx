import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

const SESSION_KEY = 'rentit.session';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

const ITEMS = [
  {
    id: 'o1',
    title: 'Taladro percutor',
    dailyPrice: '5.50',
    neighborhood: 'Gràcia',
    status: 'published',
  },
  {
    id: 'o2',
    title: 'Tienda de campaña',
    dailyPrice: '12',
    neighborhood: 'Sants',
    status: 'paused',
  },
];

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => handler(String(input)));
}

afterEach(() => localStorage.clear());

describe('pantalla «Mis objetos» (US-02.02, #109)', () => {
  it('sin sesión redirige al login', () => {
    const { router } = renderRoute('/mis-objetos');

    expect(router.state.location.pathname).toBe('/login');
  });

  it('pide los objetos con el token y los muestra con su precio y estado', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    const fetchMock = mockFetch(() => Response.json(ITEMS));

    renderRoute('/mis-objetos');

    expect(screen.getByRole('heading', { level: 1, name: 'Mis objetos' })).toBeInTheDocument();
    expect(screen.getByText('Cargando tus objetos…')).toBeInTheDocument();

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('heading', { name: 'Taladro percutor' })).toBeInTheDocument();
    expect(within(rows[0]).getByText(/5,50\s€/)).toBeInTheDocument();
    expect(within(rows[0]).getByText('Publicado')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Visible en las búsquedas')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Pausado')).toBeInTheDocument();
    expect(
      within(rows[1]).getByText('No aparece en las búsquedas hasta que lo reanudes'),
    ).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/usuarios/me/objetos');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
  });

  it('cada objeto tiene su botón «Editar»', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Response.json(ITEMS));

    renderRoute('/mis-objetos');

    expect(
      await screen.findByRole('button', { name: 'Editar Taladro percutor' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Tienda de campaña' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('los filtros muestran cuántos objetos hay en cada estado y filtran la lista', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Response.json(ITEMS));
    const user = userEvent.setup();

    renderRoute('/mis-objetos');

    const all = await screen.findByRole('button', { name: 'Todos · 2' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Publicados · 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirados · 0' })).toBeInTheDocument();

    const paused = screen.getByRole('button', { name: 'Pausados · 1' });
    await user.click(paused);
    expect(paused).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Tienda de campaña' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retirados · 0' }));
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByText('No tienes objetos en este estado.')).toBeInTheDocument();
  });

  it('avisa si el usuario aún no tiene objetos', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Response.json([]));

    renderRoute('/mis-objetos');

    expect(await screen.findByText('Todavía no has publicado ningún objeto.')).toBeInTheDocument();
  });

  it('muestra el botón «Publicar un objeto», desactivado hasta que exista el formulario', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Response.json([]));

    renderRoute('/mis-objetos');

    expect(await screen.findByRole('button', { name: 'Publicar un objeto' })).toBeDisabled();
  });

  it('si la sesión ya no es válida (401) la borra y vuelve al login', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() =>
      Response.json(
        { error: 'Sesión no válida o caducada. Inicia sesión de nuevo.' },
        { status: 401 },
      ),
    );

    const { router } = renderRoute('/mis-objetos');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('muestra un aviso si no se pueden cargar los objetos', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    renderRoute('/mis-objetos');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se puede conectar con el servidor. Inténtalo más tarde.',
    );
  });
});
