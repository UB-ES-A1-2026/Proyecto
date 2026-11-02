import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

describe('rutas', () => {
  it('muestra la home en /', () => {
    renderRoute('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Rentit' })).toBeInTheDocument();
  });

  it('muestra la página 404 en una ruta inexistente', () => {
    renderRoute('/no-existe');

    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });

  it('protege la ruta de mis solicitudes y muestra la página privada con sesión', async () => {
    localStorage.setItem(
      'rentit.session',
      JSON.stringify({
        token: 'token-de-prueba',
        expiresAt: '2099-01-01T00:00:00.000Z',
        user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
      }),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ sent: [], received: [] }));

    renderRoute('/mis-solicitudes');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mis solicitudes' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('No tienes solicitudes abiertas')).toBeInTheDocument();
  });

  it('sin sesión redirige mis solicitudes al login', () => {
    localStorage.removeItem('rentit.session');
    const { router } = renderRoute('/mis-solicitudes');

    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument();
  });
});
