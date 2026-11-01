// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Reservation, ReservationStatus } from '../services/reservationService';

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

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
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
  const requester = role === 'sent' ? reservation.owner.username : reservation.renter.username;
  const requesterLabel = role === 'sent' ? 'Propietario' : 'Solicitada por';

  return (
    <article className="reservation-card">
      <button
        type="button"
        className="reservation-card-toggle"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((isExpanded) => !isExpanded)}
      >
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span> {reservation.item.title} ·{' '}
        {formatShortDateRange(reservation.startDate, reservation.endDate)} · {status}
      </button>
      <div id={detailId} className="reservation-card-detail" hidden={!expanded}>
        <p>
          Objeto: <Link to={`/objetos/${reservation.item.id}`}>{reservation.item.title}</Link>
        </p>
        <p>
          Fechas: Del {formatLongDate(reservation.startDate)} al{' '}
          {formatLongDate(reservation.endDate)}
        </p>
        <p>Importe total: {priceFormatter.format(Number(reservation.totalPrice))}</p>
        <p>Estado: {status}</p>
        <p>
          {requesterLabel}: {requester}
        </p>
        <p>Enviada el {longDateFormatter.format(new Date(reservation.createdAt))}</p>
        {children}
      </div>
    </article>
  );
}
