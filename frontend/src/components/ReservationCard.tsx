// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Reservation, ReservationStatus } from '../services/reservationService';
import { Icon, type IconName } from './Icon';

const shortDateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const longDateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });
// Plazo para responder a una solicitud: «15 de noviembre a las 10:30». La fecha y la hora se
// formatean por separado porque, juntas, cada versión de ICU las une de una forma.
const deadlineDateFormatter = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' });
const deadlineTimeFormatter = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
});

function formatDeadline(date: string): string {
  const deadline = new Date(date);
  return `${deadlineDateFormatter.format(deadline)} a las ${deadlineTimeFormatter.format(deadline)}`;
}
const priceFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

const statusLabels: Record<ReservationStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
  expired: 'Caducada',
  paid: 'Pagada',
  in_progress: 'En curso',
  finished: 'Finalizada',
};

type StatusStyle = { badge: string; icon: IconName };

const statusStyles: Record<ReservationStatus, StatusStyle> = {
  pending: { badge: 'badge-warning', icon: 'hourglass_top' },
  accepted: { badge: 'badge-success', icon: 'check_circle' },
  rejected: { badge: 'badge-error', icon: 'cancel' },
  cancelled: { badge: 'badge-neutral', icon: 'do_not_disturb_on' },
  expired: { badge: 'badge-neutral', icon: 'schedule' },
  paid: { badge: 'badge-success', icon: 'payments' },
  in_progress: { badge: 'badge-success', icon: 'swap_horiz' },
  finished: { badge: 'badge-neutral', icon: 'task_alt' },
};

const UNKNOWN_STATUS_STYLE: StatusStyle = { badge: 'badge-neutral', icon: 'info' };

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatShortDate(date: string): string {
  const parts = shortDateFormatter.formatToParts(parseLocalDate(date));
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value.replace(/\.$/, '') ?? '';
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  return `${day} ${month}. ${year}`;
}

function formatShortDateRange(startDate: string, endDate: string): string {
  if (startDate.slice(0, 10) === endDate.slice(0, 10)) return formatShortDate(startDate);

  const start = shortDateFormatter.formatToParts(parseLocalDate(startDate));
  const end = shortDateFormatter.formatToParts(parseLocalDate(endDate));
  const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const sameMonthAndYear =
    getPart(start, 'month') === getPart(end, 'month') &&
    getPart(start, 'year') === getPart(end, 'year');

  if (sameMonthAndYear) {
    const month = getPart(start, 'month').replace(/\.$/, '');
    return `${getPart(start, 'day')}–${getPart(end, 'day')} ${month}. ${getPart(start, 'year')}`;
  }
  return `${formatShortDate(startDate)}–${formatShortDate(endDate)}`;
}

function formatLongDate(date: string): string {
  return longDateFormatter.format(parseLocalDate(date));
}

function ReservationFact({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <p className="reservation-fact">
      <Icon name={icon} />
      <span>{children}</span>
    </p>
  );
}

