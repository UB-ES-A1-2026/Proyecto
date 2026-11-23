// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// Lo que ve una cuenta de rider (US-10.03, T35 #315): solo el estado de su solicitud y «Trabajos».
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

type RiderStatus = 'pending' | 'approved' | 'rejected';

function riderSession(riderStatus: RiderStatus, rejectionReason?: string) {
  return {
    token: 'token-de-prueba',
    expiresAt: '2099-01-01T00:00:00.000Z',
    user: {
      id: 'r1',
      username: 'pau.rider',
      email: 'pau@ejemplo.com',
      role: 'user',
      isRider: true,
      riderStatus,
      ...(rejectionReason ? { rejectionReason } : {}),
    },
  };
}

function logInAs(session: unknown) {
  localStorage.setItem('rentit.session', JSON.stringify(session));
}

function mainNav() {
  return within(screen.getByRole('navigation', { name: 'Principal' }));
}

// GET /api/usuarios/me con el estado de rider que devuelve la API (US-10.03, #322).
function mockMe(riderStatus: RiderStatus, rejectionReason?: string) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/usuarios/me')) {
      return Response.json({
        id: 'r1',
        username: 'pau.rider',
        email: 'pau@ejemplo.com',
        role: 'user',
        createdAt: '2026-11-01T10:00:00.000Z',
        isRider: true,
        riderStatus,
        ...(rejectionReason ? { rejectionReason } : {}),
      });
    }
    // Su perfil público (US-01.4): «Mi perfil» lleva a /usuarios/r1.
    if (url.endsWith('/usuarios/r1')) {
      return Response.json({
        id: 'r1',
        username: 'pau.rider',
        bio: null,
        photo: null,
        memberSince: '2026-11-01T10:00:00.000Z',
        rating: { average: null, count: 0 },
        items: [],
        isOwnProfile: true,
      });
    }
    return Response.json({ error: 'No esperado en este test.' }, { status: 500 });
  });
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('rider pendiente (US-10.03)', () => {
  it('el inicio enseña el estado de su solicitud en lugar de la portada', async () => {
    const fetchMock = mockMe('pending');
    logInAs(riderSession('pending'));

    renderRoute('/');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Tu solicitud para ser rider' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Pendiente de revisión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    // La portada pide categorías y novedades; el inicio del rider solo pide su estado, una vez.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/usuarios\/me$/);
  });

  it('si un admin lo acepta con la sesión abierta, va a «Trabajos» sin volver a entrar', async () => {
    mockMe('approved');
    logInAs(riderSession('pending'));

    const { router } = renderRoute('/');

    await waitFor(() => expect(router.state.location.pathname).toBe('/trabajos'));
    expect(screen.getByRole('heading', { level: 1, name: 'Trabajos' })).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem('rentit.session') ?? '{}');
    expect(stored.user.riderStatus).toBe('approved');
  });

  it('si no se puede consultar el estado, se queda la tarjeta como estaba', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('Failed to fetch'));
    logInAs(riderSession('pending'));

    renderRoute('/');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('Pendiente de revisión')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('rentit.session') ?? '{}').user.riderStatus).toBe(
      'pending',
    );
  });

  it('su cabecera solo tiene «Inicio» y «Mi perfil»', () => {
    logInAs(riderSession('pending'));

    renderRoute('/');

    expect(mainNav().getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
    expect(mainNav().getByRole('link', { name: 'Mi perfil' })).toHaveAttribute('href', '/perfil');
    expect(mainNav().queryByRole('link', { name: 'Mis objetos' })).not.toBeInTheDocument();
    expect(mainNav().queryByRole('link', { name: 'Mis solicitudes' })).not.toBeInTheDocument();
    expect(mainNav().queryByRole('link', { name: 'Trabajos' })).not.toBeInTheDocument();
    expect(mainNav().queryByRole('link', { name: 'Hazte rider' })).not.toBeInTheDocument();
  });

  it.each([
    '/buscar?q=taladro',
    '/objetos/item-1',
    '/mis-objetos',
    '/mis-solicitudes',
    '/objetos/nuevo',
  ])('si entra en %s vuelve al inicio', (path) => {
    logInAs(riderSession('pending'));

    const { router } = renderRoute(path);

    expect(router.state.location.pathname).toBe('/');
  });

  it('no puede entrar en «Trabajos» hasta que lo acepten', () => {
    logInAs(riderSession('pending'));

    const { router } = renderRoute('/trabajos');

    expect(router.state.location.pathname).toBe('/');
  });
});

