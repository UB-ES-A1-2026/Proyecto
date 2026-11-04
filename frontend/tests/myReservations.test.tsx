import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReservationCard } from '../src/components/ReservationCard';
import type { Reservation } from '../src/services/reservationService';
import { renderRoute } from './renderRoute';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    item: { id: 'item-1', title: 'Taladro percutor Bosch' },
    startDate: '2026-11-08',
    endDate: '2026-11-10',
    totalPrice: '15.00',
    status: 'pending',
    renter: { id: 'u2', username: 'bruno' },
    owner: { id: 'u1', username: 'ana' },
    createdAt: '2026-10-31T12:00:00.000Z',
    ...overrides,
  };
}

function mockReservations(data: { sent: Reservation[]; received: Reservation[] }) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(data));
}

afterEach(() => localStorage.clear());

describe('Mis solicitudes (US-04.02, #124)', () => {
  it('muestra las solicitudes enviadas y recibidas con sus estados', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    mockReservations({
      sent: [reservation({ id: 'sent', item: { id: 'i1', title: 'Bicicleta de paseo' } })],
      received: [
        reservation({ id: 'pending' }),
        reservation({
          id: 'accepted',
          item: { id: 'i2', title: 'Tienda de campaña' },
          status: 'accepted',
        }),
        reservation({
          id: 'rejected',
          item: { id: 'i3', title: 'Escalera plegable' },
          status: 'rejected',
        }),
      ],
    });

    renderRoute('/mis-solicitudes');

    await screen.findByRole('button', { name: /Bicicleta de paseo/ });
    const sentSection = screen.getByRole('region', { name: 'Enviadas' });
    const receivedSection = screen.getByRole('region', { name: 'Recibidas' });
    expect(
      await within(sentSection).findByRole('button', { name: /Bicicleta de paseo/ }),
    ).toBeVisible();
    expect(
      within(receivedSection).getByRole('button', { name: /Taladro percutor Bosch/ }),
    ).toBeVisible();
    expect(
      within(receivedSection).getByRole('button', { name: /Tienda de campaña.*Aceptada/ }),
    ).toBeVisible();
    expect(
      within(receivedSection).getByRole('button', { name: /Escalera plegable.*Rechazada/ }),
    ).toBeVisible();
    expect(
      within(receivedSection).getByRole('button', { name: /Taladro percutor Bosch.*Pendiente/ }),
    ).toBeVisible();
  });

  it.each([
    ['un solo día', '2026-11-08', '2026-11-08', '8 nov. 2026'],
    [
      'un solo día, con hora',
      '2026-11-08T00:00:00.000Z',
      '2026-11-08T00:00:00.000Z',
      '8 nov. 2026',
    ],
    ['varios días del mismo mes', '2026-11-08', '2026-11-10', '8–10 nov. 2026'],
    ['días de meses distintos', '2026-11-30', '2026-12-02', '30 nov. 2026–2 dic. 2026'],
  ])('el botón termina en su estado y resume las fechas de %s', async (_, start, end, dates) => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    mockReservations({
      sent: [],
      received: [reservation({ startDate: start, endDate: end, status: 'accepted' })],
    });

    renderRoute('/mis-solicitudes');

    expect(
      await screen.findByRole('button', { name: /Taladro percutor Bosch/ }),
    ).toHaveAccessibleName(`Taladro percutor Bosch · ${dates} · Aceptada`);
  });

  it('despliega el detalle, formatos de fechas e importe y enlaza al objeto', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    mockReservations({ sent: [], received: [reservation()] });
    const user = userEvent.setup();

    renderRoute('/mis-solicitudes');
    const toggle = await screen.findByRole('button', { name: /Taladro percutor Bosch/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Importe total: 15,00\s*€/u)).toBeVisible();
    expect(
      screen.getByText('Fechas: Del 8 de noviembre de 2026 al 10 de noviembre de 2026'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Taladro percutor Bosch' })).toHaveAttribute(
      'href',
      '/objetos/item-1',
    );
    expect(screen.getByText('Solicitada por: bruno')).toBeVisible();
    expect(screen.getByText('Enviada el 31 de octubre de 2026')).toBeVisible();
  });

  it('formatea fechas sin desplazamiento de zona horaria', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    mockReservations({
      sent: [],
      received: [reservation({ startDate: '2026-11-01', endDate: '2026-11-02' })],
    });
    const user = userEvent.setup();

    renderRoute('/mis-solicitudes');
    await user.click(await screen.findByRole('button', { name: /Taladro percutor Bosch/ }));

    expect(
      screen.getByText('Fechas: Del 1 de noviembre de 2026 al 2 de noviembre de 2026'),
    ).toBeVisible();
    expect(screen.queryByText(/31 de octubre de 2026 al/)).not.toBeInTheDocument();
  });

  it('formatea fechas recibidas con hora', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    mockReservations({
      sent: [],
      received: [
        reservation({
          startDate: '2026-11-01T00:00:00.000Z',
          endDate: '2026-11-03T00:00:00.000Z',
        }),
      ],
    });
    const user = userEvent.setup();

    renderRoute('/mis-solicitudes');
    await user.click(await screen.findByRole('button', { name: /Taladro percutor Bosch/ }));

    expect(
      screen.getByText('Fechas: Del 1 de noviembre de 2026 al 3 de noviembre de 2026'),
    ).toBeVisible();
  });

  it('muestra el propietario en las solicitudes enviadas', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    mockReservations({
      sent: [reservation({ owner: { id: 'u3', username: 'carla' } })],
      received: [],
    });
    const user = userEvent.setup();

    renderRoute('/mis-solicitudes');
    await user.click(await screen.findByRole('button', { name: /Taladro percutor Bosch/ }));

    expect(screen.getByText('Propietario: carla')).toBeVisible();
  });

  it('muestra los dos mensajes cuando no hay solicitudes', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    mockReservations({ sent: [], received: [] });

    renderRoute('/mis-solicitudes');

    expect(await screen.findByText('No tienes solicitudes abiertas')).toBeVisible();
    expect(screen.getByText('Todavía no has recibido solicitudes.')).toBeVisible();
  });

  it('limpia la sesión y redirige al login si el servidor responde 401', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: 'Sesión no válida.' }, { status: 401 }),
    );
    const { router } = renderRoute('/mis-solicitudes');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(localStorage.getItem('rentit.session')).toBeNull();
  });

  it('muestra el mensaje de conexión y un mensaje genérico para otros errores', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { unmount } = renderRoute('/mis-solicitudes');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se puede conectar con el servidor. Inténtalo más tarde.',
    );
    unmount();
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: 'error inesperado' }, { status: 500 }),
    );
    renderRoute('/mis-solicitudes');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hemos podido cargar tus solicitudes. Inténtalo de nuevo más tarde.',
    );
  });
});

