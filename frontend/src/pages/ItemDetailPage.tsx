// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { RentalRequest } from '../components/RentalRequest';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getItemDetail, type ItemDetail } from '../services/itemService';
import { formatPrice } from '../utils/rental';

type ItemDetailState =
  | { requestKey: string; status: 'success'; item: ItemDetail }
  | { requestKey: string; status: 'not-found' }
  | { requestKey: string; status: 'error'; message: string };

const AVAILABILITY: Record<ItemDetail['status'], { label: string; badge: string; icon: IconName }> =
  {
    published: { label: 'Disponible', badge: 'badge-success', icon: 'check_circle' },
    paused: {
      label: 'Pausado: no aparece en las búsquedas',
      badge: 'badge-warning',
      icon: 'pause',
    },
    withdrawn: { label: 'Retirado', badge: 'badge-neutral', icon: 'do_not_disturb_on' },
  };

const DELIVERY_METHODS = [
  { field: 'homeDelivery', label: 'Entrega a domicilio', icon: 'home' },
  { field: 'riderDelivery', label: 'Entrega con rider', icon: 'pedal_bike' },
  { field: 'pickupPointDelivery', label: 'Punto de recogida', icon: 'pin_drop' },
] as const;

// Las fotos están apiladas para fundirse al cambiar; solo la activa se anuncia como imagen.
function ItemGallery({ title, photos }: Pick<ItemDetail, 'title' | 'photos'>) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="item-gallery-empty">
        <Icon name="image" size="3rem" />
        <p>Este objeto no tiene fotos.</p>
      </div>
    );
  }

  return (
    <>
      <div className="item-gallery-main">
        {photos.map((photo, index) => (
          <img
            key={photo.id}
            className="item-gallery-photo"
            data-active={index === activeIndex}
            src={photo.url}
            alt={index === activeIndex ? `Foto ${index + 1} de ${title}` : ''}
          />
        ))}
      </div>
      {photos.length > 1 && (
        <ul className="item-gallery-thumbs">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button
                type="button"
                className="item-gallery-thumb"
                aria-label={`Ver foto ${index + 1}`}
                aria-pressed={index === activeIndex}
                onClick={() => setActiveIndex(index)}
              >
                <img src={photo.url} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Lo que se puede hacer en el panel según quién mira el anuncio (US-03.03 y US-04.01).
function RentalAction({ item }: { item: ItemDetail }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const itemPath = `/objetos/${encodeURIComponent(item.id)}`;

  const goToLogin = useCallback(() => {
    navigate('/login', { state: { from: itemPath } });
  }, [navigate, itemPath]);

  if (session?.user.id === item.owner.id) {
    return (
      <p className="rental-panel-note">
        <Icon name="info" />
        Este anuncio es tuyo.
      </p>
    );
  }

  // El backend solo enseña estos objetos a su propietario y también rechaza la solicitud (404).
  if (item.status !== 'published') {
    return (
      <p className="rental-panel-note">
        <Icon name="do_not_disturb_on" />
        Este objeto no se puede alquilar ahora.
      </p>
    );
  }

  if (!session) {
    return (
      <>
        <button type="button" className="button-primary" onClick={goToLogin}>
          Alquilar
        </button>
        <p className="field-hint rental-panel-hint">Inicia sesión para elegir las fechas.</p>
      </>
    );
  }

  return (
    <RentalRequest
      key={item.id}
      item={{
        id: item.id,
        title: item.title,
        pricePerDay: Number(item.dailyPrice),
        photoUrl: item.photos[0]?.url,
      }}
      onRequested={() => navigate('/mis-solicitudes')}
      onSessionExpired={goToLogin}
    />
  );
}

function ItemDetailSkeleton() {
  return (
    <div className="item-detail" role="status">
      <span className="item-visually-hidden">Cargando el objeto…</span>
      <div className="item-heading">
        <div className="skeleton item-skeleton-title" />
        <div className="skeleton item-skeleton-line" />
      </div>
      <div className="item-gallery">
        <div className="skeleton item-skeleton-gallery" />
      </div>
      <div className="card rental-panel">
        <div className="skeleton item-skeleton-title" />
        <div className="skeleton item-skeleton-line" />
        <div className="skeleton item-skeleton-button" />
      </div>
      <div className="item-info">
        <div>
          <div className="skeleton item-skeleton-line" />
          <div className="skeleton item-skeleton-line" />
          <div className="skeleton item-skeleton-line" />
        </div>
      </div>
    </div>
  );
}

export function ItemDetailPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const token = session?.token;
  const [result, setResult] = useState<ItemDetailState | null>(null);
  const requestKey = JSON.stringify([id, token]);

  useEffect(() => {
    let ignore = false;

    if (!id) return;

    getItemDetail(id, token)
      .then((data) => {
        if (!ignore) setResult({ requestKey, status: 'success', item: data });
      })
      .catch((requestError: unknown) => {
        if (ignore) return;
        if (requestError instanceof ApiError && requestError.status === 404) {
          setResult({ requestKey, status: 'not-found' });
        } else if (requestError instanceof ApiError && requestError.status === 0) {
          setResult({ requestKey, status: 'error', message: requestError.message });
        } else {
          setResult({
            requestKey,
            status: 'error',
            message: 'No hemos podido cargar el objeto. Inténtalo de nuevo más tarde.',
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [id, requestKey, token]);

  const currentResult = result?.requestKey === requestKey ? result : null;

  if (!id || currentResult?.status === 'not-found') {
    return (
      <section className="item-not-found empty-state">
        <Icon name="search_off" />
        <h1>No hemos encontrado este objeto</h1>
        <p>Puede que se haya retirado o que el enlace no sea correcto.</p>
        <Link to="/" className="button-secondary">
          Volver al inicio
        </Link>
      </section>
    );
  }

  if (!currentResult) {
    return <ItemDetailSkeleton />;
  }

  if (currentResult.status === 'error') {
    return (
      <p role="alert" className="form-error">
        {currentResult.message}
      </p>
    );
  }

  const { item } = currentResult;
  const availability = AVAILABILITY[item.status];
  const deliveryMethods = DELIVERY_METHODS.filter(({ field }) => item[field]);

  return (
    <article className="item-detail stagger">
      <header className="item-heading">
        <h1>{item.title}</h1>
        <div className="item-tags">
          <span className="item-neighborhood">
            <Icon name="location_on" />
            {item.neighborhood}
          </span>
          <span className="badge badge-neutral">
            <Icon name="category" />
            {item.category.name}
          </span>
        </div>
      </header>

      <div className="item-gallery">
        <ItemGallery key={item.id} title={item.title} photos={item.photos} />
      </div>

      <aside className="card rental-panel" aria-label="Alquiler de este objeto">
        <div className="rental-panel-summary">
          <p className="rental-panel-price">
            <span className="rental-panel-amount">{formatPrice(Number(item.dailyPrice))}</span> /
            día
          </p>
          <span className={`badge ${availability.badge} item-availability`}>
            <Icon name={availability.icon} />
            {availability.label}
          </span>
        </div>
        <p className="rental-panel-deposit">
          <Icon name="shield" />
          {Number(item.deposit) === 0
            ? 'Sin fianza'
            : `Fianza: ${formatPrice(Number(item.deposit))}`}
        </p>
        <div className="rental-panel-action">
          <RentalAction item={item} />
        </div>
      </aside>

      <div className="item-info">
        <section className="item-section">
          <h2>Descripción</h2>
          <p className="item-description">{item.description}</p>
        </section>

        <section className="item-section">
          <h2>Formas de entrega</h2>
          <ul className="item-delivery">
            {deliveryMethods.length > 0 ? (
              deliveryMethods.map((method) => (
                <li key={method.field}>
                  <Icon name={method.icon} />
                  <span>{method.label}</span>
                </li>
              ))
            ) : (
              <li>
                <Icon name="handshake" />
                <span>a convenir con el propietario</span>
              </li>
            )}
          </ul>
        </section>

        <section className="card item-owner" aria-label="Propietario">
          <span className="item-owner-avatar" aria-hidden="true">
            {item.owner.username.charAt(0).toUpperCase()}
          </span>
          <p>Publicado por {item.owner.username}</p>
        </section>
      </div>
    </article>
  );
}
