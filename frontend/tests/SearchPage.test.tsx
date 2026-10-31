import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from './renderRoute';

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

    renderRoute('/buscar?q=taladro');

    expect(await screen.findByRole('status')).toHaveTextContent('Buscando…');
    resolveResponse(Response.json(SEARCH_RESPONSE));
    expect(await screen.findByText('Taladro percutor')).toBeInTheDocument();
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(SEARCH_RESPONSE));
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
});
