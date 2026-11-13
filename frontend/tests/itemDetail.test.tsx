import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const RESERVATION = {
  id: 'reserva-1',
  item: { id: ITEM.id, title: ITEM.title },
  startDate: '2026-11-10',
  endDate: '2026-11-12',
  totalPrice: '15.00',
  status: 'pending',
  renter: { id: 'user-bruno', username: 'bruno' },
  owner: { id: 'user-ana', username: 'ana' },
  createdAt: '2026-11-03T12:00:00.000Z',
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

    const { container } = renderRoute('/objetos/taladro-1');

    expect(await screen.findByRole('heading', { level: 1, name: ITEM.title })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Foto 1 de Taladro percutor Bosch' })).toHaveAttribute(
      'src',
      ITEM.photos[0].url,
    );
    expect(container.querySelector('.rental-panel-price')).toHaveTextContent(/5,00\s*€ \/ día/);
    expect(screen.getByText(/Fianza: 20,00\s*€/)).toBeInTheDocument();
    expect(screen.getByText('Disponible')).toBeInTheDocument();
    expect(screen.getByText(ITEM.description)).toBeInTheDocument();
    expect(screen.getByText('Herramientas y bricolaje')).toBeInTheDocument();
    expect(screen.getByText('Gràcia')).toBeInTheDocument();
    expect(screen.getByText('Recoger en casa del propietario')).toBeInTheDocument();
    expect(screen.getByText('Entrega por rider')).toBeInTheDocument();
    expect(screen.getByText('Punto de recogida')).toBeInTheDocument();
    expect(screen.getByText('Publicado por ana')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Propietario' })).toHaveTextContent(
      /^APublicado por ana$/,
    );
    expect(screen.queryByText('ana@rentit.test')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('ana@rentit.test');
  });

  it('las miniaturas cambian la foto principal', async () => {
    mockFetch(() => Response.json(ITEM));
    const user = userEvent.setup();

    renderRoute('/objetos/taladro-1');

    const secondThumb = await screen.findByRole('button', { name: 'Ver foto 2' });
    expect(secondThumb).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Ver foto 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(secondThumb);

    expect(secondThumb).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'Foto 2 de Taladro percutor Bosch' })).toHaveAttribute(
      'src',
      ITEM.photos[1].url,
    );
    expect(
      screen.queryByRole('img', { name: 'Foto 1 de Taladro percutor Bosch' }),
    ).not.toBeInTheDocument();
  });

  it('con una sola foto no muestra miniaturas', async () => {
    mockFetch(() => Response.json({ ...ITEM, photos: [ITEM.photos[0]] }));

    renderRoute('/objetos/taladro-1');

    expect(
      await screen.findByRole('img', { name: 'Foto 1 de Taladro percutor Bosch' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver foto 1' })).not.toBeInTheDocument();
  });

  it('muestra el estado de carga mientras espera la respuesta', async () => {
    let resolveResponse: (response: Response) => void = () => {};
    mockFetch(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    const { container } = renderRoute('/objetos/taladro-1');

    expect(screen.getByRole('status')).toHaveTextContent('Cargando el objeto…');
    expect(container.querySelector('.skeleton')).toBeInTheDocument();
    await act(async () => resolveResponse(Response.json(ITEM)));
    expect(await screen.findByRole('heading', { name: ITEM.title })).toBeInTheDocument();
    expect(container.querySelector('.skeleton')).not.toBeInTheDocument();
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

    expect(await screen.findByText('Pausado: no aparece en las búsquedas')).toBeInTheDocument();
    unmount();

    mockFetch(() => Response.json({ ...ITEM, status: 'withdrawn' }));
    renderRoute('/objetos/taladro-1');

    expect(await screen.findByText('Retirado')).toBeInTheDocument();
  });

  it('sin sesión lleva al login y después de iniciar sesión vuelve a la ficha con las fechas', async () => {
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
    expect(screen.getByLabelText('Fecha de inicio')).toBeInTheDocument();
    const detailRequests = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/objetos/taladro-1'),
    );
    const detailRequest = detailRequests[detailRequests.length - 1];
    expect(new Headers(detailRequest?.[1]?.headers).get('Authorization')).toBe(
      'Bearer token-de-prueba',
    );
  });

  it('sin sesión no enseña las fechas', async () => {
    mockFetch(() => Response.json(ITEM));

    renderRoute('/objetos/taladro-1');

    expect(await screen.findByRole('button', { name: 'Alquilar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Fecha de inicio')).not.toBeInTheDocument();
  });

  it('con sesión de otro usuario muestra las fechas en el panel, sin cambiar de pantalla', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Response.json(ITEM));
    const { router } = renderRoute('/objetos/taladro-1');

    const panel = await screen.findByRole('complementary', { name: 'Alquiler de este objeto' });
    expect(within(panel).getByLabelText('Fecha de inicio')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Fecha de fin')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Solicitar alquiler' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Alquilar' })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/objetos/taladro-1');
  });

  it('si la sesión es del propietario, muestra el aviso y no se puede solicitar', async () => {
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
    expect(screen.queryByRole('button', { name: 'Solicitar alquiler' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fecha de inicio')).not.toBeInTheDocument();
  });

  it.each([
    ['sin sesión', false],
    ['con sesión', true],
  ])('un objeto que no está publicado no se puede solicitar %s', async (_name, withSession) => {
    if (withSession) localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Response.json({ ...ITEM, status: 'paused' }));

    renderRoute('/objetos/taladro-1');

    expect(await screen.findByText('Este objeto no se puede alquilar ahora.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alquilar' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fecha de inicio')).not.toBeInTheDocument();
  });

  it('muestra la pantalla de objeto no encontrado para un 404', async () => {
    mockFetch(() => Response.json({ error: 'No hemos encontrado este objeto.' }, { status: 404 }));

    const { container } = renderRoute('/objetos/inexistente');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'No hemos encontrado este objeto',
      }),
    ).toBeInTheDocument();
    expect(container.querySelector('.empty-state')).toBeInTheDocument();
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

    mockFetch(() => Response.json({ error: 'Error interno.' }, { status: 500 }));
    renderRoute('/objetos/taladro-1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hemos podido cargar el objeto. Inténtalo de nuevo más tarde.',
    );
  });
});

describe('alquiler en el panel de la ficha (US-04.01, #121)', () => {
  beforeEach(() => {
    // Solo se finge la fecha: «hoy» es el 3 de noviembre de 2026.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0));
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
  });

  afterEach(() => vi.useRealTimers());

  function mockApi(available = true) {
    return mockFetch((url) => {
      if (url.includes('/reservas/disponibilidad')) return Response.json({ available });
      if (url.endsWith('/reservas')) return Response.json(RESERVATION, { status: 201 });
      // Paso «Entrega» de US-05.01: el objeto solo ofrece recogerlo en casa del propietario.
      if (url.includes('/entrega?')) {
        return Response.json({
          modes: { home: true, rider: false, pickupPoint: false },
          pickupPoints: [],
          slots: [],
        });
      }
      return Response.json(ITEM);
    });
  }

  // Entre las fechas y el resumen está el paso «Entrega» (US-05.01, #282).
  async function chooseHomeDelivery(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('radio', { name: 'Recoger en casa del propietario' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
  }

  async function chooseDates(startDate: string, endDate: string) {
    fireEvent.change(await screen.findByLabelText('Fecha de inicio'), {
      target: { value: startDate },
    });
    fireEvent.change(screen.getByLabelText('Fecha de fin'), { target: { value: endDate } });
  }

  function requestButton() {
    return screen.getByRole('button', { name: 'Solicitar alquiler' });
  }

  it('calcula el precio del periodo y consulta la disponibilidad del objeto con el token', async () => {
    const fetchMock = mockApi();
    renderRoute('/objetos/taladro-1');

    await chooseDates('10/11/2026', '12/11/2026');

    expect(screen.getByText(/3 días × 5,00 € =/)).toHaveTextContent('15,00 €');
    await waitFor(() => expect(requestButton()).toBeEnabled());
    const check = fetchMock.mock.calls.find(([url]) => String(url).includes('/disponibilidad'));
    expect(String(check?.[0])).toMatch(/itemId=taladro-1&startDate=2026-11-10&endDate=2026-11-12$/);
    expect(check?.[1]?.headers).toMatchObject({ Authorization: 'Bearer token-de-prueba' });
  });

  it('con fechas ocupadas avisa y no deja seguir', async () => {
    mockApi(false);
    renderRoute('/objetos/taladro-1');

    await chooseDates('10/11/2026', '12/11/2026');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El objeto no está disponible en esas fechas.',
    );
    expect(requestButton()).toBeDisabled();
  });

  it('el resumen sale en el mismo panel y «Volver» conserva las fechas', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    const { router, container } = renderRoute('/objetos/taladro-1');

    await chooseDates('10/11/2026', '12/11/2026');
    await waitFor(() => expect(requestButton()).toBeEnabled());
    await user.click(requestButton());
    await chooseHomeDelivery(user);

    const panel = within(screen.getByRole('complementary', { name: 'Alquiler de este objeto' }));
    expect(panel.getByRole('heading', { name: 'Revisa tu solicitud' })).toBeInTheDocument();
    expect(panel.getByText(ITEM.title)).toBeInTheDocument();
    expect(panel.getByText('martes, 10 de noviembre de 2026')).toBeInTheDocument();
    expect(panel.getByText('jueves, 12 de noviembre de 2026')).toBeInTheDocument();
    expect(panel.getByText('Importe del alquiler (3 días)')).toBeInTheDocument();
    expect(container.querySelector('.rental-total')).toHaveTextContent('15,00 €');
    expect(panel.getByText('Recoger en casa del propietario')).toBeInTheDocument();
    // La foto es decorativa (alt=""), así que no tiene rol «img»: se busca por su clase.
    expect(container.querySelector('.rental-item-photo')).toHaveAttribute(
      'src',
      ITEM.photos[0].url,
    );
    expect(router.state.location.pathname).toBe('/objetos/taladro-1');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);

    // «Volver» lleva a la entrega y, desde ahí, a las fechas.
    await user.click(panel.getByRole('button', { name: 'Volver' }));
    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('10/11/2026');
    expect(screen.getByLabelText('Fecha de fin')).toHaveValue('12/11/2026');
  });

  it('al confirmar crea la solicitud y lleva a «Mis solicitudes»', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/objetos/taladro-1');

    await chooseDates('10/11/2026', '12/11/2026');
    await waitFor(() => expect(requestButton()).toBeEnabled());
    await user.click(requestButton());
    await chooseHomeDelivery(user);
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/mis-solicitudes'));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      itemId: ITEM.id,
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      deliveryMode: 'home',
    });
  });

  it('con la sesión caducada lleva al login y después vuelve a la ficha', async () => {
    mockFetch((url) =>
      url.includes('/reservas/disponibilidad')
        ? Response.json({ error: 'Sesión no válida' }, { status: 401 })
        : Response.json(ITEM),
    );
    const { router } = renderRoute('/objetos/taladro-1');

    await chooseDates('10/11/2026', '12/11/2026');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.state).toEqual({ from: '/objetos/taladro-1' });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe('ruta antigua /objetos/:id/solicitar', () => {
  it('con sesión redirige a la ficha, donde están las fechas', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION));
    mockFetch(() => Response.json(ITEM));

    const { router } = renderRoute('/objetos/taladro-1/solicitar');

    expect(await screen.findByLabelText('Fecha de inicio')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/objetos/taladro-1');
  });

  it('sin sesión también redirige a la ficha, sin pedir el login', async () => {
    mockFetch(() => Response.json(ITEM));

    const { router } = renderRoute('/objetos/taladro-1/solicitar');

    expect(await screen.findByRole('button', { name: 'Alquilar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/objetos/taladro-1');
  });
});
