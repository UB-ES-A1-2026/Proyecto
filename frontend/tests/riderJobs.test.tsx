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
  fee: '4.50',
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

const checkbox = (title: string) => screen.getByRole('checkbox', { name: title });

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
  it('cada trabajo enseña el objeto, los barrios, el día con la franja y lo que cobra, sin direcciones', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA, PROYECTOR, TALADRO] }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
    });
    renderRoute('/trabajos');

    const tienda = (await screen.findByRole('checkbox', { name: TIENDA.item.title })).closest(
      'label',
    ) as HTMLElement;
    expect(tienda).toHaveTextContent('De Gràcia a Les Corts');
    expect(tienda).toHaveTextContent('Hoy · Lo antes posible');
    expect(tienda).toHaveTextContent(/Cobras 3,00\s€/);
    expect(checkbox(PROYECTOR.item.title)).toHaveAccessibleDescription(
      /De Poblenou a Sarrià Mañana · 17:00 – 19:00 Cobras 7,00\s€/,
    );
    expect(checkbox(TALADRO.item.title).closest('label')).toHaveTextContent(
      'Sábado, 21 de noviembre · 09:00 – 11:00',
    );
    expect(screen.queryByText(/Carrer/)).not.toBeInTheDocument();
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

    await screen.findByRole('checkbox', { name: TIENDA.item.title });
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
    expect(screen.queryByRole('button', { name: 'Aceptar trabajos' })).not.toBeInTheDocument();
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

    expect(await screen.findByRole('checkbox', { name: TIENDA.item.title })).toBeInTheDocument();
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

describe('Marcar y aceptar varios (criterio 3)', () => {
  it('sin marcar ninguno no deja aceptar; al marcar dice cuántos y lo que cobrará', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA, TALADRO] }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
    });
    const user = userEvent.setup();
    renderRoute('/trabajos');

    const accept = await screen.findByRole('button', { name: 'Aceptar trabajos' });
    expect(accept).toBeDisabled();
    expect(screen.getByText('Marca los trabajos que quieras hacer.')).toBeInTheDocument();

    await user.click(checkbox(TIENDA.item.title));
    expect(screen.getByText(/^1 trabajo marcado · cobrarás 3,00\s€$/)).toBeInTheDocument();

    // Toda la tarjeta marca la casilla.
    await user.click(screen.getByText('Taladro percutor Bosch'));
    expect(checkbox(TALADRO.item.title)).toBeChecked();
    expect(screen.getByText(/^2 trabajos marcados · cobrarás 7,50\s€$/)).toBeInTheDocument();
    expect(accept).toBeEnabled();
  });

  it('acepta los marcados a la vez y va a «Mis trabajos» con la dirección completa', async () => {
    logIn();
    const fetchMock = mockApi({
      'GET /trabajos': [
        Response.json({ jobs: [TIENDA, TALADRO, PROYECTOR] }),
        Response.json({ jobs: [PROYECTOR] }),
      ],
      'GET /trabajos/mios': [
        Response.json({ jobs: [] }),
        Response.json({ jobs: [TIENDA_MIA, TALADRO_MIO] }),
      ],
      'POST /trabajos/aceptar': Response.json({
        assigned: [TIENDA_MIA, TALADRO_MIO],
        alreadyTaken: [],
      }),
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/trabajos');

    await user.click(await screen.findByRole('checkbox', { name: TIENDA.item.title }));
    await user.click(checkbox(TALADRO.item.title));
    await user.click(screen.getByRole('button', { name: 'Aceptar trabajos' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/trabajos/mios'));
    expect(await screen.findByRole('status')).toHaveTextContent('Te hemos asignado 2 trabajos.');
    const list = await screen.findByRole('list', { name: 'Mis trabajos' });
    const taladro = within(list).getByRole('heading', { name: TALADRO.item.title }).parentElement
      ?.parentElement as HTMLElement;
    expect(taladro).toHaveTextContent('Recoges en: Carrer de Verdi, 12, 2.º 1.ª (Gràcia)');
    expect(taladro).toHaveTextContent('Entregas en: Carrer de Mallorca, 120, 3.º (Eixample)');
    expect(taladro).toHaveTextContent('Asignado');
    expect(within(taladro).getByRole('link', { name: 'Ver seguimiento' })).toHaveAttribute(
      'href',
      '/entregas/j2',
    );
    expect(screen.getByRole('link', { name: 'Disponibles (1)' })).toBeInTheDocument();

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ ids: ['j1', 'j2'] });
    expect(new Headers(post?.[1]?.headers).get('Authorization')).toBe('Bearer token-de-dani');
  });

  it('mientras acepta, el botón dice «Aceptando…» y no se puede volver a pulsar', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA] }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
      'POST /trabajos/aceptar': () => new Promise<Response>(() => undefined),
    });
    const user = userEvent.setup();
    renderRoute('/trabajos');

    await user.click(await screen.findByRole('checkbox', { name: TIENDA.item.title }));
    await user.click(screen.getByRole('button', { name: 'Aceptar trabajos' }));

    expect(screen.getByRole('button', { name: 'Aceptando…' })).toBeDisabled();
    expect(checkbox(TIENDA.item.title)).toBeDisabled();
  });

  it('si falla, lo dice y deja reintentar sin perder lo marcado', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA] }),
      'GET /trabajos/mios': Response.json({ jobs: [] }),
      'POST /trabajos/aceptar': Response.json({ error: 'Error interno.' }, { status: 500 }),
    });
    const user = userEvent.setup();
    renderRoute('/trabajos');

    await user.click(await screen.findByRole('checkbox', { name: TIENDA.item.title }));
    await user.click(screen.getByRole('button', { name: 'Aceptar trabajos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se han podido aceptar los trabajos. Inténtalo de nuevo.',
    );
    expect(checkbox(TIENDA.item.title)).toBeChecked();
    expect(screen.getByRole('button', { name: 'Aceptar trabajos' })).toBeEnabled();
  });
});

