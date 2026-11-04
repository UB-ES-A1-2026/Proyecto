import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pauseItem, resumeItem } from '../src/services/itemService';
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
    title: 'Bicicleta de paseo',
    dailyPrice: '8.00',
    neighborhood: 'Sants',
    status: 'paused',
  },
  {
    id: 'o3',
    title: 'Tienda de campaña',
    dailyPrice: '12.00',
    neighborhood: 'Sants',
    status: 'withdrawn',
  },
];

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

// Por defecto responde como el backend (#112): el objeto de la lista con el estado nuevo.
function respondLikeBackend(url: string) {
  const [id, action] = url.split('/').slice(-2);
  const item = LIST.find((candidate) => candidate.id === id);
  return Response.json({ ...item, status: action === 'pausar' ? 'paused' : 'published' });
}

function mockItemApi(onChange: Handler = respondLikeBackend) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/usuarios/me/objetos')) return Response.json(LIST);
    return onChange(url, init);
  });
}

function itemRow(title: string) {
  const row = screen.getByRole('heading', { name: title }).closest('li');
  if (!row) throw new Error(`No se encuentra la fila de ${title}`);
  return within(row);
}

async function renderList() {
  const user = userEvent.setup();
  const view = renderRoute('/mis-objetos');
  await screen.findByRole('heading', { name: 'Taladro percutor' });
  return { user, view };
}

beforeEach(() => localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION)));
afterEach(() => localStorage.clear());

const PHOTO_ROW = {
  id: 'o-foto',
  title: 'Con foto',
  dailyPrice: '5.00',
  neighborhood: 'Gràcia',
  status: 'published',
};

describe('pausar y reanudar un anuncio (US-02.04, #113)', () => {
  it('muestra «Pausar» en los publicados, «Reanudar» en los pausados y nada en los retirados', async () => {
    mockItemApi();
    await renderList();

    expect(
      itemRow('Taladro percutor').getByRole('button', { name: 'Pausar Taladro percutor' }),
    ).toBeInTheDocument();
    expect(
      itemRow('Bicicleta de paseo').getByRole('button', { name: 'Reanudar Bicicleta de paseo' }),
    ).toBeInTheDocument();
    expect(
      itemRow('Tienda de campaña').queryByRole('button', { name: /Pausar|Reanudar/ }),
    ).not.toBeInTheDocument();
  });

  it('al pausar lo pide con el token y el objeto sigue en «Mis objetos» como «Pausado»', async () => {
    const fetchMock = mockItemApi();
    const { user } = await renderList();

    await user.click(screen.getByRole('button', { name: 'Pausar Taladro percutor' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'El anuncio se ha pausado: no aparecerá en las búsquedas hasta que lo reanudes.',
    );
    const row = itemRow('Taladro percutor');
    expect(row.getByText('Pausado')).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Reanudar Taladro percutor' })).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toMatch(/\/objetos\/o1\/pausar$/);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer token-de-prueba' });
    expect(init?.body).toBeUndefined();
  });

  it('al pausar conserva la foto de la fila, aunque la API no la devuelva', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    const photo = 'https://example.test/foto.webp';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) =>
      init?.method === 'POST'
        ? Response.json({ ...PHOTO_ROW, status: 'paused' })
        : Response.json([{ ...PHOTO_ROW, photo }]),
    );
    const user = userEvent.setup();

    const { container } = renderRoute('/mis-objetos');

    await user.click(await screen.findByRole('button', { name: 'Pausar Con foto' }));

    await screen.findByRole('button', { name: 'Reanudar Con foto' });
    expect(container.querySelector('.item-photo img')).toHaveAttribute('src', photo);
  });

  it('al reanudar vuelve a «Publicado»', async () => {
    const fetchMock = mockItemApi();
    const { user } = await renderList();

    await user.click(screen.getByRole('button', { name: 'Reanudar Bicicleta de paseo' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'El anuncio se ha reanudado y vuelve a aparecer en las búsquedas.',
    );
    expect(itemRow('Bicicleta de paseo').getByText('Publicado')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/objetos\/o2\/reanudar$/);
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
  });

  it('mientras se envía desactiva los botones para no pedirlo dos veces', async () => {
    let respond: (response: Response) => void = () => {};
    mockItemApi(() => new Promise<Response>((resolve) => (respond = resolve)));
    const { user } = await renderList();

    await user.click(screen.getByRole('button', { name: 'Pausar Taladro percutor' }));

    const button = screen.getByRole('button', { name: 'Pausar Taladro percutor' });
    expect(button).toHaveTextContent('Pausando…');
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reanudar Bicicleta de paseo' })).toBeDisabled();

    respond(Response.json({ ...LIST[0], status: 'paused' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reanudar Taladro percutor' })).toBeEnabled();
  });

  it('si no es el propietario muestra el error de la API y el estado no cambia', async () => {
    mockItemApi(() =>
      Response.json(
        { error: 'Solo el propietario puede cambiar el estado de este objeto.' },
        { status: 403 },
      ),
    );
    const { user } = await renderList();

    await user.click(screen.getByRole('button', { name: 'Pausar Taladro percutor' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo el propietario puede cambiar el estado de este objeto.',
    );
    expect(itemRow('Taladro percutor').getByText('Publicado')).toBeInTheDocument();
  });

  it('si el estado ya no lo permite muestra el aviso de la API', async () => {
    mockItemApi(() =>
      Response.json({ error: 'Solo se puede reanudar un objeto pausado.' }, { status: 409 }),
    );
    const { user } = await renderList();

    await user.click(screen.getByRole('button', { name: 'Reanudar Bicicleta de paseo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo se puede reanudar un objeto pausado.',
    );
    expect(itemRow('Bicicleta de paseo').getByText('Pausado')).toBeInTheDocument();
  });

  it('con la sesión caducada lleva al login', async () => {
    mockItemApi(() => Response.json({ error: 'Sesión no válida' }, { status: 401 }));
    const { user, view } = await renderList();

    await user.click(screen.getByRole('button', { name: 'Pausar Taladro percutor' }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe('/login'));
  });
});

describe('pauseItem y resumeItem (#113)', () => {
  it('hacen POST /objetos/:id/pausar y /reanudar sin cuerpo', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => respondLikeBackend(String(input)));

    await expect(pauseItem('token-de-prueba', 'o1')).resolves.toMatchObject({ status: 'paused' });
    await expect(resumeItem('token-de-prueba', 'o2')).resolves.toMatchObject({
      status: 'published',
    });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/objetos\/o1\/pausar$/);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/objetos\/o2\/reanudar$/);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === 'POST')).toBe(true);
  });
});
