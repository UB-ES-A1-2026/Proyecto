// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 31/10/2026
import { useId, useState, type FormEvent } from 'react';
import type { Category } from '../services/categoryService';
import {
  isValidMaxPrice,
  MAX_PRICE_ERROR,
  normalizeMaxPrice,
  type SearchFilters,
} from './filterParams';

type FiltersPanelProps = {
  id?: string;
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
    <form id={id} className="filters-panel" aria-label="Filtros" noValidate onSubmit={handleSubmit}>
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
            <p id={`${fieldId}-precio-error`} className="field-error">
              {MAX_PRICE_ERROR}
            </p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor={`${fieldId}-barrio`}>Barrio</label>
          <input
            id={`${fieldId}-barrio`}
            placeholder="Ej.: Gràcia"
            value={neighborhood}
            onChange={(event) => setNeighborhood(event.target.value)}
          />
        </div>
      </div>

      <div className="filters-actions">
        <button type="submit" className="button-primary">
          Aplicar filtros
        </button>
        <button type="button" className="button-secondary" onClick={handleClear}>
          Limpiar filtros
        </button>
      </div>
    </form>
  );
}
