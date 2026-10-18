import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
