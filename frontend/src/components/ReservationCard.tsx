// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DELIVERY_MODE_LABELS,
  formatSlot,
  type ReservationDelivery,
} from '../services/deliveryService';
import type { Rating, Reservation, ReservationStatus } from '../services/reservationService';
import { Icon, type IconName } from './Icon';
import { StarsDisplay } from './StarRating';

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

// «Ver entrega» (US-05.02): solo con el alquiler pagado, en curso o finalizado.
const TRACKABLE_STATUSES: ReservationStatus[] = ['paid', 'in_progress', 'finished'];

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
function deliveryFee(reservation: Reservation): number {
  return reservation.delivery?.fee ? Number(reservation.delivery.fee) : 0;
}

// Lo que se bloquea al solicitar y se cobra al aceptar: alquiler + tarifa del rider (US-07.01 con
// US-05.01, bug #372). Es el «Total» del desglose.
function chargedTotal(reservation: Reservation): number {
  return Number(reservation.totalPrice) + deliveryFee(reservation);
}

function formatAmounts(reservation: Reservation): string {
  const rental = Number(reservation.totalPrice);
  const fee = deliveryFee(reservation);
  const parts = [`Alquiler: ${priceFormatter.format(rental)}`];
  if (fee > 0) parts.push(`Entrega: ${priceFormatter.format(fee)}`);
  parts.push(`Total: ${priceFormatter.format(chargedTotal(reservation))}`);
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

function RatingSummary({ title, rating }: { title: string; rating: Rating }) {
  return (
    <div className="reservation-rating-summary">
      <p className="reservation-rating-title">{title}</p>
      <StarsDisplay score={rating.score} />
      {rating.comment && <p className="reservation-rating-comment">«{rating.comment}»</p>}
    </div>
  );
}

// Objeto, fechas y estado: la cabecera de la tarjeta, la fila de la lista y el título del detalle.
function ReservationSummary({
  reservation,
  status,
  badge,
}: {
  reservation: Reservation;
  status: string;
  badge: string;
}) {
  return (
    <>
      <span className="reservation-card-summary">
        <span className="reservation-card-title">{reservation.item.title}</span>{' '}
        <span className="manage-visually-hidden">·</span>{' '}
        <span className="reservation-card-dates">
          {formatShortDateRange(reservation.startDate, reservation.endDate)}
        </span>
      </span>{' '}
      <span className="manage-visually-hidden">·</span>{' '}
      <span key={reservation.status} className={`badge ${badge} reservation-card-status`}>
        {status}
      </span>
    </>
  );
}

export function ReservationCard({
  reservation,
  role,
  children,
  justCancelled = false,
  view = 'toggle',
  selected = false,
  onSelect,
}: {
  reservation: Reservation;
  role: 'sent' | 'received';
  children?: ReactNode;
  // Se acaba de cancelar desde esta tarjeta: el botón que abrió la ventana ya no está, así que el
  // foco va al texto de la cancelación (US-04.05, #309).
  justCancelled?: boolean;
  // Lista y detalle (decisión de Kai, 20/11): «toggle» despliega el detalle en la tarjeta, como
  // siempre; «row» es una fila de la lista que elige la reserva; «detail» la enseña entera.
  view?: 'toggle' | 'row' | 'detail';
  selected?: boolean;
  onSelect?: () => void;
}) {
  const [expandedState, setExpanded] = useState(false);
  const expanded = view === 'detail' || (view === 'toggle' && expandedState);
  const cancellationRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (justCancelled) cancellationRef.current?.focus();
  }, [justCancelled]);
  const detailId = useId();
  const status =
    statusLabels[reservation.status as ReservationStatus] ?? String(reservation.status);
  const statusStyle = statusStyles[reservation.status as ReservationStatus] ?? UNKNOWN_STATUS_STYLE;
  const requester = role === 'sent' ? reservation.owner.username : reservation.renter.username;
  const requesterLabel = role === 'sent' ? 'Propietario' : 'Solicitada por';

  return (
    <article className={`reservation-card card${selected ? ' is-selected' : ''}`}>
      {view === 'detail' ? (
        <div className="reservation-card-toggle reservation-card-heading">
          <ReservationSummary reservation={reservation} status={status} badge={statusStyle.badge} />
        </div>
      ) : (
        // El botón se lee «<objeto> · <fechas> · <estado>»: los puntos solo son para el lector.
        <button
          type="button"
          className="reservation-card-toggle"
          aria-expanded={view === 'toggle' ? expanded : undefined}
          aria-controls={view === 'toggle' ? detailId : undefined}
          aria-pressed={view === 'row' ? selected : undefined}
          onClick={() => (view === 'row' ? onSelect?.() : setExpanded((isExpanded) => !isExpanded))}
        >
          <ReservationSummary reservation={reservation} status={status} badge={statusStyle.badge} />
          <span className="reservation-card-chevron">
            <Icon name="keyboard_arrow_down" />
          </span>
        </button>
      )}
      {view !== 'row' && (
        <div id={detailId} className="reservation-card-detail" hidden={!expanded}>
          <div className="reservation-card-clip">
            <div className="reservation-card-body">
              <div className="reservation-facts">
                <ReservationFact icon="inventory_2">
                  Objeto:{' '}
                  <Link to={`/objetos/${reservation.item.id}`}>{reservation.item.title}</Link>
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
              {/* Pago al solicitar (US-07.01, #286): mientras espera respuesta, el importe está
                bloqueado en la tarjeta de quien la pidió y se cobra si el propietario acepta. Solo
                con plazo (expiresAt): las pendientes del flujo anterior no tienen nada bloqueado. */}
              {reservation.status === 'pending' && reservation.expiresAt && (
                <p className="reservation-payment-note">
                  <Icon name="lock" size="1.125rem" />
                  <span>
                    {role === 'sent'
                      ? `Hemos bloqueado ${priceFormatter.format(chargedTotal(reservation))} en tu tarjeta. Se cobran si ${reservation.owner.username} acepta; si no, se liberan.`
                      : `Si la aceptas, se cobran ${priceFormatter.format(chargedTotal(reservation))} al momento; si la rechazas, se liberan.`}
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
              {TRACKABLE_STATUSES.includes(reservation.status) && (
                <Link
                  to={`/entregas/${reservation.id}`}
                  className="button-secondary reservation-track"
                >
                  <Icon name="pin_drop" />
                  Ver entrega
                </Link>
              )}
              {/* Valorar al terminar: quien la pidió valora el alquiler (US-08.01, #296) y el
                  propietario, al inquilino (US-08.02, #299). Una vez valorado, se ve la valoración en
                  lugar de «Valorar». */}
              {reservation.status === 'finished' && (
                <div className="reservation-rating">
                  {reservation.myRating ? (
                    <RatingSummary title="Tu valoración" rating={reservation.myRating} />
                  ) : (
                    <Link
                      to={`/mis-solicitudes/${encodeURIComponent(reservation.id)}/valorar`}
                      className="button-primary"
                      aria-label={
                        role === 'sent'
                          ? `Valorar el alquiler de ${reservation.item.title}`
                          : `Valorar a ${reservation.renter.username} por el alquiler de ${reservation.item.title}`
                      }
                    >
                      <Icon name="star" />
                      {role === 'sent' ? 'Valorar' : `Valorar a ${reservation.renter.username}`}
                    </Link>
                  )}
                  {/* US-08.02: el inquilino ve la que le ha puesto el propietario. */}
                  {role === 'sent' && reservation.receivedRating && (
                    <RatingSummary
                      title="Valoración recibida"
                      rating={reservation.receivedRating}
                    />
                  )}
                </div>
              )}
              {reservation.status === 'cancelled' && reservation.cancellation && (
                <p
                  ref={cancellationRef}
                  role="status"
                  tabIndex={-1}
                  className="reservation-cancellation"
                >
                  <Icon name="do_not_disturb_on" size="1.125rem" />
                  <span>{cancellationText(reservation, role)}</span>
                </p>
              )}
              {children}
            </div>
          </div>
        </div>
      )}
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
  // Si cancela el propietario, la compensación solo queda registrada a su cargo: en este sprint no
  // se cobra ni se paga (#64). Por eso ninguna de las dos tarjetas dice «recibes» (20/11).
  const registered = `La compensación por las molestias, ${compensationText}, queda registrada a cargo de`;
  return role === 'sent'
    ? `${who} Te hemos devuelto todo lo que pagaste (${priceFormatter.format(refund)}). ${registered} ${reservation.owner.username}; de momento no se cobra.`
    : `${who} A ${reservation.renter.username} se le ha devuelto todo (${priceFormatter.format(refund)}). La compensación por las molestias, ${compensationText}, queda registrada a tu cargo; de momento no se cobra.`;
}
