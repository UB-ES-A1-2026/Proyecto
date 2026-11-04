// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 31/10/2026
import { useId, useState, type FormEvent } from 'react';
import type { Category } from '../services/categoryService';
import {
  isValidMaxPrice,
  MAX_NEIGHBORHOOD_LENGTH,
  MAX_PRICE_ERROR,
  normalizeMaxPrice,
  type SearchFilters,
} from './filterParams';
import { Icon } from './Icon';

type FiltersPanelProps = {
  id?: string;
  open: boolean;
  categories: Category[];
  categoriesError?: string | null;
  initialFilters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  onClear: () => void;
};

// Formulario del panel de filtros (US-03.02, #118; wireframe US-03.02-filtrar-objetos).
// No sabe nada de la URL: recibe los filtros actuales y avisa al aplicar o limpiar.
export function FiltersPanel({
  id,
  open,
  categories,
  categoriesError,
  initialFilters,
  onApply,
  onClear,
}: FiltersPanelProps) {
  const fieldId = useId();
  const [categoryId, setCategoryId] = useState(initialFilters.categoryId ?? '');
  const [maxPrice, setMaxPrice] = useState(initialFilters.maxPrice ?? '');
  const [neighborhood, setNeighborhood] = useState(initialFilters.neighborhood ?? '');
  const [maxPriceError, setMaxPriceError] = useState(false);

  // Si cambian los filtros de la URL (chips, «Atrás»), el panel pasa a mostrar los nuevos. El panel
  // no se vuelve a montar para no perder el foco, y si solo cambia la búsqueda no se pierde lo escrito.
  const filtersKey = JSON.stringify(initialFilters);
  const [shownFiltersKey, setShownFiltersKey] = useState(filtersKey);
  if (filtersKey !== shownFiltersKey) {
    setShownFiltersKey(filtersKey);
    setCategoryId(initialFilters.categoryId ?? '');
    setMaxPrice(initialFilters.maxPrice ?? '');
    setNeighborhood(initialFilters.neighborhood ?? '');
    setMaxPriceError(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidMaxPrice(maxPrice)) {
      setMaxPriceError(true);
      return;
    }
    onApply({
      categoryId,
      maxPrice: normalizeMaxPrice(maxPrice),
      neighborhood: neighborhood.trim(),
    });
  }

  function handleClear() {
    setCategoryId('');
    setMaxPrice('');
    setNeighborhood('');
    setMaxPriceError(false);
    onClear();
  }

  return (
    <form
      id={id}
      className="card filters-panel"
      data-open={open}
      aria-label="Filtros"
      noValidate
      onSubmit={handleSubmit}
    >
      <p className="filters-title">
        <Icon name="tune" />
        Filtros
      </p>
      <div className="filters-fields">
        <div className="form-field">
          <label htmlFor={`${fieldId}-categoria`}>Categoría</label>
          <select
            id={`${fieldId}-categoria`}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {categoriesError && <p className="field-hint">{categoriesError}</p>}
        </div>

        <div className="form-field">
          <label htmlFor={`${fieldId}-precio`}>Precio máximo (€/día)</label>
          <input
            id={`${fieldId}-precio`}
            inputMode="decimal"
            value={maxPrice}
            aria-invalid={maxPriceError}
            aria-describedby={maxPriceError ? `${fieldId}-precio-error` : undefined}
            onChange={(event) => {
              setMaxPrice(event.target.value);
              setMaxPriceError(false);
            }}
          />
          {maxPriceError && (
            <p id={`${fieldId}-precio-error`} className="field-error" role="alert">
              {MAX_PRICE_ERROR}
            </p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor={`${fieldId}-barrio`}>Barrio</label>
          <input
            id={`${fieldId}-barrio`}
            placeholder="Ej.: Gràcia"
            maxLength={MAX_NEIGHBORHOOD_LENGTH}
            value={neighborhood}
            onChange={(event) => setNeighborhood(event.target.value)}
          />
        </div>
      </div>

      <div className="filters-actions">
        <button type="submit" className="button-secondary filters-apply">
          Aplicar filtros
        </button>
        <button type="button" className="button-quiet" onClick={handleClear}>
          Limpiar filtros
        </button>
      </div>
    </form>
  );
}
