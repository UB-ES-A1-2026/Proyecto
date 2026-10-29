// Generado con asistencia de IA (Claude) – revisado por <nombre>, <fecha>
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getMyItems, type ItemStatus, type MyItem } from '../services/itemService';

const priceFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

const STATUS_LABELS: Record<ItemStatus, string> = {
  published: 'Publicado',
  paused: 'Pausado',
  withdrawn: 'Retirado',
};

// Pantalla «Mis objetos» (#109): lista los objetos del usuario con el acceso a editarlos.
// Retirar (#111) y Pausar / Reanudar (#113) se añadirán en cada fila.
export function MyItemsPage() {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const [items, setItems] = useState<MyItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="my-items">
      <h1>Mis objetos</h1>
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
                <Link
                  to={`/objetos/${item.id}/editar`}
                  className="button-secondary"
                  aria-label={`Editar ${item.title}`}
                >
                  Editar
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
