import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCategories } from '../src/services/categoryService';

afterEach(() => vi.restoreAllMocks());

describe('categoryService (#118)', () => {
  it('pide GET /api/categorias y devuelve la lista', async () => {
    const categories = [{ id: 'c1', name: 'Deporte' }];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(categories));

    await expect(getCategories()).resolves.toEqual(categories);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toMatch(/\/api\/categorias$/);
    expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe('GET');
  });
});
