// Generado con asistencia de IA (Claude)
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailableJob, MyJob } from '../src/services/riderJobService';
import { renderRoute } from './renderRoute';

// US-10.01 Rider acepta entregas disponibles, frontend (#293): criterios de la historia (#78).

const RIDER = {
  token: 'token-de-dani',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: {
    id: 'r1',
    username: 'dani',
    email: 'dani@rentit.test',
    role: 'user',
    isRider: true,
    riderStatus: 'approved',
  },
};

const TIENDA: AvailableJob = {
  id: 'j1',
  item: { id: 'i1', title: 'Tienda de campaña para 4 personas' },
  startDate: '2026-11-16',
  slot: 'asap',
  fee: '3.00',
  pickupNeighborhood: 'Gràcia',
  deliveryNeighborhood: 'Les Corts',
};
const TALADRO: AvailableJob = {
  id: 'j2',
  item: { id: 'i2', title: 'Taladro percutor Bosch' },
  startDate: '2026-11-21',
  slot: '09:00-11:00',
  fee: '5.00',
  pickupNeighborhood: 'Gràcia',
  deliveryNeighborhood: 'Eixample',
};
const PROYECTOR: AvailableJob = {
  id: 'j3',
  item: { id: 'i3', title: 'Proyector Full HD' },
  startDate: '2026-11-17',
  slot: '17:00-19:00',
  fee: '7.00',
  pickupNeighborhood: 'Poblenou',
  deliveryNeighborhood: 'Sarrià',
};

function mine(job: AvailableJob, pickupAddress: string, deliveryAddress: string): MyJob {
  return { ...job, pickupAddress, deliveryAddress, status: 'assigned' };
}
const TALADRO_MIO = mine(TALADRO, 'Carrer de Verdi, 12, 2.º 1.ª', 'Carrer de Mallorca, 120, 3.º');
const TIENDA_MIA = mine(TIENDA, 'Carrer de Torrijos, 40', 'Travessera de les Corts, 50');

type Reply = Response | (() => Response | Promise<Response>);

// Responde según el método y el final de la URL; cada ruta puede tener varias respuestas seguidas.
function mockApi(routes: Record<string, Reply | Reply[]>) {
  const calls: Record<string, number> = {};
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const key = Object.keys(routes).find((candidate) => {
      const [routeMethod, path] = candidate.split(' ');
      return routeMethod === method && url.endsWith(path);
    });
    if (!key) throw new Error(`Petición inesperada: ${method} ${url}`);
    const replies = ([] as Reply[]).concat(routes[key]);
    const index = Math.min(calls[key] ?? 0, replies.length - 1);
    calls[key] = (calls[key] ?? 0) + 1;
    const reply = replies[index];
    return typeof reply === 'function' ? reply() : reply.clone();
  });
}

function logIn(session: unknown = RIDER) {
  localStorage.setItem('rentit.session', JSON.stringify(session));
}

// La tarjeta de un trabajo, por el título del objeto.
const card = (title: string) =>
  screen.getByRole('heading', { level: 3, name: title }).closest('li') as HTMLElement;
const acceptButton = (title: string) => screen.getByRole('button', { name: `Aceptar ${title}` });

