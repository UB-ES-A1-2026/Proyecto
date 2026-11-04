// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { ReservationCard } from '../components/ReservationCard';
import { ReservationDecision } from '../components/ReservationDecision';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import type { DecidedReservation } from '../services/reservationDecisionService';
import { getMyReservations, type MyReservations } from '../services/reservationService';

type ReservationSectionProps = {
  headingId: string;
  title: string;
  icon: IconName;
  count: number;
  emptyMessage: string;
  children: ReactNode;
};

// El contador va fuera del <h2> porque el título da nombre a la región.
function ReservationSection({
  headingId,
  title,
  icon,
  count,
  emptyMessage,
  children,
}: ReservationSectionProps) {
  return (
    <section aria-labelledby={headingId} role="region">
      <div className="reservation-section-header">
        <h2 id={headingId}>{title}</h2>
        <span className="reservation-section-count">{count}</span>
      </div>
      {count > 0 ? (
        <div className="reservation-list stagger">{children}</div>
      ) : (
        <div className="empty-state card manage-empty">
          <Icon name={icon} />
          <p>{emptyMessage}</p>
        </div>
      )}
    </section>
  );
}

export function MyReservationsPage() {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const [reservations, setReservations] = useState<MyReservations | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    getMyReservations(token)
      .then((data) => {
        if (!ignore) setReservations(data);
      })
      .catch((requestError: unknown) => {
        if (ignore) return;
        if (requestError instanceof ApiError && requestError.status === 401) {
          clearSession();
        } else if (requestError instanceof ApiError && requestError.status === 0) {
          setError(requestError.message);
        } else {
          setError('No hemos podido cargar tus solicitudes. Inténtalo de nuevo más tarde.');
        }
      });

    return () => {
      ignore = true;
    };
  }, [token, clearSession]);

  // Al responder a una solicitud, su tarjeta pasa al estado nuevo sin volver a pedir la lista.
  function handleDecided(updated: DecidedReservation) {
    setReservations(
      (current) =>
        current && {
          ...current,
          received: current.received.map((reservation) =>
            reservation.id === updated.id
              ? { ...reservation, status: updated.status }
              : reservation,
          ),
        },
    );
  }

  return (
    <section className="my-reservations">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mis solicitudes</h1>
          <p className="page-subtitle">
            Sigue las que has enviado y responde a las que has recibido.
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="form-error manage-notice">
          <Icon name="error" />
          {error}
        </p>
      ) : reservations ? (
        <div className="reservation-sections">
          <ReservationSection
            headingId="sent-reservations-heading"
            title="Enviadas"
            icon="arrow_forward"
            count={reservations.sent.length}
            emptyMessage="No tienes solicitudes abiertas"
          >
            {reservations.sent.map((reservation) => (
              <ReservationCard key={reservation.id} reservation={reservation} role="sent" />
            ))}
          </ReservationSection>
          <ReservationSection
            headingId="received-reservations-heading"
            title="Recibidas"
            icon="mail"
            count={reservations.received.length}
            emptyMessage="Todavía no has recibido solicitudes."
          >
            {reservations.received.map((reservation) => (
              <ReservationCard key={reservation.id} reservation={reservation} role="received">
                <ReservationDecision
                  reservationId={reservation.id}
                  status={reservation.status}
                  onDecided={handleDecided}
                />
              </ReservationCard>
            ))}
          </ReservationSection>
        </div>
      ) : (
        <>
          <p role="status" className="manage-visually-hidden">
            Cargando tus solicitudes…
          </p>
          <div className="reservation-sections" aria-hidden="true">
            {[0, 1].map((column) => (
              <div key={column} className="reservation-list">
                <div className="skeleton manage-skeleton-title" />
                {[0, 1, 2].map((placeholder) => (
                  <div key={placeholder} className="skeleton reservation-skeleton" />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
