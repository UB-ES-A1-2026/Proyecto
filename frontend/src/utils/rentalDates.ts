// Generado con asistencia de IA (Claude)
import type { RentalDates } from '../components/RentalRequest';
import type { DeliveryDraft, DeliverySelection } from './delivery';

// Las fechas elegidas viajan en la dirección (`?inicio=2026-12-05&fin=2026-12-06`) entre la ficha y
// la página «Confirmar y pagar» (US-07.01): recargar o volver atrás no las pierde.

function isIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

// Las fechas de la dirección, o null si falta alguna o no es una fecha real.
export function rentalDatesFrom(params: URLSearchParams): RentalDates | null {
  const startDate = params.get('inicio');
  const endDate = params.get('fin');
  return isIsoDate(startDate) && isIsoDate(endDate) ? { startDate, endDate } : null;
}

export function rentalDatesSearch({ startDate, endDate }: RentalDates): string {
  return new URLSearchParams({ inicio: startDate, fin: endDate }).toString();
}

// La entrega elegida (US-05.01) viaja en el estado del historial entre la ficha y «Confirmar y
// pagar»: lleva la dirección de entrega de quien alquila, que no debe ir en la dirección web.
export function deliverySelectionFrom(state: unknown): DeliverySelection | null {
  if (typeof state !== 'object' || state === null || !('delivery' in state)) return null;
  const { delivery } = state as { delivery: unknown };
  if (typeof delivery !== 'object' || delivery === null || !('mode' in delivery)) return null;
  const { mode } = delivery as { mode: unknown };
  return mode === 'home' || mode === 'rider' || mode === 'pickup_point'
    ? (delivery as DeliverySelection)
    : null;
}

export function deliveryDraftFrom(state: unknown): DeliveryDraft | undefined {
  if (typeof state !== 'object' || state === null || !('deliveryDraft' in state)) return undefined;
  const { deliveryDraft } = state as { deliveryDraft: unknown };
  return typeof deliveryDraft === 'object' && deliveryDraft !== null
    ? (deliveryDraft as DeliveryDraft)
    : undefined;
}