beforeEach(() => {
  // Solo se finge la fecha: «hoy» es el 16 de noviembre de 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 16, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('Trabajos disponibles (criterios 1 y 2)', () => {
  it('agrupa por día y cada trabajo enseña el objeto, los barrios, la franja y la tarifa, sin direcciones', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA, PROYECTOR, TALADRO] }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
    });
    renderRoute('/trabajos');

    await screen.findByRole('heading', { level: 3, name: TIENDA.item.title });
    const tienda = card(TIENDA.item.title);
    expect(tienda).toHaveTextContent('Recogida Gràcia Entrega Les Corts');
    expect(tienda).toHaveTextContent('Lo antes posible');
    expect(tienda).toHaveTextContent(/Tarifa 3,00\s€/);
    expect(
      within(tienda).getByRole('button', { name: `Aceptar ${TIENDA.item.title}` }),
    ).toHaveTextContent('Aceptar');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Hoy',
      'Mañana',
      'Sábado, 21 de noviembre',
    ]);
    expect(card(TALADRO.item.title)).toHaveTextContent('De 09:00 a 11:00');
    expect(screen.queryByText(/Carrer/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Disponibles (3)' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Mis trabajos (0)' })).toBeInTheDocument();
  });

  it('pide la lista con la sesión del rider', async () => {
    logIn();
    const fetchMock = mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA] }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
    });
    renderRoute('/trabajos');

    await screen.findByRole('heading', { level: 3, name: TIENDA.item.title });
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-dani');
    }
  });

  it('sin trabajos lo dice con el texto de la historia', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [] }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
    });
    renderRoute('/trabajos');

    expect(await screen.findByText('No hay trabajos disponibles ahora mismo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Aceptar/ })).not.toBeInTheDocument();
  });

  it('si falla la carga lo dice y «Reintentar» la vuelve a pedir', async () => {
    logIn();
    mockApi({
      'GET /trabajos': [
        Response.json({ error: 'Error interno.' }, { status: 500 }),
        Response.json({ jobs: [TIENDA] }),
      ],
      'GET /trabajos/mios': Response.json({ jobs: [] }),
    });
    const user = userEvent.setup();
    renderRoute('/trabajos');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se han podido cargar los trabajos.',
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(
      await screen.findByRole('heading', { level: 3, name: TIENDA.item.title }),
    ).toBeInTheDocument();
  });

  it('si la API lo rechaza (403), enseña su motivo', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json(
        { error: 'Solo los riders aceptados pueden ver los trabajos.' },
        { status: 403 },
      ),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
    });
    renderRoute('/trabajos');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo los riders aceptados pueden ver los trabajos.',
    );
  });

  it('con la sesión caducada (401) vuelve al login', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ error: 'Sesión caducada.' }, { status: 401 }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
    });
    const { router } = renderRoute('/trabajos');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});

describe('Aceptar cada trabajo por separado (criterio 3)', () => {
  it('acepta solo ese trabajo, lo pasa a «Mis trabajos» y se queda en la lista para aceptar más', async () => {
    logIn();
    const fetchMock = mockApi({
      'GET /trabajos': [
        Response.json({ jobs: [TIENDA, TALADRO, PROYECTOR] }),
        Response.json({ jobs: [TIENDA, PROYECTOR] }),
      ],
      'GET /trabajos/mios': [Response.json({ jobs: [] }), Response.json({ jobs: [TALADRO_MIO] })],
      'POST /trabajos/j2/aceptar': Response.json({ job: TALADRO_MIO }),
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/trabajos');

    await screen.findByRole('heading', { level: 3, name: TALADRO.item.title });
    await user.click(acceptButton(TALADRO.item.title));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Has aceptado «Taladro percutor Bosch». Lo tienes en Mis trabajos, con las direcciones.',
    );
    expect(router.state.location.pathname).toBe('/trabajos');
    expect(
      screen.queryByRole('heading', { level: 3, name: TALADRO.item.title }),
    ).not.toBeInTheDocument();
    expect(acceptButton(TIENDA.item.title)).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Disponibles (2)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mis trabajos (1)' })).toBeInTheDocument();

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(String(posts[0][0])).toMatch(/\/trabajos\/j2\/aceptar$/);
    expect(new Headers(posts[0][1]?.headers).get('Authorization')).toBe('Bearer token-de-dani');

    // El enlace del aviso lleva a «Mis trabajos», con la dirección completa.
    await user.click(screen.getByRole('link', { name: 'Mis trabajos' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/trabajos/mios'));
    await screen.findByRole('heading', { level: 3, name: TALADRO.item.title });
    const taladro = card(TALADRO.item.title);
    expect(taladro).toHaveTextContent('Recogida Carrer de Verdi, 12, 2.º 1.ª (Gràcia)');
    expect(taladro).toHaveTextContent('Entrega Carrer de Mallorca, 120, 3.º (Eixample)');
    expect(taladro).toHaveTextContent(/Tarifa 5,00\s€/);
    expect(taladro).toHaveTextContent('Asignada');
    expect(within(taladro).getByRole('link', { name: 'Ver seguimiento' })).toHaveAttribute(
      'href',
      '/entregas/j2',
    );
  });

  it('se pueden aceptar varios seguidos y el aviso es del último', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA, TALADRO] }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
      'POST /trabajos/j1/aceptar': Response.json({ job: TIENDA_MIA }),
      'POST /trabajos/j2/aceptar': Response.json({ job: TALADRO_MIO }),
    });
    const user = userEvent.setup();
    renderRoute('/trabajos');

    await user.click(await screen.findByRole('button', { name: `Aceptar ${TIENDA.item.title}` }));
    expect(await screen.findByRole('status')).toHaveTextContent('Has aceptado «Tienda');
    await user.click(acceptButton(TALADRO.item.title));

    expect(await screen.findByRole('status')).toHaveTextContent('Has aceptado «Taladro');
    expect(await screen.findByText('No hay trabajos disponibles ahora mismo.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mis trabajos (2)' })).toBeInTheDocument();
  });

  it('mientras acepta, ese botón dice «Aceptando…» y los demás siguen activos', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA, TALADRO] }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
      'POST /trabajos/j1/aceptar': () => new Promise<Response>(() => undefined),
    });
    const user = userEvent.setup();
    renderRoute('/trabajos');

    await user.click(await screen.findByRole('button', { name: `Aceptar ${TIENDA.item.title}` }));

    const busy = screen.getByRole('button', { name: `Aceptando ${TIENDA.item.title}…` });
    expect(busy).toBeDisabled();
    expect(busy).toHaveTextContent('Aceptando…');
    expect(acceptButton(TALADRO.item.title)).toBeEnabled();
  });

  it('si falla, lo dice y el trabajo sigue en la lista para reintentar', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA] }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
      'POST /trabajos/j1/aceptar': Response.json({ error: 'Error interno.' }, { status: 500 }),
    });
    const user = userEvent.setup();
    renderRoute('/trabajos');

    await user.click(await screen.findByRole('button', { name: `Aceptar ${TIENDA.item.title}` }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se ha podido aceptar el trabajo. Inténtalo de nuevo.',
    );
    expect(acceptButton(TIENDA.item.title)).toBeEnabled();
  });

  it('con la sesión caducada (401) al aceptar vuelve al login', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA] }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
      'POST /trabajos/j1/aceptar': Response.json({ error: 'Sesión caducada.' }, { status: 401 }),
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/trabajos');

    await user.click(await screen.findByRole('button', { name: `Aceptar ${TIENDA.item.title}` }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});

