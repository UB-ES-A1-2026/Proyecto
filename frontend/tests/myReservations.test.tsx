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
