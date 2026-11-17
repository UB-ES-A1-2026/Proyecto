// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// Demanda de fechas en el calendario de la solicitud (US-04.07, #312).
// Wireframe: docs/wireframes/US-04.07-demanda-calendario.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RentalRequest, type RentalItem } from '../src/components/RentalRequest';
import { AuthContext } from '../src/context/authContextValue';
import { getItemDemand } from '../src/services/demandService';
import {
  demandLevel,
  formatDayDemand,
  formatMatchingRequests,
  monthBounds,
} from '../src/utils/calendar';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

const ITEM: RentalItem = { id: 'item-1', title: 'Bicicleta de montaña talla M', pricePerDay: 10 };

// Demanda de noviembre: el 21 y el 22 poca, el 24 media y el 23 mucha; el 26 y el 27 reservados.
const NOVEMBER = {
  days: [
    { date: '2026-11-21', pendingRequests: 1 },
    { date: '2026-11-22', pendingRequests: 2 },
    { date: '2026-11-23', pendingRequests: 6 },
    { date: '2026-11-24', pendingRequests: 4 },
  ],
  pendingRequests: 6,
  bookedDays: ['2026-11-26', '2026-11-27'],
};

type Handler = (url: string) => Response | Promise<Response>;

// Un mes entero («del 1 al último día») es la demanda del calendario; cualquier otro rango, la de
// las fechas elegidas. La disponibilidad siempre dice que están libres.
const MONTH_RANGE = /from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-(28|29|30|31)$/;

function mockFetch({
  onMonth = () => Response.json(NOVEMBER),
  onRange = () => Response.json({ days: [], pendingRequests: 0, bookedDays: [] }),
}: { onMonth?: Handler; onRange?: Handler } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/reservas/disponibilidad')) return Response.json({ available: true });
    if (url.includes('/demanda')) return MONTH_RANGE.test(url) ? onMonth(url) : onRange(url);
    return Response.json({}, { status: 500 });
  });
}

function renderRentalRequest() {
  const onSessionExpired = vi.fn();
  const clearSession = vi.fn();
  render(
    <AuthContext.Provider value={{ session: SESSION, saveSession: vi.fn(), clearSession }}>
      <RentalRequest item={ITEM} onRequested={vi.fn()} onSessionExpired={onSessionExpired} />
    </AuthContext.Provider>,
  );
  return { onSessionExpired, clearSession };
}

// El botón de un día del calendario por el principio de su nombre («23 de noviembre…»).
function day(label: string) {
  return within(screen.getByRole('grid')).getByRole('button', {
    name: (name) => name.startsWith(`${label} de 2026`),
  });
}

function chooseDates(startDate: string, endDate: string) {
  fireEvent.change(screen.getByLabelText('Fecha de inicio'), { target: { value: startDate } });
  fireEvent.change(screen.getByLabelText('Fecha de fin'), { target: { value: endDate } });
}

