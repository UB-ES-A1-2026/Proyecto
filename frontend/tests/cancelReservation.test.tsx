// Generado con asistencia de IA (Claude)
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservationCard } from '../src/components/ReservationCard';
import { AuthContext } from '../src/context/authContextValue';
import type { Reservation } from '../src/services/reservationService';
import { daysUntil } from '../src/utils/rental';
import { RentalFlow } from './rentalFlow';
import { renderRoute } from './renderRoute';

// US-04.05 Cancelar una reserva con penalización, frontend (#309): criterios de la historia (#64).

const BRUNO = {
  token: 'token-de-bruno',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u2', username: 'bruno', email: 'bruno@rentit.test', role: 'user' },
};
const ANA = { ...BRUNO, token: 'token-de-ana', user: { ...BRUNO.user, id: 'u1', username: 'ana' } };

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    item: { id: 'item-1', title: 'Taladro percutor Bosch' },
    startDate: '2026-11-21',
    endDate: '2026-11-24',
    totalPrice: '20.00',
    status: 'paid',
    renter: { id: 'u2', username: 'bruno' },
    owner: { id: 'u1', username: 'ana' },
    createdAt: '2026-11-10T12:00:00.000Z',
    myRating: null,
    cancellation: null,
    ...overrides,
  };
}

const PREVIEW_35 = {
  daysUntilStart: 5,
  penaltyPercent: 35,
  penaltyAmount: '7.00',
  refundAmount: '13.00',
  free: false,
  releasesHold: false,
};

const CANCELLED_BY_BRUNO = {
  by: { id: 'u2', username: 'bruno' },
  at: '2026-11-16T10:00:00.000Z',
  penaltyPercent: 35,
  penaltyAmount: '7.00',
  refundAmount: '13.00',
};

type Reply = Response | (() => Response | Promise<Response>);

// Responde según el método y el final de la URL; una ruta puede tener varias respuestas seguidas.
function mockApi(routes: Record<string, Reply | Reply[]>) {
  const calls = new Map<string, number>();
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const key = Object.keys(routes).find((candidate) => {
      const [routeMethod, path] = candidate.split(' ');
      return routeMethod === method && url.endsWith(path);
    });
    if (!key) throw new Error(`Petición inesperada: ${method} ${url}`);
    const replies = ([] as Reply[]).concat(routes[key]);
    const index = calls.get(key) ?? 0;
    calls.set(key, index + 1);
    const reply = replies[Math.min(index, replies.length - 1)];
    return typeof reply === 'function' ? reply() : reply.clone();
  });
}

function logIn(session = BRUNO) {
  localStorage.setItem('rentit.session', JSON.stringify(session));
}

async function openCard(
  user: ReturnType<typeof userEvent.setup>,
  title = /Taladro percutor Bosch/,
) {
  await user.click(await screen.findByRole('button', { name: title }));
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('«Cancelar» en Mis solicitudes (criterio 1)', () => {
  it('sale en las enviadas pendientes («Cancelar solicitud»), aceptadas y pagadas, y en las recibidas aceptadas o pagadas', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({
        sent: [
          reservation({ id: 's1', item: { id: 'i1', title: 'Pagada' } }),
          reservation({ id: 's2', item: { id: 'i2', title: 'Pendiente' }, status: 'pending' }),
          reservation({ id: 's3', item: { id: 'i3', title: 'Rechazada' }, status: 'rejected' }),
          reservation({ id: 's4', item: { id: 'i4', title: 'Finalizada' }, status: 'finished' }),
        ],
        received: [
          reservation({ id: 'r1', item: { id: 'i5', title: 'Recibida pagada' } }),
          reservation({
            id: 'r2',
            item: { id: 'i6', title: 'Recibida pendiente' },
            status: 'pending',
          }),
        ],
      }),
    });

    renderRoute('/mis-solicitudes');
    await screen.findByRole('button', { name: /^Pagada/ });

    const card = (name: RegExp) =>
      within(screen.getByRole('button', { name }).closest('article') as HTMLElement);
    expect(
      card(/^Pagada/).getByRole('button', { name: 'Cancelar reserva', hidden: true }),
    ).toBeTruthy();
    expect(
      card(/^Pendiente/).getByRole('button', { name: 'Cancelar solicitud', hidden: true }),
    ).toBeTruthy();
    expect(card(/^Rechazada/).queryByRole('button', { name: /Cancelar/, hidden: true })).toBeNull();
    expect(
      card(/^Finalizada/).queryByRole('button', { name: /Cancelar/, hidden: true }),
    ).toBeNull();
    expect(
      card(/^Recibida pagada/).getByRole('button', { name: 'Cancelar reserva', hidden: true }),
    ).toBeTruthy();
    // Una pendiente recibida se rechaza con «Rechazar», no se cancela.
    expect(
      card(/^Recibida pendiente/).queryByRole('button', { name: /Cancelar/, hidden: true }),
    ).toBeNull();
  });
});

