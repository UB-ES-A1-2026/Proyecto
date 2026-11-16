// Generado con asistencia de IA (Claude)
import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import {
  cancelReservation,
  getCancellationPreview,
  type CancellationPreview,
  type Reservation,
} from '../services/reservationService';
import { Icon } from './Icon';
import { Modal } from './Modal';

const priceFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const dayFormatter = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' });

// Texto de la historia (#64) cuando falla el reembolso: la reserva no cambia.
const CANCEL_FAILED = 'No se ha podido cancelar. Inténtalo de nuevo.';

type Role = 'sent' | 'received';

// Estados en los que se puede cancelar (US-04.05). Una pendiente recibida no: el propietario la
// rechaza con «Rechazar».
function canCancel(reservation: Reservation, role: Role): boolean {
  if (reservation.status === 'pending') return role === 'sent';
  return reservation.status === 'accepted' || reservation.status === 'paid';
}

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatAmount(amount: string): string {
  return priceFormatter.format(Number(amount));
}

function daysText(days: number): string {
  if (days <= 0) return 'Empieza hoy';
  return days === 1 ? 'Falta 1 día para el inicio' : `Faltan ${days} días para el inicio`;
}

// Lo que cuesta cancelar hoy, como en el wireframe (pantallas 2, 3 y 4).
function PreviewText({
  preview,
  reservation,
  role,
}: {
  preview: CancellationPreview;
  reservation: Reservation;
  role: Role;
}) {
  const other = role === 'sent' ? reservation.owner.username : reservation.renter.username;

  if (preview.free) {
    return (
      <p className="cancel-summary">
        <Icon name="check_circle" size="1.125rem" />
        <span>
          {preview.releasesHold
            ? `Cancelar ahora es gratis: ${reservation.owner.username} todavía no la ha aceptado. Liberamos los ${formatAmount(reservation.totalPrice)} bloqueados en tu tarjeta.`
            : 'Cancelar ahora es gratis: todavía no se ha pagado.'}
        </span>
      </p>
    );
  }

  return (
    <>
      <p className="cancel-summary is-penalty">
        <Icon name="warning" size="1.125rem" />
        <span>
          {preview.penaltyPercent > 0 ? (
            <>
              {daysText(preview.daysUntilStart)}: pagarás el{' '}
              <strong>{preview.penaltyPercent} %</strong> del alquiler (
              <strong>{formatAmount(preview.penaltyAmount)}</strong>) a {other}.
            </>
          ) : (
            `${daysText(preview.daysUntilStart)}: cancelar no tiene penalización.`
          )}
        </span>
      </p>
      <p className="cancel-refund">
        {role === 'sent'
          ? `Te devolvemos ${formatAmount(preview.refundAmount)}. La fianza se libera entera.`
          : `A ${other} se le devuelve todo lo que pagó (${formatAmount(preview.refundAmount)}) y se libera su fianza.`}
      </p>
      <p className="field-hint">Menos de 3 días: 100 % · de 3 a 7: 35 % · 8 o más: nada.</p>
    </>
  );
}

type CancelReservationProps = {
  reservation: Reservation;
  role: Role;
  onCancelled: (updated: Reservation) => void;
  // Otra persona ya la canceló o empezó: hay que volver a pedir su estado.
  onOutdated?: () => void;
};

// «Cancelar reserva» con la penalización (US-04.05, #309), dentro de la tarjeta de «Mis solicitudes».
export function CancelReservation({
  reservation,
  role,
  onCancelled,
  onOutdated,
}: CancelReservationProps) {
  const { session, clearSession } = useAuth();
  const [open, setOpen] = useState(false);

  if (!session || !canCancel(reservation, role)) return null;

  const isRequest = reservation.status === 'pending';
  const label = isRequest ? 'Cancelar solicitud' : 'Cancelar reserva';

  return (
    <div className="cancel-reservation">
      <button type="button" className="button-secondary" onClick={() => setOpen(true)}>
        <Icon name="do_not_disturb_on" />
        {label}
      </button>
      {open && (
        <CancelDialog
          token={session.token}
          reservation={reservation}
          role={role}
          label={label}
          onClose={() => setOpen(false)}
          onCancelled={(updated) => {
            setOpen(false);
            onCancelled(updated);
          }}
          onOutdated={onOutdated}
          onSessionExpired={clearSession}
        />
      )}
    </div>
  );
}

function CancelDialog({
  token,
  reservation,
  role,
  label,
  onClose,
  onCancelled,
  onOutdated,
  onSessionExpired,
}: {
  token: string;
  reservation: Reservation;
  role: Role;
  label: string;
  onClose: () => void;
  onCancelled: (updated: Reservation) => void;
  onOutdated?: () => void;
  onSessionExpired: () => void;
}) {
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ya no se puede cancelar: se explica y no se deja confirmar.
  const [blocked, setBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;
    getCancellationPreview(token, reservation.id)
      .then((data) => {
        if (!ignore) setPreview(data);
      })
      .catch((requestError: unknown) => {
        if (ignore) return;
        if (requestError instanceof ApiError && requestError.status === 401) {
          onSessionExpired();
          return;
        }
        setError(requestError instanceof ApiError ? requestError.message : CANCEL_FAILED);
        setBlocked(
          requestError instanceof ApiError && [403, 404, 409].includes(requestError.status),
        );
      });
    return () => {
      ignore = true;
    };
  }, [token, reservation.id, onSessionExpired]);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      onCancelled(await cancelReservation(token, reservation.id));
    } catch (requestError: unknown) {
      setSubmitting(false);
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired();
        return;
      }
      if (requestError instanceof ApiError && [403, 404, 409].includes(requestError.status)) {
        setError(requestError.message);
        setBlocked(true);
        onOutdated?.();
        return;
      }
      // Falló el reembolso (502) u otro error: la reserva no cambia y se puede reintentar. Sin
      // conexión, el aviso de siempre.
      const offline = requestError instanceof ApiError && requestError.status === 0;
      setError(offline ? requestError.message : CANCEL_FAILED);
    }
  }

  const start = dayFormatter.format(parseLocalDate(reservation.startDate));
  const end = dayFormatter.format(parseLocalDate(reservation.endDate));

  return (
    <Modal title={`¿${label}?`} onClose={onClose}>
      <p className="cancel-item">
        <strong>{reservation.item.title}</strong> ·{' '}
        {reservation.startDate === reservation.endDate ? start : `del ${start} al ${end}`}
      </p>
      {preview ? (
        <PreviewText preview={preview} reservation={reservation} role={role} />
      ) : (
        !error && (
          <p role="status" className="field-hint">
            Calculando lo que cuesta cancelar…
          </p>
        )
      )}
      {error && (
        <p role="alert" className="form-error cancel-error">
          <Icon name="error" size="1.125rem" />
          {error}
        </p>
      )}
      <div className="form-actions cancel-actions">
        <button type="button" className="button-secondary" disabled={submitting} onClick={onClose}>
          Volver
        </button>
        {!blocked && (
          <button
            type="button"
            className="button-primary"
            disabled={submitting || !preview}
            onClick={() => void confirm()}
          >
            {submitting ? 'Cancelando…' : label}
          </button>
        )}
      </div>
    </Modal>
  );
}