export function ReservationCard({
  reservation,
  role,
  children,
}: {
  reservation: Reservation;
  role: 'sent' | 'received';
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const status =
    statusLabels[reservation.status as ReservationStatus] ?? String(reservation.status);
  const statusStyle = statusStyles[reservation.status as ReservationStatus] ?? UNKNOWN_STATUS_STYLE;
  const requester = role === 'sent' ? reservation.owner.username : reservation.renter.username;
  const requesterLabel = role === 'sent' ? 'Propietario' : 'Solicitada por';

  return (
    <article className="reservation-card card">
      {/* El botón se lee «<objeto> · <fechas> · <estado>»: los puntos solo son para el lector. */}
      <button
        type="button"
        className="reservation-card-toggle"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((isExpanded) => !isExpanded)}
      >
        <span className="reservation-card-summary">
          <span className="reservation-card-title">{reservation.item.title}</span>{' '}
          <span className="manage-visually-hidden">·</span>{' '}
          <span className="reservation-card-dates">
            {formatShortDateRange(reservation.startDate, reservation.endDate)}
          </span>
        </span>{' '}
        <span className="manage-visually-hidden">·</span>{' '}
        <span
          key={reservation.status}
          className={`badge ${statusStyle.badge} reservation-card-status`}
        >
          {status}
        </span>
        <span className="reservation-card-chevron">
          <Icon name="keyboard_arrow_down" />
        </span>
      </button>
      <div id={detailId} className="reservation-card-detail" hidden={!expanded}>
        <div className="reservation-card-clip">
          <div className="reservation-card-body">
            <div className="reservation-facts">
              <ReservationFact icon="inventory_2">
                Objeto: <Link to={`/objetos/${reservation.item.id}`}>{reservation.item.title}</Link>
              </ReservationFact>
              <ReservationFact icon="event">
                {reservation.startDate === reservation.endDate
                  ? `Fecha: ${formatLongDate(reservation.startDate)}`
                  : `Fechas: Del ${formatLongDate(reservation.startDate)} al ${formatLongDate(reservation.endDate)}`}
              </ReservationFact>
              <ReservationFact icon="payments">
                Importe total: {priceFormatter.format(Number(reservation.totalPrice))}
              </ReservationFact>
              <ReservationFact icon={statusStyle.icon}>Estado: {status}</ReservationFact>
              <ReservationFact icon="person">
                {requesterLabel}: {requester}
              </ReservationFact>
              <ReservationFact icon="schedule">
                Enviada el {longDateFormatter.format(new Date(reservation.createdAt))}
              </ReservationFact>
            </div>
            {/* Pago al solicitar (US-07.01, #286): mientras espera respuesta, el importe está
                bloqueado en la tarjeta de quien la pidió y se cobra si el propietario acepta. Solo
                con plazo (expiresAt): las pendientes del flujo anterior no tienen nada bloqueado. */}
            {reservation.status === 'pending' && reservation.expiresAt && (
              <p className="reservation-payment-note">
                <Icon name="lock" size="1.125rem" />
                <span>
                  {role === 'sent'
                    ? `Hemos bloqueado ${priceFormatter.format(Number(reservation.totalPrice))} en tu tarjeta. Se cobran si ${reservation.owner.username} acepta; si no, se liberan.`
                    : `Si la aceptas, se cobran ${priceFormatter.format(Number(reservation.totalPrice))} al momento; si la rechazas, se liberan.`}
                  {role === 'sent'
                    ? ` Tiene hasta el ${formatDeadline(reservation.expiresAt)} para responder.`
                    : ` Responde antes del ${formatDeadline(reservation.expiresAt)}: si no, caduca.`}
                </span>
              </p>
            )}
            {reservation.status === 'expired' && (
              <p className="reservation-payment-note">
                <Icon name="schedule" size="1.125rem" />
                <span>
                  {role === 'sent'
                    ? `${reservation.owner.username} no respondió a tiempo. Hemos liberado el importe bloqueado.`
                    : 'No respondiste a tiempo y la solicitud ha caducado.'}
                </span>
              </p>
            )}
            {reservation.status === 'cancelled' && reservation.cancellation && (
              <p className="reservation-cancellation">
                <Icon name="do_not_disturb_on" size="1.125rem" />
                <span>{cancellationText(reservation, role)}</span>
              </p>
            )}
            {children}
          </div>
        </div>
      </div>
    </article>
  );
}

// Quién canceló, cuándo, la compensación por las molestias y lo devuelto (US-04.05, #309), según
// quién lo mira.
function cancellationText(reservation: Reservation, role: 'sent' | 'received'): string {
  const cancellation = reservation.cancellation;
  if (!cancellation) return '';
  const date = longDateFormatter.format(new Date(cancellation.at));
  const byRenter = cancellation.by.id === reservation.renter.id;
  const byMe = (role === 'sent') === byRenter;
  const compensation = Number(cancellation.penaltyAmount);
  const refund = Number(cancellation.refundAmount);
  const compensationText = `${priceFormatter.format(compensation)} (${cancellation.penaltyPercent} %)`;
  const who = byMe
    ? `La cancelaste tú el ${date}.`
    : `La canceló ${cancellation.by.username} el ${date}.`;

  // Gratis: solo quién y cuándo (y lo devuelto, si había pago).
  if (compensation === 0) {
    const refundText =
      refund > 0 && role === 'sent' ? ` Te hemos devuelto ${priceFormatter.format(refund)}.` : '';
    return `${who}${refundText}`;
  }
  if (byRenter) {
    return role === 'sent'
      ? `${who} Compensación a ${reservation.owner.username} por las molestias: ${compensationText}. Te hemos devuelto ${priceFormatter.format(refund)}.`
      : `${who} Recibes ${compensationText} como compensación por las molestias.`;
  }
  return role === 'sent'
    ? `${who} Te hemos devuelto todo lo que pagaste (${priceFormatter.format(refund)}) y recibes ${compensationText} como compensación por las molestias.`
    : `${who} Compensación a ${reservation.renter.username} por las molestias: ${compensationText}. A ${reservation.renter.username} se le ha devuelto todo (${priceFormatter.format(refund)}).`;
}
