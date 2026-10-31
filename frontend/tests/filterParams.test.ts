import { describe, expect, it } from 'vitest';
import {
  countActiveFilters,
  isValidMaxPrice,
  normalizeMaxPrice,
  readFilters,
  writeFilters,
} from '../src/components/filterParams';

describe('filtros de la búsqueda en la URL (#118)', () => {
  it('lee solo los filtros con valor e ignora el resto de parámetros', () => {
    const params = new URLSearchParams(
      'q=taladro&categoryId=c1&maxPrice=10&neighborhood=%20&page=2',
    );

    expect(readFilters(params)).toEqual({ categoryId: 'c1', maxPrice: '10' });
  });

  it('al escribir los filtros mantiene la búsqueda y vuelve a la primera página', () => {
    const params = new URLSearchParams('q=taladro&maxPrice=5&page=3');

    const next = writeFilters(params, { categoryId: 'c1', neighborhood: ' Gràcia ' });

    expect(next.get('q')).toBe('taladro');
    expect(next.get('categoryId')).toBe('c1');
    expect(next.get('neighborhood')).toBe('Gràcia');
    expect(next.has('maxPrice')).toBe(false);
    expect(next.has('page')).toBe(false);
  });

  it('no modifica los parámetros originales', () => {
    const params = new URLSearchParams('q=taladro');

    writeFilters(params, { categoryId: 'c1' });

    expect(params.toString()).toBe('q=taladro');
  });

  it('limpiar los filtros deja solo la búsqueda', () => {
    const params = new URLSearchParams('q=taladro&categoryId=c1&maxPrice=10&neighborhood=gracia');

    expect(writeFilters(params, {}).toString()).toBe('q=taladro');
  });

  it('cuenta los filtros activos', () => {
    expect(countActiveFilters({})).toBe(0);
    expect(countActiveFilters({ categoryId: 'c1', maxPrice: '10' })).toBe(2);
  });

  it.each(['', '10', '7.5', '7,50', ' 3 '])('acepta «%s» como precio máximo', (value) => {
    expect(isValidMaxPrice(value)).toBe(true);
  });

  it.each(['0', '-5', 'diez', '1.234', '10e2', '0,00'])(
    'rechaza «%s» como precio máximo',
    (value) => {
      expect(isValidMaxPrice(value)).toBe(false);
    },
  );

  it('normaliza la coma decimal a punto, como espera la API', () => {
    expect(normalizeMaxPrice(' 7,5 ')).toBe('7.5');
  });
});