describe('Ya asignado a otro rider (criterio 4)', () => {
  it('avisa, quita el trabajo de la lista y la vuelve a pedir', async () => {
    logIn();
    const fetchMock = mockApi({
      'GET /trabajos': [
        Response.json({ jobs: [TIENDA, TALADRO] }),
        Response.json({ jobs: [TALADRO] }),
      ],
      'GET /trabajos/mios': Response.json({ jobs: [] }),
      'POST /trabajos/j1/aceptar': Response.json(
        { error: 'Ya asignado a otro rider.' },
        { status: 409 },
      ),
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/trabajos');

    await user.click(await screen.findByRole('button', { name: `Aceptar ${TIENDA.item.title}` }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tienda de campaña para 4 personas: Ya asignado a otro rider.',
    );
    expect(router.state.location.pathname).toBe('/trabajos');
    expect(
      screen.queryByRole('heading', { level: 3, name: TIENDA.item.title }),
    ).not.toBeInTheDocument();
    expect(acceptButton(TALADRO.item.title)).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) => (init?.method ?? 'GET') === 'GET' && String(url).endsWith('/trabajos'),
        ),
      ).toHaveLength(2),
    );
  });
});

describe('Mis trabajos', () => {
  it('sin ninguno lo dice', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA] }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
    });
    renderRoute('/trabajos/mios');

    expect(await screen.findByText('Todavía no has aceptado ningún trabajo.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mis trabajos (0)' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('la pestaña «Disponibles» vuelve a la lista para aceptar', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA] }),
      'GET /trabajos/mios': Response.json({ jobs: [TALADRO_MIO] }),
    });
    const user = userEvent.setup();
    renderRoute('/trabajos/mios');

    await user.click(await screen.findByRole('link', { name: 'Disponibles (1)' }));

    expect(
      await screen.findByRole('button', { name: `Aceptar ${TIENDA.item.title}` }),
    ).toBeInTheDocument();
  });
});

