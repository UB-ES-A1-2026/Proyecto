// Generado con asistencia de IA (Claude)
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RiderApplication } from '../src/services/adminRiderService';
import { renderRoute } from './renderRoute';

const ADMIN = {
  token: 'token-de-admin',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'a1', username: 'admin', email: 'admin@rentit.test', role: 'admin' },
};

function application(overrides: Partial<RiderApplication> = {}): RiderApplication {
  return {
    id: 'r1',
    status: 'pending',
    createdAt: '2026-11-10T09:00:00.000Z',
    phone: '600123123',
    zone: 'Gràcia',
    vehicle: 'bike',
    days: ['monday', 'wednesday'],
    slots: ['morning', 'night'],
    termsAcceptedAt: '2026-11-10T09:00:00.000Z',
    user: { id: 'u1', username: 'jordi', email: 'jordi@rentit.test' },
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    ...overrides,
  };
}

function signIn(session = ADMIN) {
  localStorage.setItem('rentit.session', JSON.stringify(session));
}

function mockApi(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => handler(String(input), init));
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('pantalla «Riders» del admin (US-11.03, #318)', () => {
  it('una cuenta que no es de admin no puede entrar: vuelve al inicio', () => {
    signIn({ ...ADMIN, user: { ...ADMIN.user, role: 'user' } });
    mockApi(() => Response.json({ items: [] }));

    const { router } = renderRoute('/admin/solicitudes');

    expect(router.state.location.pathname).toBe('/');
  });

  it('sin sesión lleva al login', () => {
    const { router } = renderRoute('/admin/solicitudes');

    expect(router.state.location.pathname).toBe('/login');
  });

  it('muestra las pendientes de la más antigua a la más nueva y despliega el cuestionario', async () => {
    signIn();
    const fetchMock = mockApi(() =>
      Response.json([
        application({
          id: 'nueva',
          createdAt: '2026-11-11T09:00:00.000Z',
          user: { id: 'u2', username: 'marta', email: 'marta@rentit.test' },
        }),
        application(),
        application({ id: 'hecha', status: 'approved', reviewedAt: '2026-11-11T10:00:00.000Z' }),
      ]),
    );
    const user = userEvent.setup();

    renderRoute('/admin/solicitudes');

    const cards = await screen.findAllByRole('button', { name: /Pendiente de revisión$/ });
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining('jordi'),
      expect.stringContaining('marta'),
    ]);
    expect(screen.getByRole('button', { name: 'Pendientes · 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Aceptadas · 1' })).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/admin\/riders$/);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer token-de-admin',
    );

    await user.click(cards[0]);
    const detail = within(cards[0].closest('article') as HTMLElement);

    expect(detail.getByText('Teléfono: 600123123')).toBeVisible();
    expect(detail.getByText('Vehículo: Bici')).toBeVisible();
    expect(detail.getByText('Días: Lunes, Miércoles')).toBeVisible();
    expect(detail.getByText('Franjas: Mañana, Noche')).toBeVisible();
    expect(detail.getByText('Correo electrónico: jordi@rentit.test')).toBeVisible();
  });

  it('al aceptar, la solicitud pasa a «Aceptadas»', async () => {
    signIn();
    const fetchMock = mockApi((_url, init) =>
      init?.method === 'POST'
        ? Response.json(
            application({
              status: 'approved',
              reviewedAt: '2026-11-12T10:00:00.000Z',
              reviewedBy: { id: 'a1', username: 'admin' },
            }),
          )
        : Response.json([application()]),
    );
    const user = userEvent.setup();
    renderRoute('/admin/solicitudes');

    await user.click(await screen.findByRole('button', { name: /jordi/ }));
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Has aceptado a jordi: ya puede hacer entregas.',
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(String(post?.[0])).toMatch(/\/admin\/riders\/r1\/aceptar$/);
    expect(screen.getByRole('button', { name: 'Pendientes · 0' })).toBeInTheDocument();
    expect(screen.getByText('No hay solicitudes pendientes.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Aceptadas · 1' }));
    await user.click(screen.getByRole('button', { name: /jordi/ }));
    expect(screen.getByText(/Aceptada el .* por admin/)).toBeVisible();
  });

  it('al rechazar se puede escribir un motivo, que se envía y se ve después', async () => {
    signIn();
    const fetchMock = mockApi((_url, init) =>
      init?.method === 'POST'
        ? Response.json(
            application({
              status: 'rejected',
              reviewedAt: '2026-11-12T10:00:00.000Z',
              reviewedBy: { id: 'a1', username: 'admin' },
              rejectionReason: 'Zona sin cobertura',
            }),
          )
        : Response.json([application()]),
    );
    const user = userEvent.setup();
    renderRoute('/admin/solicitudes');

    await user.click(await screen.findByRole('button', { name: /jordi/ }));
    await user.click(screen.getByRole('button', { name: 'Rechazar' }));
    await user.type(screen.getByLabelText('Motivo del rechazo (opcional)'), 'Zona sin cobertura');
    await user.click(screen.getByRole('button', { name: 'Rechazar solicitud' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Has rechazado la solicitud de jordi.',
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(String(post?.[0])).toMatch(/\/admin\/riders\/r1\/rechazar$/);
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ reason: 'Zona sin cobertura' });

    await user.click(screen.getByRole('button', { name: 'Rechazadas · 1' }));
    await user.click(screen.getByRole('button', { name: /jordi/ }));
    expect(screen.getByText('Motivo: Zona sin cobertura')).toBeVisible();
  });

  it('«Volver» cierra el motivo sin rechazar nada', async () => {
    signIn();
    const fetchMock = mockApi(() => Response.json([application()]));
    const user = userEvent.setup();
    renderRoute('/admin/solicitudes');

    await user.click(await screen.findByRole('button', { name: /jordi/ }));
    await user.click(screen.getByRole('button', { name: 'Rechazar' }));
    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('si otro admin ya la ha revisado, avisa y actualiza la lista', async () => {
    signIn();
    let reviewed = false;
    mockApi((_url, init) => {
      if (init?.method === 'POST') {
        reviewed = true;
        return Response.json({ error: 'Esta solicitud ya se ha revisado.' }, { status: 409 });
      }
      return Response.json([
        reviewed
          ? application({ status: 'approved', reviewedAt: '2026-11-12T10:00:00.000Z' })
          : application(),
      ]);
    });
    const user = userEvent.setup();
    renderRoute('/admin/solicitudes');

    await user.click(await screen.findByRole('button', { name: /jordi/ }));
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta solicitud ya se ha revisado.');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Aceptadas · 1' })).toBeInTheDocument(),
    );
    expect(screen.getByText('No hay solicitudes pendientes.')).toBeInTheDocument();
  });

  it('sin solicitudes pendientes lo dice', async () => {
    signIn();
    mockApi(() => Response.json([]));

    renderRoute('/admin/solicitudes');

    expect(await screen.findByText('No hay solicitudes pendientes.')).toBeInTheDocument();
    const filters = within(screen.getByRole('group', { name: 'Filtrar por estado' }));
    expect(filters.getAllByRole('button')).toHaveLength(3);
  });

  it('si la API falla, muestra el error', async () => {
    signIn();
    mockApi(() => Response.json({ error: 'Solo para administradores.' }, { status: 403 }));

    renderRoute('/admin/solicitudes');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hemos podido cargar las solicitudes. Inténtalo de nuevo más tarde.',
    );
  });
});