describe('Ventana de cancelar (criterios 2, 3 y 4)', () => {
  it('el arrendatario ve la compensación por las molestias y lo que se le devuelve, sin la tabla', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /reservas/r1/cancelacion': Response.json(PREVIEW_35),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));

    const dialog = await screen.findByRole('dialog', { name: '¿Cancelar la reserva?' });
    expect(
      await within(dialog).findByText(/Faltan 5 días para el inicio: compensarás a ana con el/),
    ).toHaveTextContent(/35 % del alquiler \(7,00\s€\) por las molestias\./);
    expect(dialog).toHaveTextContent(/Te devolvemos 13,00\s€\. La fianza se libera entera\./);
    // La tabla de porcentajes está en la ayuda, no en la ventana.
    expect(dialog).not.toHaveTextContent(/8 o más/);
  });

  it('si cancela el propietario, compensa él y al arrendatario se le devuelve todo', async () => {
    logIn(ANA);
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [], received: [reservation()] }),
      'GET /reservas/r1/cancelacion': Response.json({
        ...PREVIEW_35,
        daysUntilStart: 2,
        penaltyPercent: 100,
        penaltyAmount: '20.00',
        refundAmount: '20.00',
      }),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));

    const dialog = await screen.findByRole('dialog', { name: '¿Cancelar la reserva?' });
    expect(dialog).toHaveTextContent('solicitada por bruno');
    expect(await within(dialog).findByText(/Faltan 2 días para el inicio/)).toHaveTextContent(
      /compensarás a bruno con el 100 % del alquiler \(20,00\s€\) por las molestias\./,
    );
    expect(dialog).toHaveTextContent(
      /A bruno se le devuelve todo lo que pagó \(20,00\s€\) y se libera su fianza\./,
    );
  });

  it('si es gratis, la ventana solo pide confirmar, sin textos de compensación', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({
        sent: [reservation({ status: 'pending' })],
        received: [],
      }),
      'GET /reservas/r1/cancelacion': Response.json({
        ...PREVIEW_35,
        penaltyPercent: 0,
        penaltyAmount: '0.00',
        refundAmount: '0.00',
        free: true,
        releasesHold: true,
      }),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar solicitud' }));

    const dialog = await screen.findByRole('dialog', { name: '¿Cancelar la solicitud?' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancelar solicitud' })).toBeEnabled(),
    );
    expect(dialog).toHaveTextContent(
      'Taladro percutor Bosch · del 21 de noviembre al 24 de noviembre',
    );
    expect(dialog).not.toHaveTextContent(/compensa|devolvemos|gratis/i);
  });

  it('al confirmar, la reserva pasa a «Cancelada» con quién la canceló y la compensación (criterio 6)', async () => {
    logIn();
    const fetchMock = mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /reservas/r1/cancelacion': Response.json(PREVIEW_35),
      'POST /reservas/r1/cancelar': Response.json(
        reservation({ status: 'cancelled', cancellation: CANCELLED_BY_BRUNO }),
      ),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/Faltan 5 días/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar reserva' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const card = screen.getByRole('article');
    expect(within(card).getByRole('button', { name: /Taladro percutor Bosch/ })).toHaveTextContent(
      'Cancelada',
    );
    expect(card).toHaveTextContent(
      /La cancelaste tú el 16 de noviembre de 2026\. Compensación a ana por las molestias: 7,00\s€ \(35 %\)\. Te hemos devuelto 13,00\s€\./,
    );
    expect(within(card).queryByRole('button', { name: 'Cancelar reserva' })).toBeNull();
    // El botón que abrió la ventana ya no está: el foco va al texto de la cancelación.
    expect(within(card).getByRole('status')).toHaveFocus();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(new Headers(post?.[1]?.headers).get('Authorization')).toBe('Bearer token-de-bruno');
  });

  it('mientras cancela, los botones están desactivados', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /reservas/r1/cancelacion': Response.json(PREVIEW_35),
      'POST /reservas/r1/cancelar': () => new Promise<Response>(() => undefined),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/Faltan 5 días/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar reserva' }));

    expect(within(dialog).getByRole('button', { name: 'Cancelando…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Volver' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cerrar ventana' })).toBeDisabled();

    // Ni Esc ni el clic en el fondo la cierran: la cancelación sigue en marcha.
    await user.keyboard('{Escape}');
    fireEvent.click(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('cuando empieza hoy lo dice así', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /reservas/r1/cancelacion': Response.json({
        ...PREVIEW_35,
        daysUntilStart: 0,
        penaltyPercent: 100,
        penaltyAmount: '20.00',
        refundAmount: '0.00',
      }),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/^Empieza hoy: compensarás a ana/)).toHaveTextContent(
      /100 % del alquiler \(20,00\s€\) por las molestias\./,
    );
  });

  it('si no se puede calcular lo que cuesta (500), lo dice y deja reintentarlo', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /reservas/r1/cancelacion': [
        Response.json({ error: 'Error interno.' }, { status: 500 }),
        Response.json(PREVIEW_35),
      ],
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    const dialog = await screen.findByRole('dialog');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No hemos podido calcular lo que cuesta cancelar. Inténtalo de nuevo.',
    );
    expect(within(dialog).queryByRole('button', { name: 'Cancelar reserva' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Reintentar' }));

    expect(await within(dialog).findByText(/Faltan 5 días/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancelar reserva' })).toBeEnabled();
  });

  it('si al abrirla ya no se puede cancelar (409), lo dice y actualiza la lista', async () => {
    logIn();
    const fetchMock = mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /reservas/r1/cancelacion': Response.json(
        { error: 'Esta reserva ya no se puede cancelar.' },
        { status: 409 },
      ),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    const dialog = await screen.findByRole('dialog');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Esta reserva ya no se puede cancelar.',
    );
    expect(within(dialog).queryByRole('button', { name: 'Cancelar reserva' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Reintentar' })).toBeNull();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/usuarios/me/reservas')),
      ).toHaveLength(2),
    );
  });

  it('si falla el reembolso, la reserva no cambia y se puede reintentar (texto de la historia)', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /reservas/r1/cancelacion': Response.json(PREVIEW_35),
      'POST /reservas/r1/cancelar': Response.json(
        { error: 'No se ha podido cancelar. Inténtalo de nuevo.' },
        { status: 502 },
      ),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/Faltan 5 días/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar reserva' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No se ha podido cancelar. Inténtalo de nuevo.',
    );
    expect(within(dialog).getByRole('button', { name: 'Cancelar reserva' })).toBeEnabled();
  });

  it('si ya no se puede cancelar (409), lo dice, no deja confirmar y actualiza la lista', async () => {
    logIn();
    const fetchMock = mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /reservas/r1/cancelacion': Response.json(PREVIEW_35),
      'POST /reservas/r1/cancelar': Response.json(
        { error: 'Esta reserva ya no se puede cancelar.' },
        { status: 409 },
      ),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/Faltan 5 días/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar reserva' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Esta reserva ya no se puede cancelar.',
    );
    expect(within(dialog).queryByRole('button', { name: 'Cancelar reserva' })).toBeNull();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/usuarios/me/reservas')),
      ).toHaveLength(2),
    );
  });

  it('«Volver» cierra la ventana sin cancelar nada', async () => {
    logIn();
    const fetchMock = mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /reservas/r1/cancelacion': Response.json(PREVIEW_35),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Volver' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });
});

