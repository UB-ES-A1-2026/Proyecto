// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { useEffect, useState, type ReactNode } from 'react';
import { CancelReservation } from '../components/CancelReservation';
import { useLocation, useNavigate } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { ReservationCard } from '../components/ReservationCard';
import { ReservationDecision } from '../components/ReservationDecision';
import { useAuth } from '../context/useAuth';
import { useWideLayout } from '../hooks/useWideLayout';
import { ApiError } from '../services/apiClient';
import type { DecidedReservation } from '../services/reservationDecisionService';
import {
  getMyReservations,
  type MyReservations,
  type Reservation,
} from '../services/reservationService';

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

// Lista y detalle (decisión de Kai, 20/11): las dos listas a la izquierda y la solicitud elegida,
// entera, a la derecha. Al entrar se elige la primera. Generado con asistencia de IA (Claude).
// El detalle lleva las mismas acciones que la tarjeta desplegable (aceptar, rechazar y cancelar).
function ReservationsMasterDetail({
  reservations,
  renderActions,
  justCancelledId,
  onSelect,
}: {
  reservations: MyReservations;
  renderActions: (reservation: Reservation, role: 'sent' | 'received') => ReactNode;
  justCancelledId: string | null;
  // Al elegir otra, la que se acaba de cancelar deja de llevarse el foco si se vuelve a ella.
  onSelect: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  function select(id: string) {
    setSelectedId(id);
    onSelect();
  }
  const entries = [
    ...reservations.sent.map((reservation) => ({ reservation, role: 'sent' as const })),
    ...reservations.received.map((reservation) => ({ reservation, role: 'received' as const })),
  ];
  const selected = entries.find((entry) => entry.reservation.id === selectedId) ?? entries[0];

  return (
    <div className="reservation-master-detail">
      <div className="reservation-master-list">
        <ReservationSection
          headingId="sent-reservations-heading"
          title="Enviadas"
          icon="arrow_forward"
          count={reservations.sent.length}
          emptyMessage="No tienes solicitudes abiertas"
        >
          {reservations.sent.map((reservation) => (
            <ReservationCard
              key={reservation.id}
              reservation={reservation}
              role="sent"
              view="row"
              selected={reservation.id === selected?.reservation.id}
              onSelect={() => select(reservation.id)}
            />
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
            <ReservationCard
              key={reservation.id}
              reservation={reservation}
              role="received"
              view="row"
              selected={reservation.id === selected?.reservation.id}
              onSelect={() => select(reservation.id)}
            />
          ))}
        </ReservationSection>
      </div>
      {selected && (
        <section className="reservation-detail-pane" aria-label="Solicitud elegida">
          <ReservationCard
            key={selected.reservation.id}
            reservation={selected.reservation}
            role={selected.role}
            view="detail"
            justCancelled={selected.reservation.id === justCancelledId}
          >
            {renderActions(selected.reservation, selected.role)}
          </ReservationCard>
        </section>
      )}
    </div>
  );
}

export function MyReservationsPage() {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const [reservations, setReservations] = useState<MyReservations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const wide = useWideLayout();
  // Aviso que deja otra pantalla al volver aquí, como «Solicitud enviada.» (US-07.01, #286).
  const [notice] = useState<string | null>(() => {
    const state: unknown = location.state;
    return typeof state === 'object' && state !== null && 'notice' in state
      ? String(state.notice)
      : null;
  });

  // Se borra del historial para que no vuelva a salir al recargar la página.
  useEffect(() => {
    if (notice) void navigate('.', { replace: true, state: null });
  }, [notice, navigate]);

  // La última que se ha cancelado aquí: su tarjeta lleva el foco al texto de la cancelación.
  const [justCancelledId, setJustCancelledId] = useState<string | null>(null);

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

  // Al cancelar (US-04.05, #309), la tarjeta pasa a «Cancelada» con la compensación, sin volver a
  // pedir la lista.
  function handleCancelled(updated: Reservation) {
    setJustCancelledId(updated.id);
    const replace = (list: Reservation[]) =>
      list.map((reservation) => (reservation.id === updated.id ? updated : reservation));
    setReservations(
      (current) => current && { sent: replace(current.sent), received: replace(current.received) },
    );
  }

  // Si falla, la tarjeta se queda como estaba: el aviso ya explica lo que ha pasado.
  function refreshReservations() {
    if (!token) return;
    getMyReservations(token)
      .then(setReservations)
      .catch(() => undefined);
  }

  // Las acciones de una solicitud, iguales en la tarjeta desplegable y en el detalle de la vista
  // ancha: aceptar y rechazar en las recibidas, y cancelar en las dos (US-04.05).
  function renderActions(reservation: Reservation, role: 'sent' | 'received') {
    return (
      <>
        {role === 'received' && (
          <ReservationDecision
            reservationId={reservation.id}
            status={reservation.status}
            onDecided={handleDecided}
            onOutdated={refreshReservations}
          />
        )}
        <CancelReservation
          reservation={reservation}
          role={role}
          onCancelled={handleCancelled}
          onOutdated={refreshReservations}
        />
      </>
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
      {notice && (
        <p role="status" className="form-success manage-notice">
          <Icon name="check_circle" />
          {notice}
        </p>
      )}
      {error ? (
        <p role="alert" className="form-error manage-notice">
          <Icon name="error" />
          {error}
        </p>
      ) : reservations && wide ? (
        <ReservationsMasterDetail
          reservations={reservations}
          renderActions={renderActions}
          justCancelledId={justCancelledId}
          onSelect={() => setJustCancelledId(null)}
        />
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
              <ReservationCard
                key={reservation.id}
                reservation={reservation}
                role="sent"
                justCancelled={reservation.id === justCancelledId}
              >
                {renderActions(reservation, 'sent')}
              </ReservationCard>
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
              <ReservationCard
                key={reservation.id}
                reservation={reservation}
                role="received"
                justCancelled={reservation.id === justCancelledId}
              >
                {renderActions(reservation, 'received')}
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
