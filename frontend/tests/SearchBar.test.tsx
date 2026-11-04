import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

function mockApi() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) =>
      String(input).endsWith('/categorias')
        ? Response.json([])
        : Response.json({ items: [], page: 1, pageSize: 20, total: 0 }),
    );
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('SearchBar', () => {
  it.each(['', '   '])('no navega ni busca cuando el campo contiene %j', async (value) => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/');
    // La home pide las categorías y las novedades al abrirse: pulsar «Buscar» no añade nada.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    if (value) {
      await user.type(screen.getByRole('searchbox', { name: '¿Qué quieres alquilar?' }), value);
    }
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('recorta los extremos y navega con la búsqueda', async () => {
    mockApi();
    const user = userEvent.setup();
    const { router } = renderRoute('/');

    await user.type(screen.getByRole('searchbox', { name: '¿Qué quieres alquilar?' }), ' taladro ');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(router.state.location.pathname).toBe('/buscar');
    expect(router.state.location.search).toBe('?q=taladro');
  });
});