function requestButton() {
  return screen.getByRole('button', { name: 'Solicitar alquiler' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 13, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('cálculos de la demanda (US-04.07)', () => {
  it('los niveles son 0 libre, 1–2 poca, 3–5 media y 6 o más mucha', () => {
    expect([0, 1, 2, 3, 5, 6, 20].map(demandLevel)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('los textos del día y del aviso van en singular y en plural, y con 0 no hay aviso', () => {
    expect(formatDayDemand(0)).toBe('Ninguna solicitud para este día');
    expect(formatDayDemand(1)).toBe('1 solicitud para este día');
    expect(formatDayDemand(6)).toBe('6 solicitudes para este día');
    expect(formatMatchingRequests(0)).toBeNull();
    expect(formatMatchingRequests(1)).toBe(
      'Hay 1 solicitud que coincide con tus fechas. Es posible que no te acepten.',
    );
    expect(formatMatchingRequests(6)).toBe(
      'Hay 6 solicitudes que coinciden con tus fechas. Es posible que no te acepten.',
    );
  });

  it('el mes va del primer al último día, también en febrero y en diciembre', () => {
    expect(monthBounds('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('el servicio pide la demanda con la sesión y rellena lo que falte', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ days: [], pendingRequests: 0 }));

    await expect(
      getItemDemand('token-de-prueba', 'item-1', '2026-11-01', '2026-11-30'),
    ).resolves.toEqual({ days: [], pendingRequests: 0, bookedDays: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/objetos\/item-1\/demanda\?from=2026-11-01&to=2026-11-30$/);
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer token-de-prueba' });
  });
});

describe('calendario con la demanda (US-04.07, #312)', () => {
  it('colorea cada día según su nivel y enseña la leyenda (criterios 1 y 2)', async () => {
    const fetchMock = mockFetch();
    renderRentalRequest();

    await waitFor(() => expect(day('23 de noviembre')).toHaveClass('has-demand-3'));
    expect(day('21 de noviembre')).toHaveClass('has-demand-1');
    expect(day('22 de noviembre')).toHaveClass('has-demand-1');
    expect(day('24 de noviembre')).toHaveClass('has-demand-2');
    expect(day('25 de noviembre')).not.toHaveClass('has-demand-1');
    const legend = screen.getByRole('list', { name: 'Leyenda de la demanda' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Libre',
      'Poca demanda (1–2)',
      'Demanda media (3–5)',
      'Mucha demanda (6 o más)',
      'Reservado',
    ]);
    const monthCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/demanda'));
    expect(String(monthCall?.[0])).toMatch(/demanda\?from=2026-11-01&to=2026-11-30$/);
  });

  it('el nivel también va en texto: en la etiqueta del día y en la línea de debajo', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderRentalRequest();

    await waitFor(() => expect(day('23 de noviembre')).toHaveClass('has-demand-3'));
    expect(day('23 de noviembre')).toHaveAccessibleName(
      '23 de noviembre de 2026, 6 solicitudes para este día',
    );
    expect(day('25 de noviembre')).toHaveAccessibleName('25 de noviembre de 2026');

    await user.hover(day('23 de noviembre'));
    expect(screen.getByText('23 de noviembre de 2026: 6 solicitudes para este día')).toBeVisible();
    await user.hover(day('21 de noviembre'));
    expect(screen.getByText('21 de noviembre de 2026: 1 solicitud para este día')).toBeVisible();
    await user.hover(day('25 de noviembre'));
    expect(
      screen.getByText('25 de noviembre de 2026: Ninguna solicitud para este día'),
    ).toBeVisible();
  });

  it('los días reservados salen como «Reservado», sin color y sin poder elegirlos', async () => {
    mockFetch();
    renderRentalRequest();

    await waitFor(() => expect(day('26 de noviembre')).toBeDisabled());
    expect(day('26 de noviembre')).toHaveClass('is-booked');
    expect(day('26 de noviembre')).toHaveAccessibleName('26 de noviembre de 2026, Reservado');
    expect(day('27 de noviembre')).toBeDisabled();
    expect(day('26 de noviembre')).not.toHaveClass('has-demand-1');
  });

  it('al elegir las fechas avisa de cuántas solicitudes coinciden (criterio 4)', async () => {
    const fetchMock = mockFetch({
      onRange: () => Response.json({ days: [], pendingRequests: 6, bookedDays: [] }),
    });
    renderRentalRequest();

    chooseDates('22/11/2026', '24/11/2026');

    expect(
      await screen.findByText(
        'Hay 6 solicitudes que coinciden con tus fechas. Es posible que no te acepten.',
      ),
    ).toBeVisible();
    expect(requestButton()).toBeEnabled();
    const rangeCall = fetchMock.mock.calls.find(([url]) => String(url).includes('from=2026-11-22'));
    expect(String(rangeCall?.[0])).toMatch(/demanda\?from=2026-11-22&to=2026-11-24$/);
  });

  it('con una sola solicitud el aviso va en singular, y con ninguna no sale', async () => {
    let pendingRequests = 1;
    mockFetch({
      onRange: () => Response.json({ days: [], pendingRequests, bookedDays: [] }),
    });
    renderRentalRequest();

    chooseDates('22/11/2026', '24/11/2026');
    expect(
      await screen.findByText(
        'Hay 1 solicitud que coincide con tus fechas. Es posible que no te acepten.',
      ),
    ).toBeVisible();

    pendingRequests = 0;
    chooseDates('28/11/2026', '29/11/2026');
    await waitFor(() => expect(requestButton()).toBeEnabled());
    await waitFor(() => expect(screen.queryByText(/que coincid/)).not.toBeInTheDocument());
  });

  it('si la demanda no carga, el calendario sale sin colores y se puede solicitar igual', async () => {
    mockFetch({
      onMonth: () => Response.json({ error: 'Error' }, { status: 500 }),
      onRange: () => Response.json({ error: 'Error' }, { status: 500 }),
    });
    renderRentalRequest();

    expect(
      await screen.findByText('No se ha podido cargar la demanda de las fechas.'),
    ).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Leyenda de la demanda' })).not.toBeInTheDocument();
    expect(day('23 de noviembre')).not.toHaveClass('has-demand-3');

    chooseDates('22/11/2026', '24/11/2026');
    await waitFor(() => expect(requestButton()).toBeEnabled());
    expect(screen.queryByText(/que coincid/)).not.toBeInTheDocument();
  });

  it('con la sesión caducada la borra y vuelve al login', async () => {
    mockFetch({ onMonth: () => Response.json({ error: 'Sesión caducada' }, { status: 401 }) });
    const { clearSession, onSessionExpired } = renderRentalRequest();

    await waitFor(() => expect(clearSession).toHaveBeenCalled());
    expect(onSessionExpired).toHaveBeenCalled();
  });
});
