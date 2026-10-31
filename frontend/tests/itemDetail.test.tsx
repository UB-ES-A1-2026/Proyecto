import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

const SESSION_KEY = 'rentit.session';
const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'user-bruno', username: 'bruno', email: 'bruno@rentit.test', role: 'user' },
};

const ITEM = {
  id: 'taladro-1',
  title: 'Taladro percutor Bosch',
  description: 'Taladro con función percutora.',
  dailyPrice: '5.00',
  deposit: '20.00',
  neighborhood: 'Gràcia',
  status: 'published',
  category: { id: 'herramientas', name: 'Herramientas y bricolaje' },
  photos: [
    { id: 'foto-1', url: 'https://ejemplo.test/foto-1.jpg' },
    { id: 'foto-2', url: 'https://ejemplo.test/foto-2.jpg' },
  ],
  homeDelivery: true,
  riderDelivery: true,
  pickupPointDelivery: true,
  owner: { id: 'user-ana', username: 'ana', email: 'ana@rentit.test' },
  createdAt: '2026-10-30T12:00:00.000Z',
};

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => handler(String(input), init));
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('pantalla de detalle del objeto (US-03.03, #58)', () => {
  it('muestra los campos públicos, formatea los importes y no muestra el correo del propietario', async () => {
    mockFetch(() => Response.json(ITEM));

    renderRoute('/objetos/taladro-1');

    expect(await screen.findByRole('heading', { level: 1, name: ITEM.title })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Foto 1 de Taladro percutor Bosch' })).toHaveAttribute(
      'src',
      ITEM.photos[0].url,
    );
    expect(screen.getByRole('img', { name: 'Foto 2 de Taladro percutor Bosch' })).toHaveAttribute(
      'src',
      ITEM.photos[1].url,
    );
    expect(screen.getByText(/5,00\s*€ \/ día/)).toBeInTheDocument();
    expect(screen.getByText(/Fianza: 20,00\s*€/)).toBeInTheDocument();
    expect(screen.getByText('Disponible')).toBeInTheDocument();
    expect(screen.getByText(ITEM.description)).toBeInTheDocument();
    expect(screen.getByText('Herramientas y bricolaje')).toBeInTheDocument();
    expect(screen.getByText('Gràcia')).toBeInTheDocument();
    expect(
      screen.getByText('Entrega a domicilio · Entrega con rider · Punto de recogida'),
    ).toBeInTheDocument();
    expect(screen.getByText('Publicado por ana')).toBeInTheDocument();
    expect(screen.queryByText('ana@rentit.test')).not.toBeInTheDocument();
  });

  it('muestra el estado de carga mientras espera la respuesta', async () => {
    let resolveResponse: (response: Response) => void = () => {};
    mockFetch(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    renderRoute('/objetos/taladro-1');

    expect(screen.getByRole('status')).toHaveTextContent('Cargando el objeto…');
    await act(async () => resolveResponse(Response.json(ITEM)));
    expect(await screen.findByRole('heading', { name: ITEM.title })).toBeInTheDocument();
  });

  it('muestra sin fianza, el mensaje de fotos vacías y entrega a convenir', async () => {
    mockFetch(() =>
      Response.json({
        ...ITEM,
        deposit: '0.00',
        photos: [],
        homeDelivery: false,
        riderDelivery: false,
        pickupPointDelivery: false,
      }),
    );

    renderRoute('/objetos/taladro-1');

    expect(await screen.findByText('Sin fianza')).toBeInTheDocument();
    expect(screen.getByText('Este objeto no tiene fotos.')).toBeInTheDocument();
    expect(screen.getByText('a convenir con el propietario')).toBeInTheDocument();
  });

  it('muestra la disponibilidad de anuncios pausados y retirados', async () => {
    mockFetch(() => Response.json({ ...ITEM, status: 'paused' }));
    const { unmount } = renderRoute('/objetos/taladro-1');

    expect(
      await screen.findByText('Pausado: no aparece en las búsquedas'),
    ).toBeInTheDocument();
    unmount();

    mockFetch(() => Response.json({ ...ITEM, status: 'withdrawn' }));
    renderRoute('/objetos/taladro-1');

    expect(await screen.findByText('Retirado')).toBeInTheDocument();
  });

  it('sin sesión lleva al login y después de iniciar sesión vuelve a la ficha', async () => {
    const fetchMock = mockFetch((url) =>
      url.endsWith('/auth/login') ? Response.json(SESSION) : Response.json(ITEM),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/objetos/taladro-1');

    await user.click(await screen.findByRole('button', { name: 'Alquilar' }));
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/objetos/taladro-1' });

    await user.type(screen.getByLabelText('Correo electrónico'), 'bruno@rentit.test');
    await user.type(screen.getByLabelText('Contraseña'), 'Rentit2026');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/objetos/taladro-1'));
    expect(await screen.findByRole('heading', { name: ITEM.title })).toBeInTheDocument();
    const detailRequests = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/objetos/taladro-1'),
    );
    const detailRequest = detailRequests[detailRequests.length - 1];
    expect(new Headers(detailRequest?.[1]?.headers).get('Authorization')).toBe(
      'Bearer token-de-prueba',
    );
  });

  it('con sesión de otro usuario lleva a solicitar el alquiler', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Response.json(ITEM));
    const user = userEvent.setup();
    const { router } = renderRoute('/objetos/taladro-1');

    await user.click(await screen.findByRole('button', { name: 'Alquilar' }));

    expect(router.state.location.pathname).toBe('/objetos/taladro-1/solicitar');
  });

  it('si la sesión es del propietario, muestra el aviso y no el botón', async () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        ...SESSION,
        user: { ...SESSION.user, id: 'user-ana', username: 'ana' },
      }),
    );
    mockFetch(() => Response.json(ITEM));

    renderRoute('/objetos/taladro-1');

    expect(await screen.findByText('Este anuncio es tuyo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alquilar' })).not.toBeInTheDocument();
  });

  it('muestra la pantalla de objeto no encontrado para un 404', async () => {
    mockFetch(() =>
      Response.json(
        { error: 'No hemos encontrado este objeto.' },
        { status: 404 },
      ),
    );

    renderRoute('/objetos/inexistente');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'No hemos encontrado este objeto',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Puede que se haya retirado o que el enlace no sea correcto.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });

  it('muestra el error de conexión y un mensaje genérico para otros errores', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const firstRender = renderRoute('/objetos/taladro-1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se puede conectar con el servidor. Inténtalo más tarde.',
    );
    firstRender.unmount();

    mockFetch(() =>
      Response.json({ error: 'Error interno.' }, { status: 500 }),
    );
    renderRoute('/objetos/taladro-1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hemos podido cargar el objeto. Inténtalo de nuevo más tarde.',
    );
  });
});
