import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { countActiveFilters, readFilters } from '../components/filterParams';
import { Icon } from '../components/Icon';
import { ItemCard, ItemGridSkeleton } from '../components/ItemCard';
import { NoResultsWithFilters, SearchFilters } from '../components/SearchFilters';
import { SearchBar } from '../components/SearchBar';
import { ApiError } from '../services/apiClient';
import { searchItems, type SearchParams, type SearchResponse } from '../services/searchService';

// Generado con asistencia de IA – revisado por Danyal, 31/10/2026
export function SearchPage() {
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const urlParams = new URLSearchParams(location.search);
  const q = urlParams.get('q') ?? '';
  const pageParam = urlParams.get('page') ?? '';
  const filters = readFilters(urlParams);
  const categoryId = filters.categoryId ?? '';
  const maxPrice = filters.maxPrice ?? '';
  const neighborhood = filters.neighborhood ?? '';
  const page = Math.max(1, Number.parseInt(pageParam, 10) || 1);
  // «?q=» vacío viene de limpiar los filtros sin texto: se muestran todos los objetos.
  const hasCriteria = urlParams.has('q') || countActiveFilters(filters) > 0;

  const [result, setResult] = useState<{ search: string; data: SearchResponse } | null>(null);
  const [errorState, setErrorState] = useState<{ search: string; message: string } | null>(null);

  useEffect(() => {
    if (!hasCriteria) return;

    let ignore = false;
    const currentSearch = location.search;
    const params: SearchParams = {
      q: q || undefined,
      page: pageParam || undefined,
      categoryId: categoryId || undefined,
      maxPrice: maxPrice || undefined,
      neighborhood: neighborhood || undefined,
    };

    searchItems(params)
      .then((data) => {
        if (!ignore) setResult({ search: currentSearch, data });
      })
      .catch((requestError: unknown) => {
        if (ignore) return;
        setErrorState({
          search: currentSearch,
          message:
            requestError instanceof ApiError &&
            (requestError.status === 0 || requestError.status === 400)
              ? requestError.message
              : 'No hemos podido cargar los resultados. Inténtalo de nuevo más tarde.',
        });
      });

    return () => {
      ignore = true;
    };
  }, [location.search, hasCriteria, q, pageParam, categoryId, maxPrice, neighborhood]);

  const response = result?.search === location.search ? result.data : null;
  const error = errorState?.search === location.search ? errorState.message : null;
  const loading = hasCriteria && !response && !error;

  function navigateToPage(nextPage: number) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      return next;
    });
  }

  const pageCount =
    response && response.pageSize > 0 ? Math.ceil(response.total / response.pageSize) : 1;

  return (
    <section className="search-page">
      <SearchBar key={q} initialQuery={q} />

      <div className="search-layout">
        <SearchFilters />

        <div className="search-content">
          {!hasCriteria ? (
            <>
              <h1 className="page-title">Buscar objetos</h1>
              <div className="card empty-state">
                <Icon name="search" />
                <p>Escribe qué quieres alquilar y pulsa «Buscar».</p>
              </div>
            </>
          ) : (
            <>
              <h1 className="page-title">{q ? `Resultados para «${q}»` : 'Resultados'}</h1>
              {loading ? (
                <>
                  <p role="status" className="page-subtitle">
                    Buscando…
                  </p>
                  <ItemGridSkeleton count={6} />
                </>
              ) : error ? (
                <p role="alert" className="form-error">
                  {error}
                </p>
              ) : response && response.items.length === 0 ? (
                // Si hay filtros, la causa son ellos: se ofrece quitarlos (US-03.02, #118)
                countActiveFilters(filters) > 0 ? (
                  <NoResultsWithFilters />
                ) : (
                  <div className="card empty-state">
                    <Icon name="search_off" />
                    <p>
                      {q
                        ? `No hemos encontrado ningún objeto para «${q}».`
                        : 'No hemos encontrado ningún objeto.'}
                    </p>
                  </div>
                )
              ) : response ? (
                <>
                  <p className="page-subtitle">
                    {response.total}{' '}
                    {response.total === 1 ? 'objeto encontrado' : 'objetos encontrados'}
                  </p>
                  <ul className="search-results item-grid stagger">
                    {response.items.map((item) => (
                      <ItemCard item={item} key={item.id} />
                    ))}
                  </ul>
                  {response.total > response.pageSize && (
                    <nav aria-label="Paginación de resultados" className="search-pagination">
                      <button
                        className="button-secondary"
                        type="button"
                        disabled={page <= 1}
                        onClick={() => navigateToPage(page - 1)}
                      >
                        <Icon name="chevron_left" />
                        Anterior
                      </button>
                      <span className="search-pagination-status">
                        Página {page} de {pageCount}
                      </span>
                      <button
                        className="button-secondary"
                        type="button"
                        disabled={page >= pageCount}
                        onClick={() => navigateToPage(page + 1)}
                      >
                        Siguiente
                        <Icon name="chevron_right" />
                      </button>
                    </nav>
                  )}
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
