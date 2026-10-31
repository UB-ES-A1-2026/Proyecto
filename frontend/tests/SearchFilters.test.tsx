// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 31/10/2026
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoResultsWithFilters, SearchFilters } from '../src/components/SearchFilters';

const CATEGORIES = [
  { id: 'c-deporte', name: 'Deporte' },
  { id: 'c-herramientas', name: 'Herramientas y bricolaje' },
];

// La página de resultados (#115) aún no existe: se montan los componentes en /buscar
// y se comprueba en el router qué filtros escriben en la URL.
function renderFilters(entry: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/buscar',
        element: (
          <>
            <SearchFilters />
            <NoResultsWithFilters />
          </>
        ),
      },
    ],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function currentParams(router: ReturnType<typeof renderFilters>) {
  return new URLSearchParams(router.state.location.search);
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    String(input).endsWith('/categorias')
      ? Response.json(CATEGORIES)
      : Response.json({ error: 'No encontrado' }, { status: 404 }),
  );
});

afterEach(() => vi.restoreAllMocks());

describe('panel de filtros (US-03.02, #118)', () => {
  // Criterio 1
  it('el botón «Filtros» abre el panel con categoría, precio máximo y barrio', async () => {
    const user = userEvent.setup();
    renderFilters('/buscar?q=taladro');

    expect(screen.queryByRole('form', { name: 'Filtros' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filtros' }));

    const panel = within(screen.getByRole('form', { name: 'Filtros' }));
    expect(panel.getByLabelText('Categoría')).toBeInTheDocument();
    expect(panel.getByLabelText('Precio máximo (€/día)')).toBeInTheDocument();
    expect(panel.getByLabelText('Barrio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtros' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  // Criterio 2
  it('la categoría ofrece «Todas» y las categorías de la API', async () => {
    const user = userEvent.setup();
    renderFilters('/buscar?q=taladro');

    await user.click(screen.getByRole('button', { name: 'Filtros' }));

    expect(await screen.findByRole('option', { name: 'Deporte' })).toBeInTheDocument();
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Todas', 'Deporte', 'Herramientas y bricolaje']);
  });

  // Criterios 3 y 4
  it('aplica varios filtros a la vez en la URL, mantiene la búsqueda y cierra el panel', async () => {
    const user = userEvent.setup();
    const router = renderFilters('/buscar?q=taladro&page=2');

    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    await screen.findByRole('option', { name: 'Deporte' });
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Deporte');
    await user.type(screen.getByLabelText('Precio máximo (€/día)'), '7,5');
    await user.type(screen.getByLabelText('Barrio'), 'Gràcia');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    const params = currentParams(router);
    expect(params.get('q')).toBe('taladro');
    expect(params.get('categoryId')).toBe('c-deporte');
    expect(params.get('maxPrice')).toBe('7.5');
    expect(params.get('neighborhood')).toBe('Gràcia');
    expect(params.has('page')).toBe(false);
    expect(screen.queryByRole('form', { name: 'Filtros' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtros (3)' })).toBeInTheDocument();
  });

  it('con un precio máximo no válido muestra el error y no cambia la URL', async () => {
    const user = userEvent.setup();
    const router = renderFilters('/buscar?q=taladro');

    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    const price = screen.getByLabelText('Precio máximo (€/día)');
    await user.type(price, '-5');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    expect(
      screen.getByText('El campo "precio máximo" no es correcto, revísalo.'),
    ).toBeInTheDocument();
    expect(price).toHaveAttribute('aria-invalid', 'true');
    expect(router.state.location.search).toBe('?q=taladro');

    await user.type(price, '0');
    expect(price).toHaveAttribute('aria-invalid', 'false');
  });

  it('muestra un chip por filtro activo y la ✕ quita solo ese filtro', async () => {
    const user = userEvent.setup();
    const router = renderFilters('/buscar?q=taladro&categoryId=c-deporte&maxPrice=10');

    const chips = within(screen.getByRole('list', { name: 'Filtros activos' }));
    expect(await chips.findByRole('button', { name: 'Quitar filtro Deporte' })).toBeInTheDocument();
    await user.click(chips.getByRole('button', { name: 'Quitar filtro Hasta 10 €/día' }));

    const params = currentParams(router);
    expect(params.get('categoryId')).toBe('c-deporte');
    expect(params.has('maxPrice')).toBe(false);
  });

  // Criterio 5
  it('«Limpiar filtros» quita todos los filtros y mantiene la búsqueda', async () => {
    const user = userEvent.setup();
    const router = renderFilters('/buscar?q=taladro&categoryId=c-deporte&maxPrice=10');

    const chips = within(screen.getByRole('list', { name: 'Filtros activos' }));
    await user.click(chips.getByRole('button', { name: 'Limpiar filtros' }));

    expect(router.state.location.search).toBe('?q=taladro');
    expect(screen.queryByRole('list', { name: 'Filtros activos' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument();
  });

  it('«Limpiar filtros» del panel vacía los campos y la URL', async () => {
    const user = userEvent.setup();
    const router = renderFilters('/buscar?q=taladro&maxPrice=10');

    await user.click(screen.getByRole('button', { name: 'Filtros (1)' }));
    expect(screen.getByLabelText('Precio máximo (€/día)')).toHaveValue('10');
    await user.click(
      within(screen.getByRole('form', { name: 'Filtros' })).getByRole('button', {
        name: 'Limpiar filtros',
      }),
    );

    expect(screen.getByLabelText('Precio máximo (€/día)')).toHaveValue('');
    expect(router.state.location.search).toBe('?q=taladro');
  });

  it('si no se pueden cargar las categorías, avisa y deja usar el resto de filtros', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    renderFilters('/buscar?q=taladro');

    await user.click(screen.getByRole('button', { name: 'Filtros' }));

    expect(await screen.findByText('No se han podido cargar las categorías.')).toBeInTheDocument();
    expect(screen.getByLabelText('Precio máximo (€/día)')).toBeEnabled();
  });

  it('sin resultados por los filtros ofrece limpiarlos; sin filtros no dice nada', async () => {
    const user = userEvent.setup();
    const router = renderFilters('/buscar?q=taladro&maxPrice=2');

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('No hay objetos que cumplan estos filtros.');
    await user.click(within(status).getByRole('button', { name: 'Limpiar filtros' }));

    expect(router.state.location.search).toBe('?q=taladro');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
