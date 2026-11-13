// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// Lo que ve una cuenta de rider (US-10.03, T35 #315): solo el estado de su solicitud y «Trabajos».
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => localStorage.clear());

describe('rider pendiente (US-10.03)', () => {
  it('el inicio enseña el estado de su solicitud en lugar de la portada', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    logInAs(riderSession('pending'));

    renderRoute('/');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Tu solicitud para ser rider' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Pendiente de revisión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    // La portada pide categorías y novedades; el inicio del rider no llama a la API.
    expect(fetchMock).not.toHaveBeenCalled();
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
    logInAs(riderSession('rejected', 'La zona indicada está fuera de la ciudad.'));

    renderRoute('/');

    expect(screen.getByText('Solicitud rechazada')).toBeInTheDocument();
    expect(
      screen.getByText('Motivo: La zona indicada está fuera de la ciudad.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'página de ayuda' })).toHaveAttribute('href', '/ayuda');
  });

  it('sin motivo no enseña la línea del motivo', () => {
    logInAs(riderSession('rejected'));

    renderRoute('/');

    expect(screen.getByText('Solicitud rechazada')).toBeInTheDocument();
    expect(screen.queryByText(/^Motivo:/)).not.toBeInTheDocument();
  });
});

describe('rider aceptado (US-10.03)', () => {
  it('el inicio lo lleva a «Trabajos»', () => {
    logInAs(riderSession('approved'));

    const { router } = renderRoute('/');

    expect(router.state.location.pathname).toBe('/trabajos');
    expect(screen.getByRole('heading', { level: 1, name: 'Trabajos' })).toBeInTheDocument();
    expect(screen.getByText('Rider activo')).toBeInTheDocument();
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