describe('Ya asignado a otro rider (criterio 4)', () => {
  it('avisa del que ya era de otro rider y asigna el resto', async () => {
    logIn();
    mockApi({
      'GET /trabajos': [Response.json({ jobs: [TIENDA, TALADRO] }), Response.json({ jobs: [] })],
      'GET /trabajos/mios': [Response.json({ jobs: [] }), Response.json({ jobs: [TALADRO_MIO] })],
      'POST /trabajos/aceptar': Response.json({
        assigned: [TALADRO_MIO],
        alreadyTaken: [{ id: 'j1', item: TIENDA.item }],
      }),
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/trabajos');

    await user.click(await screen.findByRole('checkbox', { name: TIENDA.item.title }));
    await user.click(checkbox(TALADRO.item.title));
    await user.click(screen.getByRole('button', { name: 'Aceptar trabajos' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/trabajos/mios'));
    expect(await screen.findByRole('status')).toHaveTextContent('Te hemos asignado 1 trabajo.');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tienda de campaña para 4 personas: Ya asignado a otro rider.',
    );
  });

  it('si no se asigna ninguno, se queda en «Disponibles» con el aviso y sin ese trabajo', async () => {
    logIn();
    mockApi({
      'GET /trabajos': [
        Response.json({ jobs: [TIENDA, TALADRO] }),
        Response.json({ jobs: [TALADRO] }),
      ],
      'GET /trabajos/mios': Response.json({ jobs: [] }),
      'POST /trabajos/aceptar': Response.json({
        assigned: [],
        alreadyTaken: [{ id: 'j1', item: TIENDA.item }],
      }),
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/trabajos');

    await user.click(await screen.findByRole('checkbox', { name: TIENDA.item.title }));
    await user.click(screen.getByRole('button', { name: 'Aceptar trabajos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tienda de campaña para 4 personas: Ya asignado a otro rider.',
    );
    expect(router.state.location.pathname).toBe('/trabajos');
    expect(screen.queryByRole('status', { name: /asignado/ })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: TIENDA.item.title })).not.toBeInTheDocument(),
    );
    expect(checkbox(TALADRO.item.title)).not.toBeChecked();
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

  it('la pestaña «Disponibles» vuelve a la lista para marcar', async () => {
    logIn();
    mockApi({
      'GET /trabajos': Response.json({ jobs: [TIENDA] }),
      'GET /trabajos/mios': Response.json({ jobs: [TALADRO_MIO] }),
    });
    const user = userEvent.setup();
    renderRoute('/trabajos/mios');

    await user.click(await screen.findByRole('link', { name: 'Disponibles (1)' }));

    expect(await screen.findByRole('checkbox', { name: TIENDA.item.title })).toBeInTheDocument();
  });
});
