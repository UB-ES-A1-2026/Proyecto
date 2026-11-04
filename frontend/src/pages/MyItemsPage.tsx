import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { EditItemDialog } from '../components/EditItemDialog';
import { Icon, type IconName } from '../components/Icon';
import { WithdrawItemDialog } from '../components/WithdrawItemDialog';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import {
  getMyItems,
  pauseItem,
  resumeItem,
  type ItemDetail,
  type ItemStatus,
  type MyItem,
} from '../services/itemService';

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

const STATUS_STYLES: Record<ItemStatus, { badge: string; icon: IconName }> = {
  published: { badge: 'badge-success', icon: 'check_circle' },
  paused: { badge: 'badge-warning', icon: 'pause' },
  withdrawn: { badge: 'badge-neutral', icon: 'do_not_disturb_on' },
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
// También lo pausa o reanuda (#113) y retira un anuncio (#111).
export function MyItemsPage() {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const [items, setItems] = useState<MyItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<MyItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
    setActionError(null);
    setEditingId(id);
  }

  // Actualiza la fila con lo guardado, sin volver a pedir toda la lista.
  function handleSaved(saved: ItemDetail, photosFailed: boolean) {
    setItems(
      (current) =>
        current?.map((item) =>
          item.id === saved.id
            ? {
                ...item,
                title: saved.title,
                dailyPrice: saved.dailyPrice,
                status: saved.status,
                photo: saved.photos[0]?.url ?? item.photo,
              }
            : item,
        ) ?? null,
    );
    setEditingId(null);
    if (photosFailed) {
      setActionError(
        'Los cambios se han guardado, pero alguna foto no se ha podido subir. Vuelve a «Editar» para intentarlo otra vez.',
      );
    } else {
      setMessage('Los cambios se han guardado.');
    }
  }

  // Pausar y reanudar (#113) se pueden deshacer, así que se aplican sin ventana de confirmación.
  async function togglePause(item: MyItem) {
    if (!token || togglingId) return;

    setMessage(null);
    setActionError(null);
    setTogglingId(item.id);
    try {
      const changed =
        item.status === 'paused'
          ? await resumeItem(token, item.id)
          : await pauseItem(token, item.id);
      setItems(
        (current) =>
          current?.map((row) => (row.id === changed.id ? { ...row, ...changed } : row)) ?? null,
      );
      setMessage(
        changed.status === 'paused'
          ? 'El anuncio se ha pausado: no aparecerá en las búsquedas hasta que lo reanudes.'
          : 'El anuncio se ha reanudado y vuelve a aparecer en las búsquedas.',
      );
    } catch (requestError) {
      // Sesión caducada o revocada: al borrarla, PrivateRoute lleva al login.
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
      } else if (requestError instanceof ApiError) {
        // Mensajes de #112: 403 si no es tuyo, 404 si no existe y 409 si el estado no lo permite.
        setActionError(requestError.message);
      } else {
        setActionError('Ha ocurrido un error inesperado.');
      }
    } finally {
      setTogglingId(null);
    }
  }

  function openWithdraw(item: MyItem) {
    setMessage(null);
    setActionError(null);
    setWithdrawing(item);
  }

  // La fila se queda en la lista como «Retirado»: el propietario la sigue viendo con su filtro.
  function handleWithdrawn(withdrawn: MyItem) {
    setItems(
      (current) =>
        current?.map((item) => (item.id === withdrawn.id ? { ...item, ...withdrawn } : item)) ??
        null,
    );
    setWithdrawing(null);
    setMessage('El anuncio se ha retirado.');
  }

  return (
    <section className="my-items">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mis objetos</h1>
          <p className="page-subtitle">Los objetos que tienes publicados para alquilar.</p>
        </div>
        <Link to="/objetos/nuevo" className="button-primary my-items-publish">
          <Icon name="add" />
          Publicar un objeto
        </Link>
      </div>
      {message && (
        <p role="status" className="form-success manage-notice">
          <Icon name="check_circle" />
          {message}
        </p>
      )}
      {actionError && (
        <p role="alert" className="form-error manage-notice">
          <Icon name="error" />
          {actionError}
        </p>
      )}
      {error ? (
        <p role="alert" className="form-error manage-notice">
          <Icon name="error" />
          {error}
        </p>
      ) : !items ? (
        <>
          <p className="manage-visually-hidden">Cargando tus objetos…</p>
          <div className="item-list" aria-hidden="true">
            {[0, 1, 2].map((placeholder) => (
              <div key={placeholder} className="item-skeleton card">
                <div className="item-photo skeleton" />
                <div className="item-info">
                  <div className="skeleton manage-skeleton-title" />
                  <div className="skeleton manage-skeleton-line" />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : items.length === 0 ? (
        <div className="empty-state card manage-empty">
          <Icon name="inventory_2" />
          <p>Todavía no has publicado ningún objeto.</p>
        </div>
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
            <div className="empty-state card manage-empty">
              <Icon name="filter_alt" />
              <p>No tienes objetos en este estado.</p>
            </div>
          ) : (
            // Cambiar de filtro vuelve a montar la lista para repetir su animación de entrada.
            <ul key={filter} className="item-list stagger">
              {visibleItems.map((item) => (
                <li key={item.id} className={`item-row card item-row-${item.status}`}>
                  <div className="item-photo" aria-hidden="true">
                    {item.photo ? <img src={item.photo} alt="" /> : <Icon name="image" />}
                  </div>
                  <div className="item-info">
                    <div className="item-heading">
                      <h2 className="item-title">{item.title}</h2>
                      <span
                        key={item.status}
                        className={`badge ${STATUS_STYLES[item.status].badge} item-status`}
                      >
                        <Icon name={STATUS_STYLES[item.status].icon} />
                        {STATUS_LABELS[item.status]}
                      </span>
                    </div>
                    <p className="item-price">
                      <strong>{priceFormatter.format(Number(item.dailyPrice))}</strong> / día
                    </p>
                    <p className="item-hint">{STATUS_HINTS[item.status]}</p>
                  </div>
                  {/* Retirar es definitivo: un objeto retirado no se puede editar (409, #202)
                      ni pausar, reanudar o volver a retirar. */}
                  {item.status !== 'withdrawn' && (
                    <div className="item-actions">
                      <button
                        type="button"
                        className="button-secondary button-edit"
                        aria-label={`Editar ${item.title}`}
                        onClick={() => openEditor(item.id)}
                      >
                        <Icon name="edit" />
                        Editar
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        aria-label={`${item.status === 'paused' ? 'Reanudar' : 'Pausar'} ${item.title}`}
                        disabled={togglingId !== null}
                        onClick={() => togglePause(item)}
                      >
                        <Icon name={item.status === 'paused' ? 'play_arrow' : 'pause'} />
                        {togglingId === item.id
                          ? item.status === 'paused'
                            ? 'Reanudando…'
                            : 'Pausando…'
                          : item.status === 'paused'
                            ? 'Reanudar'
                            : 'Pausar'}
                      </button>
                      <button
                        type="button"
                        className="button-quiet button-withdraw"
                        aria-label={`Retirar anuncio ${item.title}`}
                        onClick={() => openWithdraw(item)}
                      >
                        <Icon name="delete" />
                        Retirar anuncio
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editingId && (
        <EditItemDialog id={editingId} onClose={() => setEditingId(null)} onSaved={handleSaved} />
      )}
      {withdrawing && (
        <WithdrawItemDialog
          item={withdrawing}
          onClose={() => setWithdrawing(null)}
          onWithdrawn={handleWithdrawn}
        />
      )}
    </section>
  );
}
