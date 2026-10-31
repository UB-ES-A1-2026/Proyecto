import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchItems } from '../src/services/searchService';

afterEach(() => vi.restoreAllMocks());

describe('searchItems', () => {
  it('construye la URL con la búsqueda y los filtros y devuelve los datos', async () => {
    const data = { items: [], page: 1, pageSize: 20, total: 0 };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(data));

    await expect(
      searchItems({
        q: 'taladro',
        page: '2',
        categoryId: 'tools',
        maxPrice: '10',
        neighborhood: 'Gràcia',
      }),
    ).resolves.toEqual(data);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/objetos?q=taladro&page=2&categoryId=tools&maxPrice=10&neighborhood=Gr%C3%A0cia',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('omite los parámetros vacíos', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ items: [], page: 1, pageSize: 20, total: 0 }));

    await searchItems({ q: '', page: undefined, categoryId: ' ', maxPrice: '10' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/objetos?maxPrice=10',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
