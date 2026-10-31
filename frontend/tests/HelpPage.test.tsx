// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 31/10/2026
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderRoute } from './renderRoute';

const SECTIONS = [
  { id: 'crear-cuenta', title: 'Crear una cuenta' },
  { id: 'iniciar-sesion', title: 'Iniciar sesión' },
  { id: 'ver-perfil', title: 'Ver tu perfil' },
  { id: 'cerrar-sesion', title: 'Cerrar sesión' },
];

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

function mainNav() {
  return within(screen.getByRole('navigation', { name: 'Principal' }));
}

afterEach(() => localStorage.clear());

describe('página de ayuda (#89)', () => {
  it('se ve sin sesión iniciada', () => {
    renderRoute('/ayuda');

    expect(screen.getByRole('heading', { level: 1, name: 'Ayuda' })).toBeInTheDocument();
  });

  it('tiene una sección por cada flujo entregado, con sus pasos', () => {
    renderRoute('/ayuda');

    for (const section of SECTIONS) {
      const region = screen.getByRole('region', { name: section.title });
      expect(region).toHaveAttribute('id', section.id);
      expect(within(region).getAllByRole('listitem').length).toBeGreaterThan(1);
    }
  });

  it('el índice enlaza a cada sección', () => {
    renderRoute('/ayuda');

    const index = within(screen.getByRole('navigation', { name: 'En esta página' }));
    for (const section of SECTIONS) {
      expect(index.getByRole('link', { name: section.title })).toHaveAttribute(
        'href',
        `#${section.id}`,
      );
    }
  });

  it('los pasos enlazan a las pantallas que nombran', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/ayuda');

    const section = within(screen.getByRole('region', { name: 'Crear una cuenta' }));
    await user.click(section.getByRole('link', { name: 'Crear cuenta' }));

    expect(router.state.location.pathname).toBe('/registro');
  });

  it('la cabecera enlaza a la ayuda sin sesión', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/');

    await user.click(mainNav().getByRole('link', { name: 'Ayuda' }));

    expect(router.state.location.pathname).toBe('/ayuda');
  });

  it('la cabecera enlaza a la ayuda con sesión', () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));

    renderRoute('/');

    expect(mainNav().getByRole('link', { name: 'Ayuda' })).toHaveAttribute('href', '/ayuda');
  });
});