describe('ReservationCard', () => {
  it('una solicitud de un solo día muestra una fecha, no un rango', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    mockReservations({
      sent: [reservation({ startDate: '2026-11-09', endDate: '2026-11-09' })],
      received: [],
    });

    renderRoute('/mis-solicitudes');
    await user.click(await screen.findByRole('button', { name: /Taladro percutor Bosch/ }));

    expect(screen.getByText('Fecha: 9 de noviembre de 2026')).toBeVisible();
    expect(screen.queryByText(/^Fechas: Del/)).not.toBeInTheDocument();
  });

  it('si otra sesión ya respondió, la tarjeta se actualiza y se mantiene el aviso', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    let responded = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        responded = true;
        return Response.json({ error: 'Esta solicitud ya no está pendiente.' }, { status: 409 });
      }
      return Response.json({
        sent: [],
        received: [reservation({ status: responded ? 'accepted' : 'pending' })],
      });
    });

    renderRoute('/mis-solicitudes');
    const toggle = await screen.findByRole('button', { name: /Pendiente$/ });
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByRole('button', { name: /Aceptada$/ })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Esta solicitud ya no está pendiente.');
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument();
  });

  it('muestra children dentro del detalle desplegable', async () => {
    const user = userEvent.setup();

    const { container } = render(
      <MemoryRouter>
        <ReservationCard reservation={reservation()} role="received">
          <p>Acciones futuras</p>
        </ReservationCard>
      </MemoryRouter>,
    );
    const button = within(container).getByRole('button', { name: /Taladro percutor Bosch/ });

    expect(within(container).getByText('Acciones futuras')).not.toBeVisible();
    await user.click(button);
    expect(within(container).getByText('Acciones futuras')).toBeVisible();
  });
});

describe('Aceptar y rechazar desde Mis solicitudes (US-04.03 y US-04.04, #126)', () => {
  function mockApi(data: { sent: Reservation[]; received: Reservation[] }) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method !== 'POST') return Response.json(data);
      const status = url.endsWith('/aceptar') ? 'accepted' : 'rejected';
      return Response.json(reservation({ id: 'r1', status }));
    });
  }

  it('solo ofrece los botones en las recibidas pendientes', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    mockApi({
      sent: [reservation({ id: 'sent', item: { id: 'i1', title: 'Bicicleta de paseo' } })],
      received: [
        reservation({ id: 'r1' }),
        reservation({
          id: 'r2',
          item: { id: 'i2', title: 'Tienda de campaña' },
          status: 'accepted',
        }),
      ],
    });

    renderRoute('/mis-solicitudes');

    const received = await screen.findByRole('region', { name: 'Recibidas' });
    const sent = screen.getByRole('region', { name: 'Enviadas' });
    expect(within(received).getAllByRole('button', { name: 'Aceptar', hidden: true })).toHaveLength(
      1,
    );
    expect(
      within(received).getAllByRole('button', { name: 'Rechazar', hidden: true }),
    ).toHaveLength(1);
    expect(within(sent).queryByRole('button', { name: 'Aceptar', hidden: true })).toBeNull();
  });

  it.each([
    ['Aceptar', '/reservas/r1/aceptar', 'Has aceptado la solicitud.', /Aceptada/],
    ['Rechazar', '/reservas/r1/rechazar', 'Has rechazado la solicitud.', /Rechazada/],
  ])('«%s» llama a la API y la tarjeta cambia de estado', async (name, path, message, state) => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    const fetchMock = mockApi({ sent: [], received: [reservation({ id: 'r1' })] });
    const user = userEvent.setup();

    renderRoute('/mis-solicitudes');

    await user.click(await screen.findByRole('button', { name: /Taladro percutor Bosch/ }));
    await user.click(screen.getByRole('button', { name }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Taladro percutor Bosch/ })).toHaveAccessibleName(
      state,
    );
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(String(post?.[0])).toMatch(new RegExp(`${path}$`));
  });
});
