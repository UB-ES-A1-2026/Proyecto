// Generado con asistencia de IA (Claude)
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservationCard } from '../src/components/ReservationCard';
import { AuthContext } from '../src/context/authContextValue';
import type { Reservation } from '../src/services/reservationService';
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

// Responde según el método y el final de la URL.
function mockApi(routes: Record<string, Reply>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const key = Object.keys(routes).find((candidate) => {
      const [routeMethod, path] = candidate.split(' ');
      return routeMethod === method && url.endsWith(path);
    });
    if (!key) throw new Error(`Petición inesperada: ${method} ${url}`);
    const reply = routes[key];
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
  it('el arrendatario ve el porcentaje, el importe, lo que se le devuelve y la tabla', async () => {
    logIn();
    mockApi({
      'GET /usuarios/me/reservas': Response.json({ sent: [reservation()], received: [] }),
      'GET /reservas/r1/cancelacion': Response.json(PREVIEW_35),
    });
    const user = userEvent.setup();
    renderRoute('/mis-solicitudes');

    await openCard(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));

    const dialog = await screen.findByRole('dialog', { name: '¿Cancelar reserva?' });
    expect(
      await within(dialog).findByText(/Faltan 5 días para el inicio: pagarás el/),
    ).toHaveTextContent(/35 % del alquiler \(7,00\s€\) a ana\./);
    expect(dialog).toHaveTextContent(/Te devolvemos 13,00\s€\. La fianza se libera entera\./);
    expect(dialog).toHaveTextContent('Menos de 3 días: 100 % · de 3 a 7: 35 % · 8 o más: nada.');
  });

  it('si cancela el propietario, la penalización es suya y al arrendatario se le devuelve todo', async () => {
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

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Faltan 2 días para el inicio/)).toHaveTextContent(
      /100 % del alquiler \(20,00\s€\) a bruno\./,
    );
    expect(dialog).toHaveTextContent(
      /A bruno se le devuelve todo lo que pagó \(20,00\s€\) y se libera su fianza\./,
    );
  });

  it('una solicitud pendiente se cancela gratis y se libera el bloqueo', async () => {
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

    const dialog = await screen.findByRole('dialog', { name: '¿Cancelar solicitud?' });
    expect(
      await within(dialog).findByText(/Cancelar ahora es gratis: ana todavía no la ha aceptado/),
    ).toHaveTextContent(/Liberamos los 20,00\s€ bloqueados en tu tarjeta\./);
  });

  it('al confirmar, la reserva pasa a «Cancelada» con quién la canceló y la penalización (criterio 6)', async () => {
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
      /La cancelaste tú el 16 de noviembre de 2026\. Penalización: 7,00\s€ \(35 %\) para ana\. Te hemos devuelto 13,00\s€\./,
    );
    expect(within(card).queryByRole('button', { name: 'Cancelar reserva' })).toBeNull();
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

  it('si canceló el arrendatario, el propietario ve que recibe la penalización', () => {
    expect(renderCard(cancelled(CANCELLED_BY_BRUNO), 'received')).toHaveTextContent(
      /La canceló bruno el 16 de noviembre de 2026\. Recibes la penalización: 7,00\s€ \(35 %\)\./,
    );
  });

  it('si canceló el propietario, el arrendatario recupera todo y la penalización es del propietario', () => {
    const byAna = {
      by: { id: 'u1', username: 'ana' },
      at: '2026-11-16T10:00:00.000Z',
      penaltyPercent: 100,
      penaltyAmount: '20.00',
      refundAmount: '20.00',
    };
    expect(renderCard(cancelled(byAna), 'sent')).toHaveTextContent(
      /La canceló ana el 16 de noviembre de 2026\. Te hemos devuelto todo lo que pagaste \(20,00\s€\); la penalización de 20,00\s€ \(100 %\) es a cargo de ana\./,
    );
  });

  it('sin penalización lo dice', () => {
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
    ).toHaveTextContent('La cancelaste tú el 16 de noviembre de 2026. Sin penalización.');
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

  it('con 2 días de margen avisa de que cancelar costará el alquiler completo', async () => {
    await goToSummary('18/11/2026', '19/11/2026');

    expect(
      screen.getByText(
        'Empieza en menos de 3 días: si cancelas una vez aceptada, pagarás el alquiler completo.',
      ),
    ).toBeInTheDocument();
  });

  it('con 3 días o más no avisa', async () => {
    await goToSummary('19/11/2026', '20/11/2026');

    expect(screen.queryByText(/Empieza en menos de 3 días/)).not.toBeInTheDocument();
  });
});
