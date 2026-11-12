// Generado con asistencia de IA (Claude)
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { ApiError } from '../services/apiClient';
import { getCategories, type Category } from '../services/categoryService';
import { searchItems, type SearchResponse } from '../services/searchService';

const priceFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

type Query = { q: string; categoryId: string; page: number };

// Objetos publicados, en tabla, para el admin. Usa la búsqueda pública: de momento se ven los
// publicados; los pausados y retirados, y su propietario, llegan con el panel completo (US-11.01).
export function AdminItemsPage() {
  const searchId = useId();
  const categoryId = useId();
  const [text, setText] = useState('');
  const [query, setQuery] = useState<Query>({ q: '', categoryId: '', page: 1 });
  const [categories, setCategories] = useState<Category[]>([]);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let ignore = false;
    searchItems({ q: query.q, categoryId: query.categoryId, page: String(query.page) })
      .then((data) => {
        if (ignore) return;
        setResult(data);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (ignore) return;
        setError(
          requestError instanceof ApiError && requestError.status === 0
            ? requestError.message
            : 'No hemos podido cargar los objetos. Inténtalo de nuevo más tarde.',
        );
      });
    return () => {
      ignore = true;
    };
  }, [query]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setQuery((current) => ({ ...current, q: text.trim(), page: 1 }));
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const goTo = (page: number) => {
    setResult(null);
    setQuery((current) => ({ ...current, page }));
  };

  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Objetos publicados</h1>
          <p className="admin-page-subtitle">
            {result
              ? `${result.total} ${result.total === 1 ? 'objeto' : 'objetos'}${query.q || query.categoryId ? ' con estos filtros' : ' en total'}`
              : 'Cargando…'}
          </p>
        </div>
      </header>

      <div className="admin-table-card card">
        <form className="admin-toolbar" role="search" onSubmit={handleSearch}>
          <div className="admin-search">
            <label htmlFor={searchId} className="manage-visually-hidden">
              Buscar objetos
            </label>
            <Icon name="search" />
            <input
              id={searchId}
              type="search"
              placeholder="Buscar por nombre o descripción"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <label htmlFor={categoryId} className="manage-visually-hidden">
            Categoría
          </label>
          <select
            id={categoryId}
            className="admin-select"
            value={query.categoryId}
            onChange={(event) => {
              setResult(null);
              setQuery((current) => ({ ...current, categoryId: event.target.value, page: 1 }));
            }}
          >
            <option value="">Todas las categorías</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button type="submit" className="button-secondary admin-toolbar-button">
            Buscar
          </button>
        </form>

        {error ? (
          <p role="alert" className="form-error manage-notice admin-table-message">
            <Icon name="error" />
            {error}
          </p>
        ) : (
          <table className="admin-table">
            <caption className="manage-visually-hidden">Objetos publicados</caption>
            <thead>
              <tr>
                <th scope="col">Objeto</th>
                <th scope="col">Categoría</th>
                <th scope="col">Barrio</th>
                <th scope="col" className="admin-table-number">
                  Precio por día
                </th>
                <th scope="col">
                  <span className="manage-visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result === null ? (
                [0, 1, 2, 3, 4].map((row) => (
                  <tr key={row} aria-hidden="true">
                    <td colSpan={5}>
                      <span className="skeleton admin-table-skeleton" />
                    </td>
                  </tr>
                ))
              ) : result.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">
                    No hay objetos publicados con estos filtros.
                  </td>
                </tr>
              ) : (
                result.items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Objeto">
                      <span className="admin-cell-object">
                        <span className="admin-row-thumb" aria-hidden="true">
                          {item.photo ? <img src={item.photo} alt="" /> : <Icon name="image" />}
                        </span>
                        <span className="admin-cell-title">{item.title}</span>
                      </span>
                    </td>
                    <td data-label="Categoría">{item.category.name}</td>
                    <td data-label="Barrio">{item.neighborhood}</td>
                    <td data-label="Precio por día" className="admin-table-number">
                      {priceFormatter.format(Number(item.dailyPrice))}
                    </td>
                    <td className="admin-table-action">
                      <Link to={`/objetos/${item.id}`} className="admin-table-link">
                        Ver ficha
                        <span className="manage-visually-hidden"> de {item.title}</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {result && pages > 1 && (
          <nav className="admin-pagination" aria-label="Páginas de objetos">
            <button
              type="button"
              className="button-quiet"
              disabled={query.page <= 1}
              onClick={() => goTo(query.page - 1)}
            >
              <Icon name="chevron_left" />
              Anterior
            </button>
            <span>
              Página {query.page} de {pages}
            </span>
            <button
              type="button"
              className="button-quiet"
              disabled={query.page >= pages}
              onClick={() => goTo(query.page + 1)}
            >
              Siguiente
              <Icon name="chevron_right" />
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}