describe('Reserva cancelada vista por cada persona (criterio 6)', () => {
  function renderCard(data: Reservation, role: 'sent' | 'received') {
    render(
      <MemoryRouter>
        <ReservationCard reservation={data} role={role} />
      </MemoryRouter>,
    );
    return screen.getByRole('article');
  }

  const cancelled = (cancellation: Reservation['cancellation']) =>
    reservation({ status: 'cancelled', cancellation });

  it('si canceló el arrendatario, el propietario ve que recibe la compensación', () => {
    expect(renderCard(cancelled(CANCELLED_BY_BRUNO), 'received')).toHaveTextContent(
      /La canceló bruno el 16 de noviembre de 2026\. Recibes 7,00\s€ \(35 %\) como compensación por las molestias\./,
    );
  });

  it('si canceló el propietario, el arrendatario recupera todo y recibe la compensación', () => {
    const byAna = {
      by: { id: 'u1', username: 'ana' },
      at: '2026-11-16T10:00:00.000Z',
      penaltyPercent: 100,
      penaltyAmount: '20.00',
      refundAmount: '20.00',
    };
    expect(renderCard(cancelled(byAna), 'sent')).toHaveTextContent(
      /La canceló ana el 16 de noviembre de 2026\. Te hemos devuelto todo lo que pagaste \(20,00\s€\) y recibes 20,00\s€ \(100 %\) como compensación por las molestias\./,
    );
  });

  it('si fue gratis, solo dice quién y cuándo', () => {
    expect(
      renderCard(
        cancelled({
          ...CANCELLED_BY_BRUNO,
          penaltyPercent: 0,
          penaltyAmount: '0.00',
          refundAmount: '0.00',
        }),
        'sent',
      ),
    ).toHaveTextContent(/La cancelaste tú el 16 de noviembre de 2026\.$/);
  });
});

