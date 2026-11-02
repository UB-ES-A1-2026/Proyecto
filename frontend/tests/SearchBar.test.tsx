import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('SearchBar', () => {
  it.each(['', '   '])('no navega cuando el campo contiene %j', async (value) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    const { router } = renderRoute('/');

    if (value) {
      await user.type(screen.getByRole('searchbox', { name: '¿Qué quieres alquilar?' }), value);
    }
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recorta los extremos y navega con la búsqueda', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ items: [], page: 1, pageSize: 20, total: 0 }),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/');

    await user.type(screen.getByRole('searchbox', { name: '¿Qué quieres alquilar?' }), ' taladro ');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(router.state.location.pathname).toBe('/buscar');
    expect(router.state.location.search).toBe('?q=taladro');
  });
});
