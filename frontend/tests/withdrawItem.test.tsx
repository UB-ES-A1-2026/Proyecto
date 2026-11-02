import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changeItemStatus } from '../src/services/itemService';
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

// La lista responde bien; el PATCH del estado lo responde `onWithdraw`.
function mockItemApi(onWithdraw: Handler = () => Response.json({ id: 'o1', status: 'withdrawn' })) {
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
    expect(String(url)).toMatch(/\/objetos\/o1\/estado$/);
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer token-de-prueba' });
    expect(JSON.parse(String(init?.body))).toEqual({ status: 'withdrawn' });
  });

  it('si tiene reservas activas avisa y no lo retira', async () => {
    mockItemApi(() => Response.json({ error: 'Tiene reservas activas' }, { status: 409 }));
    const { user, dialog } = await openWithdraw();

    await user.click(within(dialog).getByRole('button', { name: 'Retirar anuncio' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No puedes retirar este anuncio porque tiene reservas activas.',
    );
    expect(within(dialog).getByRole('button', { name: 'Retirar anuncio' })).toBeEnabled();
    expect(itemRow('Taladro percutor').getByText('Publicado')).toBeInTheDocument();
  });

  it('si no es el propietario muestra el error de la API', async () => {
    mockItemApi(() =>
      Response.json({ error: 'No puedes modificar un objeto que no es tuyo.' }, { status: 403 }),
    );
    const { user, dialog } = await openWithdraw();

    await user.click(within(dialog).getByRole('button', { name: 'Retirar anuncio' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No puedes modificar un objeto que no es tuyo.',
    );
  });

  it('con la sesión caducada lleva al login', async () => {
    mockItemApi(() => Response.json({ error: 'Sesión no válida' }, { status: 401 }));
    const { user, view, dialog } = await openWithdraw();

    await user.click(within(dialog).getByRole('button', { name: 'Retirar anuncio' }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe('/login'));
  });
});

describe('changeItemStatus (#111)', () => {
  it('hace PATCH /objetos/:id/estado con el estado nuevo', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 'o1', status: 'withdrawn' }));

    await expect(changeItemStatus('token-de-prueba', 'o1', 'withdrawn')).resolves.toEqual({
      id: 'o1',
      status: 'withdrawn',
    });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/objetos\/o1\/estado$/);
  });
});