describe('rider rechazado (US-10.03)', () => {
  it('ve que se ha rechazado y el motivo, si la API lo manda', () => {
    mockMe('rejected', 'La zona indicada está fuera de la ciudad.');
    logInAs(riderSession('rejected', 'La zona indicada está fuera de la ciudad.'));

    renderRoute('/');

    expect(screen.getByText('Solicitud rechazada')).toBeInTheDocument();
    expect(
      screen.getByText('Motivo: La zona indicada está fuera de la ciudad.'),
    ).toBeInTheDocument();
    // Solo promete lo que existe: la ayuda no tiene contacto.
    expect(screen.getByText(/volver a solicitarlo con otra cuenta/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'página de ayuda' })).not.toBeInTheDocument();
  });

  it('el motivo que llega al consultar el estado se enseña sin volver a entrar', async () => {
    mockMe('rejected', 'Faltan días disponibles.');
    logInAs(riderSession('pending'));

    renderRoute('/');

    expect(await screen.findByText('Motivo: Faltan días disponibles.')).toBeInTheDocument();
    expect(screen.getByText('Solicitud rechazada')).toBeInTheDocument();
  });

  it('sin motivo no enseña la línea del motivo', () => {
    mockMe('rejected');
    logInAs(riderSession('rejected'));

    renderRoute('/');

    expect(screen.getByText('Solicitud rechazada')).toBeInTheDocument();
    expect(screen.queryByText(/^Motivo:/)).not.toBeInTheDocument();
  });
});

describe('rider aceptado (US-10.03)', () => {
  // «Trabajos» pide la lista (US-10.01): aquí solo importa la navegación.
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));
  });

  it('el inicio lo lleva a «Trabajos»', () => {
    logInAs(riderSession('approved'));

    const { router } = renderRoute('/');

    expect(router.state.location.pathname).toBe('/trabajos');
    expect(screen.getByRole('heading', { level: 1, name: 'Trabajos' })).toBeInTheDocument();
  });

  it('su cabecera tiene «Trabajos» y «Mi perfil», sin buscar, alquilar ni publicar', () => {
    logInAs(riderSession('approved'));

    renderRoute('/trabajos');

    expect(mainNav().getByRole('link', { name: 'Trabajos' })).toHaveAttribute('href', '/trabajos');
    expect(mainNav().getByRole('link', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(mainNav().queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument();
    expect(mainNav().queryByRole('link', { name: 'Mis objetos' })).not.toBeInTheDocument();
  });
});

describe('«Trabajos» con otras cuentas', () => {
  it('sin sesión lleva al login', () => {
    const { router } = renderRoute('/trabajos');

    expect(router.state.location.pathname).toBe('/login');
  });

  it('con una cuenta normal vuelve al inicio', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));
    logInAs({
      token: 'token-de-prueba',
      expiresAt: '2099-01-01T00:00:00.000Z',
      user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
    });

    const { router } = renderRoute('/trabajos');

    expect(router.state.location.pathname).toBe('/');
  });
});

// Con US-01.4, «Mi perfil» es el perfil público propio: el rider ve ahí su bloque, sin objetos.
describe('«Mi perfil» de un rider (US-10.03)', () => {
  it('pendiente: no enseña lo de arrendatario ni pide sus cifras', async () => {
    const fetchMock = mockMe('pending');
    logInAs(riderSession('pending'));

    renderRoute('/perfil');

    expect(await screen.findByRole('heading', { level: 1, name: 'pau.rider' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Objetos publicados' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Publicar un objeto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Mis objetos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Mis solicitudes/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver el estado de tu solicitud' })).toHaveAttribute(
      'href',
      '/',
    );
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/usuarios/me/objetos'))).toBe(false);
    expect(urls.some((url) => url.includes('/usuarios/me/reservas'))).toBe(false);
  });

  it('aceptado: enseña el enlace a «Trabajos»', async () => {
    mockMe('approved');
    logInAs(riderSession('approved'));

    renderRoute('/perfil');

    expect(await screen.findByRole('link', { name: 'Ver trabajos' })).toHaveAttribute(
      'href',
      '/trabajos',
    );
    expect(screen.queryByRole('link', { name: 'Publicar un objeto' })).not.toBeInTheDocument();
  });
});