// El aviso está en «Tu solicitud» de «Confirmar y pagar» (US-07.01), donde se confirma la solicitud.
describe('Aviso al solicitar con menos de 3 días (criterio 5)', () => {
  beforeEach(() => {
    // Solo se finge la fecha: «hoy» es el 16 de noviembre de 2026.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0));
    // Una respuesta nueva por llamada: la demanda del calendario (US-04.07) también llama a la API.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/demanda')
        ? Response.json({ days: [], pendingRequests: 0, bookedDays: [] })
        : Response.json({ available: true }),
    );
  });

  afterEach(() => vi.useRealTimers());

  async function goToSummary(start: string, end: string) {
    render(
      <AuthContext.Provider value={{ session: BRUNO, saveSession: vi.fn(), clearSession: vi.fn() }}>
        <RentalFlow
          item={{ id: 'item-1', title: 'Taladro percutor Bosch', pricePerDay: 6 }}
          onRequested={vi.fn()}
          onSessionExpired={vi.fn()}
        />
      </AuthContext.Provider>,
    );
    fireEvent.change(screen.getByLabelText('Fecha de inicio'), { target: { value: start } });
    fireEvent.change(screen.getByLabelText('Fecha de fin'), { target: { value: end } });
    const request = screen.getByRole('button', { name: 'Solicitar alquiler' });
    await waitFor(() => expect(request).toBeEnabled());
    fireEvent.click(request);
    await screen.findByRole('heading', { name: 'Tu solicitud' });
  }

  it('con 2 días de margen avisa de la compensación con el alquiler completo', async () => {
    await goToSummary('18/11/2026', '19/11/2026');

    expect(
      screen.getByText(
        'Empieza en menos de 3 días: si cancelas una vez aceptada, compensarás al propietario con el alquiler completo por las molestias.',
      ),
    ).toBeInTheDocument();
  });

  it('con 3 días o más no avisa', async () => {
    await goToSummary('19/11/2026', '20/11/2026');

    expect(screen.queryByText(/Empieza en menos de 3 días/)).not.toBeInTheDocument();
  });

  // «Hoy» es el día de España: a las 00:30 del 17 en Madrid ya es 17, aunque en UTC sea 16.
  it('cerca de medianoche cuenta con la fecha de España', async () => {
    vi.setSystemTime(new Date('2026-11-16T23:30:00Z'));
    await goToSummary('19/11/2026', '20/11/2026');

    expect(screen.getByText(/Empieza en menos de 3 días/)).toBeInTheDocument();
  });
});

describe('daysUntil: días hasta el inicio con la fecha de España', () => {
  it.each([
    ['2026-11-16', '2026-11-16', 0],
    ['2026-11-18', '2026-11-16', 2],
    ['2026-11-19', '2026-11-16', 3],
    ['2026-11-24', '2026-11-16', 8],
    ['2026-12-01', '2026-11-30', 1],
  ])('del %s visto el %s faltan %i días', (start, today, expected) => {
    expect(daysUntil(start, today)).toBe(expected);
  });

  it('sin «hoy» usa la fecha de España', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T23:30:00Z'));
    expect(daysUntil('2026-11-19')).toBe(2);
    vi.useRealTimers();
  });
});
