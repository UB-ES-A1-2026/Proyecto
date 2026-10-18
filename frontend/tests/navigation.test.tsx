import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderRoute } from './renderRoute';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

function mainNav() {
  return within(screen.getByRole('navigation', { name: 'Principal' }));
}

afterEach(() => localStorage.clear());

describe('layout y navegación (#21)', () => {
  it('sin sesión la cabecera enlaza a iniciar sesión y a crear cuenta', () => {
    renderRoute('/');

    expect(mainNav().getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(mainNav().getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute(
      'href',
      '/registro',
    );
    expect(mainNav().queryByRole('link', { name: 'Mi perfil' })).not.toBeInTheDocument();
    expect(mainNav().queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });

  it('con sesión la cabecera enlaza al perfil y permite cerrar sesión', () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));

    renderRoute('/');

    expect(mainNav().getByRole('link', { name: 'Mi perfil' })).toHaveAttribute('href', '/perfil');
    expect(mainNav().getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(mainNav().queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(mainNav().queryByRole('link', { name: 'Crear cuenta' })).not.toBeInTheDocument();
  });

  it('navega entre login y registro desde la cabecera', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/');

    await user.click(mainNav().getByRole('link', { name: 'Crear cuenta' }));
    expect(router.state.location.pathname).toBe('/registro');
    expect(screen.getByRole('heading', { level: 1, name: 'Crear cuenta' })).toBeInTheDocument();

    await user.click(mainNav().getByRole('link', { name: 'Iniciar sesión' }));
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('navega al perfil con sesión', async () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));
    const { router } = renderRoute('/');

    await userEvent.setup().click(mainNav().getByRole('link', { name: 'Mi perfil' }));

    expect(router.state.location.pathname).toBe('/perfil');
    expect(screen.getByRole('heading', { level: 1, name: 'Mi perfil' })).toBeInTheDocument();
  });

  it('marca el enlace de la página actual', () => {
    renderRoute('/registro');

    expect(mainNav().getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(mainNav().getByRole('link', { name: 'Iniciar sesión' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('el logo vuelve a la home', () => {
    renderRoute('/registro');

    expect(screen.getByRole('link', { name: 'Rentit' })).toHaveAttribute('href', '/');
  });
});
