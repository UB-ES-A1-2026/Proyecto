import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

describe('rutas', () => {
  it('muestra la home en /', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ status: 'ok' }));

    renderRoute('/');

    expect(screen.getByRole('heading', { name: 'Rentit' })).toBeInTheDocument();
    expect(await screen.findByText('API conectada')).toBeInTheDocument();
  });

  it('avisa si la API no responde', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    renderRoute('/');

    expect(await screen.findByText('No se puede conectar con la API')).toBeInTheDocument();
  });

  it('muestra la página 404 en una ruta inexistente', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ status: 'ok' }));

    renderRoute('/no-existe');

    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });
});