// Lista y detalle en pantallas anchas (decisión de Kai, 20/11). Generado con asistencia de IA (Claude).
describe('Trabajos con lista y detalle (pantallas anchas)', () => {
  function wideScreen() {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
  }

  afterEach(() => vi.unstubAllGlobals());

  it('elige el primero, lo enseña entero a la derecha y se acepta desde ahí', async () => {
    wideScreen();
    logIn();
    mockApi({
      'GET /trabajos': [
        Response.json({ jobs: [TIENDA, TALADRO] }),
        Response.json({ jobs: [TALADRO] }),
      ],
      'GET /trabajos/mios': [Response.json({ jobs: [] }), Response.json({ jobs: [TIENDA_MIA] })],
      'POST /trabajos/j1/aceptar': Response.json({ job: TIENDA_MIA }),
    });
    const user = userEvent.setup();
    renderRoute('/trabajos');

    const tienda = await screen.findByRole('button', { name: TIENDA.item.title });
    expect(tienda).toHaveAttribute('aria-pressed', 'true');
    const detail = screen.getByRole('region', { name: 'Trabajo elegido' });
    expect(detail).toHaveTextContent('Recogida Gràcia Entrega Les Corts');
    expect(detail).toHaveTextContent('Hoy');

    await user.click(screen.getByRole('button', { name: TALADRO.item.title }));
    expect(screen.getByRole('region', { name: 'Trabajo elegido' })).toHaveTextContent(
      'Recogida Gràcia Entrega Eixample',
    );

    await user.click(screen.getByRole('button', { name: TIENDA.item.title }));
    await user.click(
      within(screen.getByRole('region', { name: 'Trabajo elegido' })).getByRole('button', {
        name: `Aceptar ${TIENDA.item.title}`,
      }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent('Has aceptado «Tienda');
    // Sale de la lista y se elige el siguiente.
    expect(screen.getByRole('button', { name: TALADRO.item.title })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('en «Mis trabajos» el detalle lleva las direcciones y «Ver seguimiento»', async () => {
    wideScreen();
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [] }),
      'GET /trabajos/mios': Response.json({ jobs: [TALADRO_MIO] }),
    });
    renderRoute('/trabajos/mios');

    const detail = await screen.findByRole('region', { name: 'Trabajo elegido' });
    expect(detail).toHaveTextContent('Recogida Carrer de Verdi, 12, 2.º 1.ª (Gràcia)');
    expect(within(detail).getByRole('link', { name: 'Ver seguimiento' })).toHaveAttribute(
      'href',
      '/entregas/j2',
    );
  });
});

// La API del backend (#292) puede no tener la tarifa, el barrio o las direcciones de un trabajo
// antiguo: se enseña lo que haya, sin «null». Generado con asistencia de IA (Claude).
describe('Trabajos con datos incompletos', () => {
  it('sin tarifa no sale «Tarifa» y sin barrio de entrega sale «—»', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({
        jobs: [{ ...TIENDA, fee: null, deliveryNeighborhood: null }],
      }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
    });
    renderRoute('/trabajos');

    await screen.findByRole('heading', { level: 3, name: TIENDA.item.title });
    const tienda = card(TIENDA.item.title);
    expect(tienda).not.toHaveTextContent('Tarifa');
    expect(tienda).toHaveTextContent('Recogida Gràcia Entrega —');
    expect(tienda).not.toHaveTextContent('null');
  });

  it('en «Mis trabajos», sin dirección sale el barrio, y el estado «pending» con su texto', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [] }),
      'GET /trabajos/mios': Response.json({
        jobs: [{ ...TALADRO_MIO, pickupAddress: null, deliveryAddress: null, status: 'pending' }],
      }),
    });
    renderRoute('/trabajos/mios');

    await screen.findByRole('heading', { level: 3, name: TALADRO.item.title });
    const taladro = card(TALADRO.item.title);
    expect(taladro).toHaveTextContent('Recogida Gràcia Entrega Eixample');
    expect(taladro).toHaveTextContent('Pendiente de entrega');
    expect(taladro).not.toHaveTextContent('null');
  });
});
