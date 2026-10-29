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

// Pantalla «Mis objetos» (#109): lista los objetos del usuario y los edita en una ventana.
// Retirar (#111) y Pausar / Reanudar (#113) se añadirán en cada fila.
export function MyItemsPage() {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const [items, setItems] = useState<MyItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
      <h1>Mis objetos</h1>
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
        <ul className="item-list">
          {items.map((item) => (
            <li key={item.id} className="item-row">
              <div className="item-info">
                <h2 className="item-title">{item.title}</h2>
                <p className="item-meta">
                  {priceFormatter.format(Number(item.dailyPrice))} / día · {item.neighborhood}
                </p>
                <span className={`item-status item-status-${item.status}`}>
                  {STATUS_LABELS[item.status]}
                </span>
              </div>
              <div className="item-actions">
                <button
                  type="button"
                  className="button-secondary"
                  aria-label={`Editar ${item.title}`}
                  onClick={() => openEditor(item.id)}
                >
                  Editar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editingId && (
        <EditItemDialog id={editingId} onClose={() => setEditingId(null)} onSaved={handleSaved} />
      )}
    </section>
  );
}
