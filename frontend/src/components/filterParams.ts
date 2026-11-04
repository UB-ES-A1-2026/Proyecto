// Filtros de la búsqueda (US-03.02, #118). Viven en la URL de la página de resultados
// (/buscar?q=…&categoryId=…&maxPrice=…&neighborhood=…) con los mismos nombres que los
// parámetros de GET /api/objetos (#117), para que «Atrás» y «Limpiar filtros» funcionen solos.

export type SearchFilters = {
  categoryId?: string;
  maxPrice?: string;
  neighborhood?: string;
};

export const FILTER_KEYS = ['categoryId', 'maxPrice', 'neighborhood'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export const MAX_PRICE_ERROR = 'El campo "precio máximo" no es correcto, revísalo.';
export const MAX_NEIGHBORHOOD_LENGTH = 100;

// Una URL escrita a mano puede traer valores no válidos (?maxPrice=abc): se ignoran en lugar
// de mostrarlos como filtro activo y mandarlos a la API, que respondería 400. La página de
// resultados pide a la API lo que devuelve esta función, no lo que trae la URL.
export function readFilters(params: URLSearchParams): SearchFilters {
  const filters: SearchFilters = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key)?.trim();
    if (!value) continue;
    if (key === 'maxPrice') {
      if (isValidMaxPrice(value)) filters.maxPrice = normalizeMaxPrice(value);
    } else if (key !== 'neighborhood' || value.length <= MAX_NEIGHBORHOOD_LENGTH) {
      filters[key] = value;
    }
  }
  return filters;
}

// Devuelve una copia de los parámetros con los filtros nuevos. El resto (q, …) se mantiene,
// y la página vuelve a la primera porque los resultados cambian.
export function writeFilters(params: URLSearchParams, filters: SearchFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of FILTER_KEYS) {
    const value = filters[key]?.trim();
    if (value) next.set(key, value);
    else next.delete(key);
  }
  next.delete('page');
  // Sin texto ni filtros, «?q=» hace que la página siga mostrando todos los objetos (criterio 5
  // de US-03.02) en lugar de la ayuda de «/buscar».
  if (!next.get('q')?.trim()) {
    if (FILTER_KEYS.some((key) => next.has(key))) next.delete('q');
    else next.set('q', '');
  }
  return next;
}

export function countActiveFilters(filters: SearchFilters): number {
  return FILTER_KEYS.filter((key) => filters[key]).length;
}

// Precio máximo: vacío (sin límite) o un número mayor que 0, de hasta 8 cifras enteras y 2
// decimales, con punto o coma decimal.
export function isValidMaxPrice(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return true;
  if (!/^\d{1,8}([.,]\d{1,2})?$/.test(trimmed)) return false;
  return Number(trimmed.replace(',', '.')) > 0;
}

export function normalizeMaxPrice(value: string): string {
  return value.trim().replace(',', '.');
}
