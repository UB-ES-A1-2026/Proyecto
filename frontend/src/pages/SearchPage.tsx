import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { SearchBar } from '../components/SearchBar';
import { ApiError } from '../services/apiClient';
import { searchItems, type SearchParams, type SearchResponse } from '../services/searchService';

const priceFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

// Generado con asistencia de IA – revisado por Danyal, 31/10/2026
export function SearchPage() {
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const urlParams = new URLSearchParams(location.search);
  const q = urlParams.get('q') ?? '';
  const pageParam = urlParams.get('page') ?? '';
  const categoryId = urlParams.get('categoryId') ?? '';
  const maxPrice = urlParams.get('maxPrice') ?? '';
  const neighborhood = urlParams.get('neighborhood') ?? '';
  const page = Math.max(1, Number.parseInt(pageParam, 10) || 1);
  const hasCriteria = Boolean(
    q.trim() || categoryId.trim() || maxPrice.trim() || neighborhood.trim(),
  );

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
      {/* Aquí va <SearchFilters /> (US-03.02, #118) */}

      {!hasCriteria ? (
        <>
          <h1>Buscar objetos</h1>
          <p>Escribe qué quieres alquilar y pulsa «Buscar».</p>
        </>
      ) : (
        <>
          <h1>{q ? `Resultados para «${q}»` : 'Resultados'}</h1>
          {loading ? (
            <p role="status">Buscando…</p>
          ) : error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : response && response.items.length === 0 ? (
            <p>
              {q
                ? `No hemos encontrado ningún objeto para «${q}».`
                : 'No hemos encontrado ningún objeto.'}
            </p>
          ) : response ? (
            <>
              <p>
                {response.total} {response.total === 1 ? 'objeto encontrado' : 'objetos encontrados'}
              </p>
              <ul className="search-results">
                {response.items.map((item) => (
                  <li className="search-result-card" key={item.id}>
                    {item.photo ? (
                      <img src={item.photo} alt={item.title} />
                    ) : (
                      <div className="search-result-photo-placeholder">Sin foto</div>
                    )}
                    <h2>
                      <Link to={`/objetos/${item.id}`}>{item.title}</Link>
                    </h2>
                    <p>{priceFormatter.format(Number(item.dailyPrice))} / día</p>
                    <p>
                      {item.neighborhood} · {item.category.name}
                    </p>
                  </li>
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
                    Anterior
                  </button>
                  <span>
                    Página {page} de {pageCount}
                  </span>
                  <button
                    className="button-secondary"
                    type="button"
                    disabled={page >= pageCount}
                    onClick={() => navigateToPage(page + 1)}
                  >
                    Siguiente
                  </button>
                </nav>
              )}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
