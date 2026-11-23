// Generado con asistencia de IA (Claude)
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { RentalCheckout } from '../components/RentalCheckout';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getItemDetail, type ItemDetail } from '../services/itemService';
import { todayIso, validateRentalDates } from '../utils/rental';
import { deliverySelectionFrom, rentalDatesFrom, rentalDatesSearch } from '../utils/rentalDates';

type LoadState =
  | { requestKey: string; status: 'success'; item: ItemDetail }
  | { requestKey: string; status: 'not-found' }
  | { requestKey: string; status: 'error'; message: string };

// «Confirmar y pagar» (`/objetos/:id/solicitar?inicio=…&fin=…`, US-07.01): el resumen y el pago,
// en una página propia en lugar del panel de la ficha. Las fechas se eligen en la ficha.
export function ConfirmRentalPage() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const token = session?.token;
  const [result, setResult] = useState<LoadState | null>(null);
  const requestKey = JSON.stringify([id, token]);

  const dates = rentalDatesFrom(searchParams);
  // La entrega elegida en la ficha (US-05.01). Sin ella (enlace copiado, pestaña nueva) se vuelve a
  // elegir en la ficha.
  const delivery = deliverySelectionFrom(location.state);
  const datesValid =
    dates !== null &&
    Object.keys(validateRentalDates(dates.startDate, dates.endDate, todayIso())).length === 0;
  const itemPath = `/objetos/${encodeURIComponent(id)}`;
  // La ficha con las fechas elegidas: «Volver», «Cambiar» y «Elegir otras fechas».
  const datesPath = dates ? `${itemPath}?${rentalDatesSearch(dates)}` : itemPath;

  const goToLogin = useCallback(() => {
    void navigate('/login', { state: { from: `${location.pathname}${location.search}` } });
  }, [navigate, location.pathname, location.search]);

  useEffect(() => {
    if (!id || !datesValid) return;
    let ignore = false;

    getItemDetail(id, token)
      .then((item) => {
        if (!ignore) setResult({ requestKey, status: 'success', item });
      })
      .catch((requestError: unknown) => {
        if (ignore) return;
        if (requestError instanceof ApiError && requestError.status === 404) {
          setResult({ requestKey, status: 'not-found' });
        } else {
          setResult({
            requestKey,
            status: 'error',
            message:
              requestError instanceof ApiError && requestError.status === 0
                ? requestError.message
                : 'No hemos podido cargar el objeto. Inténtalo de nuevo más tarde.',
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [id, token, requestKey, datesValid]);

  // Sin fechas válidas (enlace incompleto o fechas que ya han pasado) se eligen en la ficha.
  if (!id || !datesValid || !dates) return <Navigate to={itemPath} replace />;
  if (!delivery) return <Navigate to={datesPath} replace />;

  const current = result?.requestKey === requestKey ? result : null;

  if (current?.status === 'not-found') return <Navigate to={itemPath} replace />;

  if (current?.status === 'error') {
    return (
      <section className="confirm-rental">
        <p role="alert" className="form-error">
          {current.message}
        </p>
      </section>
    );
  }

  if (!current) {
    return (
      <section className="confirm-rental" aria-busy="true">
        <p role="status" className="field-hint">
          Cargando el resumen…
        </p>
      </section>
    );
  }

  const { item } = current;
  // Un objeto propio o que ya no se puede alquilar: la ficha explica por qué.
  if (item.owner.id === session?.user.id || item.status !== 'published') {
    return <Navigate to={itemPath} replace />;
  }

  return (
    <section className="confirm-rental" aria-labelledby="confirm-rental-title">
      <Link to={datesPath} className="confirm-rental-back">
        <Icon name="chevron_left" size="1.25rem" />
        Volver a {item.title}
      </Link>
      <h1 id="confirm-rental-title" className="page-title">
        Confirmar y pagar
      </h1>
      <RentalCheckout
        item={{
          id: item.id,
          title: item.title,
          pricePerDay: Number(item.dailyPrice),
          photoUrl: item.photos[0]?.url,
          deposit: Number(item.deposit),
          ownerName: item.owner.username,
        }}
        startDate={dates.startDate}
        endDate={dates.endDate}
        datesPath={datesPath}
        delivery={delivery}
        // Pago al solicitar (US-07.01, #286): «Mis solicitudes» dice qué ha pasado con el dinero.
        onRequested={() =>
          void navigate('/mis-solicitudes', {
            state: {
              notice: `Solicitud enviada. Hemos bloqueado el importe hasta que ${item.owner.username} responda.`,
            },
          })
        }
        onSessionExpired={goToLogin}
      />
    </section>
  );
}
