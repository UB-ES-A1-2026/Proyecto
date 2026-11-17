// Generado con asistencia de IA (Claude)
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { daysUntil } from '../utils/rental';
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
const PREVIEW_FAILED = 'No hemos podido calcular lo que cuesta cancelar. Inténtalo de nuevo.';

type Role = 'sent' | 'received';

// Estados en los que se puede cancelar (US-04.05). Una pendiente recibida no: el propietario la
// rechaza con «Rechazar». Una que ya ha empezado tampoco; si empieza hoy, sí (al 100 %).
function canCancel(reservation: Reservation, role: Role): boolean {
  if (daysUntil(reservation.startDate) < 0) return false;
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

// Lo que supone cancelar hoy, como en el wireframe (pantallas 2 y 3). Lo que se paga a la otra
// persona se presenta como una compensación por las molestias. Si es gratis no se dice nada: la
// ventana es solo el aviso de cancelar.
function PreviewText({
  preview,
  reservation,
  role,
}: {
  preview: CancellationPreview;
  reservation: Reservation;
  role: Role;
}) {
  if (preview.free) return null;

  const other = role === 'sent' ? reservation.owner.username : reservation.renter.username;
  const refund =
    role === 'sent'
      ? preview.penaltyPercent > 0
        ? `Te devolvemos ${formatAmount(preview.refundAmount)}. Recuperas la fianza entera.`
        : `Te devolvemos todo lo que pagaste (${formatAmount(preview.refundAmount)}). Recuperas la fianza entera.`
      : `A ${other} se le devuelve todo lo que pagó (${formatAmount(preview.refundAmount)}) y recupera su fianza.`;

  return (
    <>
      {preview.penaltyPercent > 0 && (
        <p className="cancel-summary">
          <Icon name="warning" size="1.125rem" />
          <span>
            {daysText(preview.daysUntilStart)}: compensarás a {other} con el{' '}
            <strong>{preview.penaltyPercent} %</strong> del alquiler (
            <strong>{formatAmount(preview.penaltyAmount)}</strong>) por las molestias.
          </span>
        </p>
      )}
      <p className="cancel-refund">{refund}</p>
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
  // Título del wireframe (pantallas 2 a 4).
  const title = isRequest ? '¿Cancelar la solicitud?' : '¿Cancelar la reserva?';

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
          title={title}
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
  title,
  onClose,
  onCancelled,
  onOutdated,
  onSessionExpired,
}: {
  token: string;
  reservation: Reservation;
  role: Role;
  label: string;
  title: string;
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
  // Si la vista previa falla por un error pasajero (500, sin conexión) se puede volver a pedir.
  const [attempt, setAttempt] = useState(0);
  const [previewFailed, setPreviewFailed] = useState(false);
  // La lista se vuelve a pedir con la versión más reciente del aviso, sin repetir la petición.
  const onOutdatedRef = useRef(onOutdated);
  useEffect(() => {
    onOutdatedRef.current = onOutdated;
  });

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
        // Ya no se puede cancelar (otra persona la canceló o empezó): se explica y se actualiza
        // la tarjeta. Con otro error, se puede reintentar.
        if (requestError instanceof ApiError && [403, 404, 409].includes(requestError.status)) {
          setError(requestError.message);
          setBlocked(true);
          onOutdatedRef.current?.();
          return;
        }
        const offline = requestError instanceof ApiError && requestError.status === 0;
        setError(offline ? requestError.message : PREVIEW_FAILED);
        setPreviewFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [token, reservation.id, onSessionExpired, attempt]);

  function retryPreview() {
    setError(null);
    setPreviewFailed(false);
    setAttempt((current) => current + 1);
  }

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
    <Modal title={title} onClose={onClose} closeDisabled={submitting}>
      <p className="cancel-item">
        <strong>{reservation.item.title}</strong> ·{' '}
        {reservation.startDate === reservation.endDate ? start : `del ${start} al ${end}`}
        {role === 'received' && ` · solicitada por ${reservation.renter.username}`}
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
        {previewFailed ? (
          <button type="button" className="button-primary" onClick={retryPreview}>
            Reintentar
          </button>
        ) : (
          !blocked && (
            <button
              type="button"
              className="button-primary"
              disabled={submitting || !preview}
              onClick={() => void confirm()}
            >
              {submitting ? 'Cancelando…' : label}
            </button>
          )
        )}
      </div>
    </Modal>
  );
}
