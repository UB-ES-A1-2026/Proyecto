// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DELIVERY_MODE_LABELS,
  formatSlot,
  type ReservationDelivery,
} from '../services/deliveryService';
import type { Reservation, ReservationStatus } from '../services/reservationService';
import { Icon, type IconName } from './Icon';

const shortDateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const longDateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });
const priceFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

const statusLabels: Record<ReservationStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
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

// Desglose del importe (decisión de Marc, 12/11, US-05.01): alquiler, entrega si la hay, y total.
// totalPrice es solo el alquiler; la tarifa del rider llega en delivery.fee.
function formatAmounts(reservation: Reservation): string {
  const rental = Number(reservation.totalPrice);
  const fee = reservation.delivery?.fee ? Number(reservation.delivery.fee) : 0;
  const parts = [`Alquiler: ${priceFormatter.format(rental)}`];
  if (fee > 0) parts.push(`Entrega: ${priceFormatter.format(fee)}`);
  parts.push(`Total: ${priceFormatter.format(rental + fee)}`);
  return parts.join(' · ');
}

// Modo de entrega y destino de una solicitud (US-05.01, #282). Las direcciones solo llegan a
// quien puede verlas (reglas del backend), así que aquí se enseña lo que venga.
function DeliveryFacts({
  delivery,
  status,
  role,
}: {
  delivery: ReservationDelivery;
  status: ReservationStatus;
  role: 'sent' | 'received';
}) {
  if (delivery.mode === 'rider') {
    const fee = delivery.fee ? ` · ${priceFormatter.format(Number(delivery.fee))}` : '';
    return (
      <>
        <ReservationFact icon="pedal_bike">
          {DELIVERY_MODE_LABELS.rider} · {formatSlot(delivery.slot)}
          {fee}
        </ReservationFact>
        {delivery.deliveryAddress ? (
          <ReservationFact icon="pin_drop">
            A: {delivery.deliveryAddress}
            {delivery.deliveryNeighborhood ? ` (${delivery.deliveryNeighborhood})` : ''}
          </ReservationFact>
        ) : (
          delivery.deliveryNeighborhood && (
            <ReservationFact icon="pin_drop">
              Barrio de entrega: {delivery.deliveryNeighborhood}
            </ReservationFact>
          )
        )}
      </>
    );
  }

  if (delivery.mode === 'pickup_point') {
    return (
      <ReservationFact icon="pin_drop">
        {DELIVERY_MODE_LABELS.pickup_point}
        {delivery.pickupPoint
          ? `: ${delivery.pickupPoint.name} · ${delivery.pickupPoint.address}`
          : ''}
      </ReservationFact>
    );
  }

  // Recogida en casa: el arrendatario ve la dirección cuando la aceptan; mientras está pendiente,
  // el aviso. El propietario ya sabe dónde vive.
  let detail = '';
  if (delivery.ownerAddress) detail = ` · ${delivery.ownerAddress}`;
  else if (role === 'sent' && status === 'pending') {
    detail = ' · La dirección se mostrará cuando acepten la solicitud.';
  }
  return (
    <ReservationFact icon="home">
      {DELIVERY_MODE_LABELS.home}
      {detail}
    </ReservationFact>
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
              <ReservationFact icon="payments">{formatAmounts(reservation)}</ReservationFact>
              <ReservationFact icon={statusStyle.icon}>Estado: {status}</ReservationFact>
              <ReservationFact icon="person">
                {requesterLabel}: {requester}
              </ReservationFact>
              {reservation.delivery && (
                <DeliveryFacts
                  delivery={reservation.delivery}
                  status={reservation.status}
                  role={role}
                />
              )}
              <ReservationFact icon="schedule">
                Enviada el {longDateFormatter.format(new Date(reservation.createdAt))}
              </ReservationFact>
            </div>
            {children}
          </div>
        </div>
      </div>
    </article>
  );
}
