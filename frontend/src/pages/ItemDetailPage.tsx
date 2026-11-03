// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getItemDetail, type ItemDetail } from '../services/itemService';

const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

type ItemDetailState =
  | { requestKey: string; status: 'success'; item: ItemDetail }
  | { requestKey: string; status: 'not-found' }
  | { requestKey: string; status: 'error'; message: string };

export function ItemDetailPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const token = session?.token;
  const navigate = useNavigate();
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

  function handleRent() {
    if (!id) return;
    if (!session) {
      navigate('/login', { state: { from: `/objetos/${id}` } });
      return;
    }
    if (item && session.user.id !== item.owner.id) {
      navigate(`/objetos/${id}/solicitar`);
    }
  }

  const currentResult = result?.requestKey === requestKey ? result : null;

  if (!id || currentResult?.status === 'not-found') {
    return (
      <section className="item-not-found">
        <h1>No hemos encontrado este objeto</h1>
        <p>Puede que se haya retirado o que el enlace no sea correcto.</p>
        <Link to="/">Volver al inicio</Link>
      </section>
    );
  }

  if (!currentResult) {
    return <p role="status">Cargando el objeto…</p>;
  }

  if (currentResult.status === 'error') {
    return (
      <p role="alert" className="form-error">
        {currentResult.message}
      </p>
    );
  }

  const { item } = currentResult;

  const deliveryMethods = [
    item.homeDelivery ? 'Entrega a domicilio' : null,
    item.riderDelivery ? 'Entrega con rider' : null,
    item.pickupPointDelivery ? 'Punto de recogida' : null,
  ].filter((method): method is string => method !== null);
  const isOwner = session?.user.id === item.owner.id;
  const availability = {
    published: 'Disponible',
    paused: 'Pausado: no aparece en las búsquedas',
    withdrawn: 'Retirado',
  }[item.status];

  return (
    <article className="item-detail">
      <h1>{item.title}</h1>
      {item.photos.length > 0 ? (
        <ul className="item-photos">
          {item.photos.map((photo, index) => (
            <li key={photo.id}>
              <img src={photo.url} alt={`Foto ${index + 1} de ${item.title}`} />
            </li>
          ))}
        </ul>
      ) : (
        <p>Este objeto no tiene fotos.</p>
      )}
      <div className="item-prices">
        <p>{currencyFormatter.format(Number(item.dailyPrice))} / día</p>
        <p>
          {Number(item.deposit) === 0
            ? 'Sin fianza'
            : `Fianza: ${currencyFormatter.format(Number(item.deposit))}`}
        </p>
      </div>
      <p className="item-availability">{availability}</p>
      <p>{item.description}</p>
      <dl className="item-metadata">
        <dt>Categoría</dt>
        <dd>{item.category.name}</dd>
        <dt>Barrio</dt>
        <dd>{item.neighborhood}</dd>
        <dt>Formas de entrega</dt>
        <dd>
          {deliveryMethods.length > 0
            ? deliveryMethods.join(' · ')
            : 'a convenir con el propietario'}
        </dd>
      </dl>
      <p>Publicado por {item.owner.username}</p>
      {isOwner ? (
        <p>Este anuncio es tuyo.</p>
      ) : (
        <button type="button" className="button-primary item-rent-button" onClick={handleRent}>
          Alquilar
        </button>
      )}
    </article>
  );
}
