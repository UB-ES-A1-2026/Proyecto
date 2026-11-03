// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { useEffect, useState } from 'react';
import { ReservationCard } from '../components/ReservationCard';
import { ReservationDecision } from '../components/ReservationDecision';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import type { DecidedReservation } from '../services/reservationDecisionService';
import { getMyReservations, type MyReservations } from '../services/reservationService';

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
      <h1>Mis solicitudes</h1>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : reservations ? (
        <>
          <section aria-labelledby="sent-reservations-heading" role="region">
            <h2 id="sent-reservations-heading">Enviadas</h2>
            {reservations.sent.length > 0 ? (
              <div className="reservation-list">
                {reservations.sent.map((reservation) => (
                  <ReservationCard key={reservation.id} reservation={reservation} role="sent" />
                ))}
              </div>
            ) : (
              <p>No tienes solicitudes abiertas</p>
            )}
          </section>
          <section aria-labelledby="received-reservations-heading" role="region">
            <h2 id="received-reservations-heading">Recibidas</h2>
            {reservations.received.length > 0 ? (
              <div className="reservation-list">
                {reservations.received.map((reservation) => (
                  <ReservationCard key={reservation.id} reservation={reservation} role="received">
                    <ReservationDecision
                      reservationId={reservation.id}
                      status={reservation.status}
                      onDecided={handleDecided}
                    />
                  </ReservationCard>
                ))}
              </div>
            ) : (
              <p>Todavía no has recibido solicitudes.</p>
            )}
          </section>
        </>
      ) : (
        <p role="status">Cargando tus solicitudes…</p>
      )}
    </section>
  );
}
