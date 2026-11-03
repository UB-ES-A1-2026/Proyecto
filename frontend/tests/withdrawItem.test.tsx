import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withdrawItem } from '../src/services/itemService';
import { renderRoute } from './renderRoute';

const SESSION_KEY = 'rentit.session';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

const LIST = [
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
    dailyPrice: '12.00',
    neighborhood: 'Sants',
    status: 'withdrawn',
  },
];

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

// Respuesta 200 de POST /api/objetos/:id/retirar (#110): el objeto con la forma de la lista.
const WITHDRAWN = { ...LIST[0], status: 'withdrawn' };

// La lista responde bien; el POST de retirar lo responde `onWithdraw`.
function mockItemApi(onWithdraw: Handler = () => Response.json(WITHDRAWN)) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/usuarios/me/objetos')) return Response.json(LIST);
    return onWithdraw(url, init);
  });
}

async function openWithdraw() {
  const user = userEvent.setup();
  const view = renderRoute('/mis-objetos');
  await user.click(await screen.findByRole('button', { name: 'Retirar anuncio Taladro percutor' }));
  const dialog = await screen.findByRole('dialog', { name: 'Retirar anuncio' });
  return { user, view, dialog };
}

function itemRow(title: string) {
  const row = screen.getByRole('heading', { name: title }).closest('li');
  if (!row) throw new Error(`No se encuentra la fila de ${title}`);
  return within(row);
}

beforeEach(() => localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION)));
afterEach(() => localStorage.clear());

describe('retirar un anuncio (US-02.03, #111)', () => {
  it('muestra «Retirar anuncio» solo en los objetos que no están retirados', async () => {
    mockItemApi();
    renderRoute('/mis-objetos');

    expect(
      await screen.findByRole('button', { name: 'Retirar anuncio Taladro percutor' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retirar anuncio Tienda de campaña' }),
    ).not.toBeInTheDocument();
  });

  it('pide confirmación antes de retirar', async () => {
    const fetchMock = mockItemApi();
    const { dialog } = await openWithdraw();

    expect(dialog).toHaveTextContent('¿Seguro que quieres retirar «Taladro percutor»?');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('al cancelar no cambia nada y el anuncio sigue publicado', async () => {
    const fetchMock = mockItemApi();
    const { user, dialog } = await openWithdraw();

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(itemRow('Taladro percutor').getByText('Publicado')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('al confirmar lo retira con el token y la fila pasa a «Retirado»', async () => {
    const fetchMock = mockItemApi();
    const { user, dialog } = await openWithdraw();

    await user.click(within(dialog).getByRole('button', { name: 'Retirar anuncio' }));

    expect(await screen.findByRole('status')).toHaveTextContent('El anuncio se ha retirado.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const row = itemRow('Taladro percutor');
    expect(row.getByText('Retirado')).toBeInTheDocument();
    expect(row.queryByRole('button', { name: /Retirar anuncio/ })).not.toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toMatch(/\/objetos\/o1\/retirar$/);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer token-de-prueba' });
    expect(init?.body).toBeUndefined();
  });

  it('si tiene reservas activas avisa con el mensaje de la API y no lo retira', async () => {
    mockItemApi(() =>
      Response.json(
        { error: 'No puedes retirar un objeto con reservas activas.' },
        { status: 409 },
      ),
    );
    const { user, dialog } = await openWithdraw();

    await user.click(within(dialog).getByRole('button', { name: 'Retirar anuncio' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No puedes retirar un objeto con reservas activas.',
    );
    expect(within(dialog).getByRole('button', { name: 'Retirar anuncio' })).toBeEnabled();
    expect(itemRow('Taladro percutor').getByText('Publicado')).toBeInTheDocument();
  });

  it('si ya estaba retirado muestra el aviso de la API', async () => {
    mockItemApi(() => Response.json({ error: 'Este objeto ya está retirado.' }, { status: 409 }));
    const { user, dialog } = await openWithdraw();

    await user.click(within(dialog).getByRole('button', { name: 'Retirar anuncio' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Este objeto ya está retirado.',
    );
  });

  it('si no es el propietario muestra el error de la API', async () => {
    mockItemApi(() =>
      Response.json({ error: 'Solo el propietario puede retirar este objeto.' }, { status: 403 }),
    );
    const { user, dialog } = await openWithdraw();

    await user.click(within(dialog).getByRole('button', { name: 'Retirar anuncio' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Solo el propietario puede retirar este objeto.',
    );
  });

  it('con la sesión caducada lleva al login', async () => {
    mockItemApi(() => Response.json({ error: 'Sesión no válida' }, { status: 401 }));
    const { user, view, dialog } = await openWithdraw();

    await user.click(within(dialog).getByRole('button', { name: 'Retirar anuncio' }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe('/login'));
  });
});

describe('withdrawItem (#111)', () => {
  it('hace POST /objetos/:id/retirar sin cuerpo y devuelve el objeto', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(WITHDRAWN));

    await expect(withdrawItem('token-de-prueba', 'o1')).resolves.toEqual(WITHDRAWN);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/objetos\/o1\/retirar$/);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
  });
});
