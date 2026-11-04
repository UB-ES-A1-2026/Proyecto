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

  it('ignora un precio máximo no válido de la URL y normaliza la coma', () => {
    expect(readFilters(new URLSearchParams('maxPrice=abc'))).toEqual({});
    expect(readFilters(new URLSearchParams('maxPrice=-5'))).toEqual({});
    expect(readFilters(new URLSearchParams('maxPrice=7,5'))).toEqual({ maxPrice: '7.5' });
  });

  it('ignora un barrio de la URL de más de 100 caracteres', () => {
    expect(readFilters(new URLSearchParams(`neighborhood=${'a'.repeat(101)}`))).toEqual({});
    expect(readFilters(new URLSearchParams(`neighborhood=${'a'.repeat(100)}`))).toEqual({
      neighborhood: 'a'.repeat(100),
    });
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

  it('limpiar los filtros sin texto deja «q=» para seguir viendo todos los objetos', () => {
    const params = new URLSearchParams('maxPrice=10');

    expect(writeFilters(params, {}).toString()).toBe('q=');
  });

  it('aplicar un filtro sin texto quita el «q=» vacío', () => {
    const params = new URLSearchParams('q=');

    expect(writeFilters(params, { maxPrice: '10' }).toString()).toBe('maxPrice=10');
  });

  it('cuenta los filtros activos', () => {
    expect(countActiveFilters({})).toBe(0);
    expect(countActiveFilters({ categoryId: 'c1', maxPrice: '10' })).toBe(2);
  });

  it.each(['', '10', '7.5', '7,50', ' 3 ', '12345678', '12345678,99'])(
    'acepta «%s» como precio máximo',
    (value) => {
      expect(isValidMaxPrice(value)).toBe(true);
    },
  );

  it.each(['0', '-5', 'diez', '1.234', '10e2', '0,00', '123456789'])(
    'rechaza «%s» como precio máximo',
    (value) => {
      expect(isValidMaxPrice(value)).toBe(false);
    },
  );

  it('normaliza la coma decimal a punto, como espera la API', () => {
    expect(normalizeMaxPrice(' 7,5 ')).toBe('7.5');
  });
});
