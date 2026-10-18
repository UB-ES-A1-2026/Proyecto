import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderRoute } from './renderRoute';

const SESSION = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u1', username: 'ana', email: 'ana@rentit.test', role: 'user' },
};

afterEach(() => localStorage.clear());

describe('home (#7)', () => {
  it('sin sesión presenta Rentit y enlaza a iniciar sesión y a crear cuenta', () => {
    renderRoute('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Rentit' })).toBeInTheDocument();
    expect(screen.getByText('Alquila objetos a tus vecinos.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro');
  });

  it('con sesión saluda al usuario y no muestra los enlaces de acceso', () => {
    localStorage.setItem('rentit.session', JSON.stringify(SESSION));

    renderRoute('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Hola, ana' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Crear cuenta' })).not.toBeInTheDocument();
  });

  it('ya no muestra el estado provisional de la API del esqueleto', () => {
    renderRoute('/');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
