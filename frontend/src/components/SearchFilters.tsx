// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 31/10/2026
import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getCategories, type Category } from '../services/categoryService';
import { FiltersPanel } from './FiltersPanel';
import {
  countActiveFilters,
  readFilters,
  writeFilters,
  type FilterKey,
  type SearchFilters as Filters,
} from './filterParams';

// Botón «Filtros», panel y filtros activos de la página de resultados (US-03.02, #118).
// Se coloca en la página de búsqueda (#115) debajo de la barra; lee y escribe los filtros
// en la URL, y la página vuelve a pedir GET /api/objetos cuando cambian sus parámetros.
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
  if (filters.maxPrice) chips.push({ key: 'maxPrice', label: `Hasta ${filters.maxPrice} €/día` });
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
        {activeCount > 0 ? `Filtros (${activeCount})` : 'Filtros'}
      </button>

      {open && (
        <FiltersPanel
          // Si cambian los filtros de la URL (chips, «Atrás»), el panel empieza con los nuevos.
          // Solo los filtros: si cambia la búsqueda con el panel abierto, no se pierde lo escrito.
          key={JSON.stringify(filters)}
          id={panelId}
          categories={categories}
          categoriesError={categoriesError}
          initialFilters={filters}
          onApply={applyFilters}
          onClear={clearFilters}
        />
      )}

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
          <li>
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
    <p role="status" className="filters-empty">
      No hay objetos que cumplan estos filtros.{' '}
      <button
        type="button"
        className="link-button"
        onClick={() => setSearchParams(writeFilters(searchParams, {}))}
      >
        Limpiar filtros
      </button>
    </p>
  );
}
