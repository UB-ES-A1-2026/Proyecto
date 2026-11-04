import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

// El panel de filtros (#118) pide las categorías al montarse. Se simula su servicio para que
// `fetch` solo reciba la búsqueda, que es lo que comprueban estos tests.
vi.mock('../src/services/categoryService', () => ({
  getCategories: () =>
    Promise.resolve([{ id: '11111111-1111-4111-8111-111111111111', name: 'Deporte' }]),
}));

const ITEM = {
  id: 'item-1',
  title: 'Taladro percutor',
  dailyPrice: '5',
  neighborhood: 'Gràcia',
  category: { id: 'category-1', name: 'Herramientas' },
  photo: null,
};

const SEARCH_RESPONSE = {
  items: [ITEM],
  page: 1,
  pageSize: 20,
  total: 1,
};

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('SearchPage', () => {
  it('muestra tarjetas con enlace y el precio formateado', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(SEARCH_RESPONSE));

    renderRoute('/buscar?q=taladro');

    expect(await screen.findByRole('link', { name: 'Taladro percutor' })).toHaveAttribute(
      'href',
      '/objetos/item-1',
    );
    expect(screen.getByText('5,00 € / día')).toBeInTheDocument();
    expect(screen.getByText('Gràcia · Herramientas')).toBeInTheDocument();
    expect(screen.getByText('1 objeto encontrado')).toBeInTheDocument();
  });

  it('la tarjeta sin foto lo indica con un hueco, y la que tiene foto la muestra', async () => {
    const photo = 'http://localhost:3000/uploads/foto.jpg';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        ...SEARCH_RESPONSE,
        total: 2,
        items: [ITEM, { ...ITEM, id: 'item-2', title: 'Escalera', photo }],
      }),
    );

    renderRoute('/buscar?q=a');

    const cards = await screen.findAllByRole('listitem');
    const withoutPhoto = cards.find((card) => card.textContent?.includes('Taladro percutor'))!;
    const withPhoto = cards.find((card) => card.textContent?.includes('Escalera'))!;
    expect(within(withoutPhoto).getByRole('img', { name: 'Sin foto' })).toBeInTheDocument();
    expect(within(withPhoto).getByRole('img', { name: 'Escalera' })).toHaveAttribute('src', photo);
    expect(within(withPhoto).queryByRole('img', { name: 'Sin foto' })).toBeNull();
  });

  it('muestra el texto exacto cuando no hay resultados', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ items: [], page: 1, pageSize: 20, total: 0 }),
    );

    renderRoute('/buscar?q=zzzz');

    expect(
      await screen.findByText('No hemos encontrado ningún objeto para «zzzz».'),
    ).toBeInTheDocument();
  });

  it('muestra el estado de carga mientras espera la respuesta', async () => {
    let resolveResponse: (response: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise<Response>((resolve) => (resolveResponse = resolve)),
    );

    const { container } = renderRoute('/buscar?q=taladro');

    expect(await screen.findByRole('status')).toHaveTextContent('Buscando…');
    expect(container.querySelector('.skeleton')).toBeInTheDocument();
    resolveResponse(Response.json(SEARCH_RESPONSE));
    expect(await screen.findByText('Taladro percutor')).toBeInTheDocument();
    expect(container.querySelector('.skeleton')).not.toBeInTheDocument();
  });

  it('muestra el mensaje ApiError como alerta', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: 'Búsqueda no válida.', field: 'q' }, { status: 400 }),
    );

    renderRoute('/buscar?q=taladro');

    expect(await screen.findByRole('alert')).toHaveTextContent('Búsqueda no válida.');
  });

  it('muestra el mensaje de conexión cuando falla la petición', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    renderRoute('/buscar?q=taladro');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se puede conectar con el servidor. Inténtalo más tarde.',
    );
  });

  it.each([404, 500])('muestra el error genérico para una respuesta %s', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: 'Error interno del servidor.' }, { status }),
    );

    renderRoute('/buscar?q=taladro');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hemos podido cargar los resultados. Inténtalo de nuevo más tarde.',
    );
  });

  it('Siguiente actualiza solo la página y solicita los resultados de esa página', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ ...SEARCH_RESPONSE, total: 40 }));
    const user = userEvent.setup();
    const { router } = renderRoute('/buscar?q=taladro&maxPrice=10');

    await user.click(await screen.findByRole('button', { name: 'Siguiente' }));

    expect(router.state.location.search).toBe('?q=taladro&maxPrice=10&page=2');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        'http://localhost:3000/api/objetos?q=taladro&page=2&maxPrice=10',
        expect.any(Object),
      ),
    );
  });

  it('vuelve a consultar la API cuando cambia maxPrice en la URL', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(SEARCH_RESPONSE));
    const { router } = renderRoute('/buscar?q=taladro');

    await screen.findByText('Taladro percutor');
    await router.navigate('/buscar?q=taladro&maxPrice=10');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:3000/api/objetos?q=taladro&maxPrice=10',
      expect.any(Object),
    );
  });

  it('sin búsqueda ni filtros muestra la ayuda y no llama a fetch', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    renderRoute('/buscar');

    expect(screen.getByRole('heading', { name: 'Buscar objetos' })).toBeInTheDocument();
    expect(screen.getByText('Escribe qué quieres alquilar y pulsa «Buscar».')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('al limpiar los filtros sin texto muestra todos los objetos, no la ayuda', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => Response.json(SEARCH_RESPONSE));
    const user = userEvent.setup();
    const { router } = renderRoute('/buscar?maxPrice=10');

    await screen.findByText('Taladro percutor');
    // El panel también tiene este botón: aquí se usa el que está junto a los filtros activos.
    const activeFilters = within(screen.getByRole('list', { name: 'Filtros activos' }));
    await user.click(activeFilters.getByRole('button', { name: 'Limpiar filtros' }));

    await waitFor(() => expect(router.state.location.search).toBe('?q='));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        'http://localhost:3000/api/objetos',
        expect.any(Object),
      ),
    );
    expect(await screen.findByText('Taladro percutor')).toBeInTheDocument();
    expect(screen.queryByText('Escribe qué quieres alquilar y pulsa «Buscar».')).toBeNull();
  });

  it('no manda a la API un precio no válido escrito a mano en la URL', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(SEARCH_RESPONSE));

    renderRoute('/buscar?q=taladro&maxPrice=abc');

    await screen.findByText('Taladro percutor');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/objetos?q=taladro',
      expect.any(Object),
    );
  });

  it('normaliza la coma del precio de la URL antes de pedirlo a la API', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(SEARCH_RESPONSE));

    renderRoute('/buscar?q=taladro&maxPrice=4,5');

    await screen.findByText('Taladro percutor');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/objetos?q=taladro&maxPrice=4.5',
      expect.any(Object),
    );
  });

  it('muestra el panel de filtros y su botón para móvil junto a los resultados (US-03.02, #118)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(SEARCH_RESPONSE));

    renderRoute('/buscar?q=taladro');

    expect(await screen.findByRole('button', { name: /^Filtros/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('form', { name: 'Filtros' })).toBeInTheDocument();
    expect(await screen.findByText('Taladro percutor')).toBeInTheDocument();
  });

  it('si los filtros no dejan resultados, ofrece quitarlos en lugar del mensaje normal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ items: [], page: 1, pageSize: 20, total: 0 }),
    );
    const user = userEvent.setup();

    const { router } = renderRoute('/buscar?q=taladro&maxPrice=2');

    expect(await screen.findByText(/No hay objetos que cumplan estos filtros/)).toBeVisible();
    expect(screen.queryByText('No hemos encontrado ningún objeto para «taladro».')).toBeNull();

    await user.click(screen.getAllByRole('button', { name: 'Limpiar filtros' }).at(-1)!);

    await waitFor(() => expect(router.state.location.search).toBe('?q=taladro'));
  });
});
