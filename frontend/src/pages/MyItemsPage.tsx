// Generado con asistencia de IA (Claude) – revisado por <nombre>, <fecha>
import { useEffect, useState } from 'react';
import { EditItemDialog } from '../components/EditItemDialog';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getMyItems, type ItemDetail, type ItemStatus, type MyItem } from '../services/itemService';

const priceFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

const STATUS_LABELS: Record<ItemStatus, string> = {
  published: 'Publicado',
  paused: 'Pausado',
  withdrawn: 'Retirado',
};

const STATUS_HINTS: Record<ItemStatus, string> = {
  published: 'Visible en las búsquedas',
  paused: 'No aparece en las búsquedas hasta que lo reanudes',
  withdrawn: 'Ya no se puede alquilar',
};

type Filter = 'all' | ItemStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Publicados' },
  { value: 'paused', label: 'Pausados' },
  { value: 'withdrawn', label: 'Retirados' },
];

function countByFilter(items: MyItem[], filter: Filter): number {
  return filter === 'all' ? items.length : items.filter((item) => item.status === filter).length;
}

// Pantalla «Mis objetos» (#109): lista los objetos del usuario y los edita en una ventana.
// Retirar (#111) y Pausar / Reanudar (#113) se añadirán en cada fila.
export function MyItemsPage() {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const [items, setItems] = useState<MyItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const visibleItems =
    filter === 'all' ? (items ?? []) : (items ?? []).filter((item) => item.status === filter);

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    getMyItems(token)
      .then((data) => {
        if (!ignore) setItems(data);
      })
      .catch((requestError: unknown) => {
        if (ignore) return;
        // Sesión caducada o revocada: al borrarla, PrivateRoute lleva al login.
        if (requestError instanceof ApiError && requestError.status === 401) {
          clearSession();
        } else if (requestError instanceof ApiError) {
          setError(requestError.message);
        } else {
          setError('Ha ocurrido un error inesperado.');
        }
      });

    return () => {
      ignore = true;
    };
  }, [token, clearSession]);

  function openEditor(id: string) {
    setMessage(null);
    setEditingId(id);
  }

  // Actualiza la fila con lo guardado, sin volver a pedir toda la lista.
  function handleSaved(saved: ItemDetail) {
    setItems(
      (current) =>
        current?.map((item) =>
          item.id === saved.id
            ? { ...item, title: saved.title, dailyPrice: saved.dailyPrice, status: saved.status }
            : item,
        ) ?? null,
    );
    setEditingId(null);
    setMessage('Los cambios se han guardado.');
  }

  return (
    <section className="my-items">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mis objetos</h1>
          <p className="page-subtitle">Los objetos que tienes publicados para alquilar.</p>
        </div>
        {/* El formulario de publicación llega con S1-T4 (#13): de momento el botón solo se muestra. */}
        <button type="button" className="button-publish" disabled>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          Publicar un objeto
        </button>
      </div>
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : !items ? (
        <p>Cargando tus objetos…</p>
      ) : items.length === 0 ? (
        <p>Todavía no has publicado ningún objeto.</p>
      ) : (
        <>
          <div className="filter-chips" role="group" aria-label="Filtrar por estado">
            {FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className="filter-chip"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label} · {countByFilter(items, value)}
              </button>
            ))}
          </div>
          {visibleItems.length === 0 ? (
            <p>No tienes objetos en este estado.</p>
          ) : (
            <ul className="item-list">
              {visibleItems.map((item) => (
                <li key={item.id} className="item-row">
                  {/* Las fotos llegan con el spike de imágenes (#92): de momento, un hueco. */}
                  <div className="item-photo" aria-hidden="true">
                    <svg width="32" height="32" viewBox="0 0 24 24">
                      <rect
                        x="3"
                        y="4"
                        width="18"
                        height="16"
                        rx="2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <circle
                        cx="9"
                        cy="10"
                        r="2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="m4 18 5-5 4 4 3-3 4 4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>
                  <div className="item-info">
                    <div className="item-heading">
                      <h2 className="item-title">{item.title}</h2>
                      <span className={`item-status item-status-${item.status}`}>
                        {STATUS_LABELS[item.status]}
                      </span>
                    </div>
                    <p className="item-price">
                      <strong>{priceFormatter.format(Number(item.dailyPrice))}</strong> / día
                    </p>
                    <p className="item-hint">{STATUS_HINTS[item.status]}</p>
                  </div>
                  <div className="item-actions">
                    <button
                      type="button"
                      className="button-edit"
                      aria-label={`Editar ${item.title}`}
                      onClick={() => openEditor(item.id)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M4 20h4L19 9l-4-4L4 16v4Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Editar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editingId && (
        <EditItemDialog id={editingId} onClose={() => setEditingId(null)} onSaved={handleSaved} />
      )}
    </section>
  );
}
