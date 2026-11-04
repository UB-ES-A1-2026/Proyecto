// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 31/10/2026
import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getCategories, type Category } from '../services/categoryService';
import { FiltersPanel } from './FiltersPanel';
import { Icon } from './Icon';
import {
  countActiveFilters,
  readFilters,
  writeFilters,
  type FilterKey,
  type SearchFilters as Filters,
} from './filterParams';

// Botón «Filtros», panel y filtros activos de la página de resultados (US-03.02, #118).
// Lee y escribe los filtros en la URL, y la página vuelve a pedir GET /api/objetos cuando cambian
// sus parámetros. En escritorio el panel siempre se ve a un lado de los resultados y el botón no
// sale; en móvil, el botón lo abre y lo cierra (lo decide el CSS).
export function SearchFilters() {
  const panelId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilters = readFilters(searchParams);
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  // Una categoría que no existe (URL antigua o escrita a mano) no cuenta como filtro: el
  // desplegable mostraría «Todas» y el chip no tendría nombre.
  const unknownCategory =
    urlFilters.categoryId !== undefined &&
    categories.length > 0 &&
    !categories.some((category) => category.id === urlFilters.categoryId);
  const filters: Filters = unknownCategory ? { ...urlFilters, categoryId: undefined } : urlFilters;
  const activeCount = countActiveFilters(filters);
  useEffect(() => {
    let ignore = false;
    getCategories()
      .then((data) => {
        if (!ignore) setCategories(data);
      })
      .catch(() => {
        if (!ignore) setCategoriesError('No se han podido cargar las categorías.');
      });
    return () => {
      ignore = true;
    };
  }, []);

  function applyFilters(next: Filters) {
    setSearchParams(writeFilters(searchParams, next));
    setOpen(false);
  }

  function clearFilters() {
    setSearchParams(writeFilters(searchParams, {}));
  }

  function removeFilter(key: FilterKey) {
    setSearchParams(writeFilters(searchParams, { ...filters, [key]: undefined }));
  }

  const categoryName = categories.find((category) => category.id === filters.categoryId)?.name;
  const chips: { key: FilterKey; label: string }[] = [];
  if (filters.categoryId) chips.push({ key: 'categoryId', label: categoryName ?? 'Categoría' });
  if (filters.maxPrice) {
    const price = Number(filters.maxPrice).toLocaleString('es-ES');
    chips.push({ key: 'maxPrice', label: `Hasta ${price} €/día` });
  }
  if (filters.neighborhood) chips.push({ key: 'neighborhood', label: filters.neighborhood });

  return (
    <div className="search-filters">
      <button
        type="button"
        className="button-secondary filters-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="tune" />
        {activeCount > 0 ? `Filtros (${activeCount})` : 'Filtros'}
      </button>

      <FiltersPanel
        id={panelId}
        open={open}
        categories={categories}
        categoriesError={categoriesError}
        initialFilters={filters}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      {chips.length > 0 && (
        <ul className="active-filters" aria-label="Filtros activos">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                className="filter-chip"
                aria-label={`Quitar filtro ${chip.label}`}
                onClick={() => removeFilter(chip.key)}
              >
                {chip.label} <span aria-hidden="true">✕</span>
              </button>
            </li>
          ))}
          <li className="active-filters-clear">
            <button type="button" className="link-button" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

// Mensaje para la página de resultados cuando la búsqueda no da resultados por culpa
// de los filtros (pantalla 5 del wireframe). Si no hay filtros, no muestra nada y la
// página enseña su propio mensaje de «sin resultados» (#115).
export function NoResultsWithFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  if (countActiveFilters(readFilters(searchParams)) === 0) return null;

  return (
    <div role="status" className="card empty-state">
      <Icon name="filter_alt" />
      <p>No hay objetos que cumplan estos filtros.</p>
      <button
        type="button"
        className="link-button"
        onClick={() => setSearchParams(writeFilters(searchParams, {}))}
      >
        Limpiar filtros
      </button>
    </div>
  );
}
