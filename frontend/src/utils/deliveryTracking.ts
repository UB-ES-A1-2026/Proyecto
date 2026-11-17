// Generado con asistencia de IA (Claude)
import type {
  DeliveryStatus,
  DeliveryTracking,
  RiderStep,
  TrackingReservationStatus,
  TrackingStep,
} from '../services/deliveryTrackingService';

// Textos y lista de estados del seguimiento (US-05.02, #67), según el wireframe validado.

export const STEP_LABELS: Record<TrackingStep, string> = {
  pending: 'Pendiente de entrega',
  assigned: 'Asignada',
  picked_up: 'Recogida',
  on_the_way: 'En camino',
  delivered: 'Entregada',
  in_progress: 'En curso',
  finished: 'Finalizada',
};

// Con rider y sin rider asignado todavía.
const RIDER_PENDING_LABEL = 'Buscando rider';

export const RESERVATION_STATUS_LABELS: Record<TrackingReservationStatus, string> = {
  paid: 'Pagada',
  in_progress: 'En curso',
  finished: 'Finalizada',
};

export type StepState = 'done' | 'current' | 'todo';

export type StepView = { step: TrackingStep; label: string; state: StepState; at: string | null };

const RIDER_STEPS: TrackingStep[] = ['assigned', 'picked_up', 'on_the_way', 'delivered'];
const NO_RIDER_STEPS: TrackingStep[] = ['pending', 'delivered'];

export function isDelivered(tracking: DeliveryTracking): boolean {
  return tracking.deliveryStatus === 'delivered' || tracking.reservationStatus !== 'paid';
}

// Los estados en orden: los de la entrega y, cuando ya se ha entregado, los del alquiler. Los hechos
// van con ✔, el actual con ● y los que faltan con ○. «Finalizada» es el último: va con ✔.
export function buildSteps(tracking: DeliveryTracking): StepView[] {
  const delivered = isDelivered(tracking);
  let steps: TrackingStep[];
  if (tracking.mode === 'rider') {
    steps = tracking.deliveryStatus === 'pending' ? ['pending', ...RIDER_STEPS] : [...RIDER_STEPS];
  } else {
    // Una vez entregado, «Pendiente de entrega» ya no aporta nada (pantalla 6 del wireframe).
    steps = delivered ? ['delivered'] : [...NO_RIDER_STEPS];
  }
  if (delivered) steps.push('in_progress', 'finished');

  const current: TrackingStep =
    tracking.reservationStatus === 'paid' ? tracking.deliveryStatus : tracking.reservationStatus;
  const currentIndex = steps.indexOf(current);

  return steps.map((step, index) => {
    let state: StepState = 'todo';
    if (index < currentIndex) state = 'done';
    else if (index === currentIndex) state = step === 'finished' ? 'done' : 'current';
    const reached = tracking.history.filter((entry) => entry.status === step);
    return {
      step,
      label:
        step === 'pending' && tracking.mode === 'rider' ? RIDER_PENDING_LABEL : STEP_LABELS[step],
      state,
      at: state === 'todo' ? null : (reached[reached.length - 1]?.at ?? null),
    };
  });
}

// El rider solo puede marcar el estado siguiente: no se salta ni se vuelve atrás (criterio 1).
export function nextRiderStep(status: DeliveryStatus): RiderStep | null {
  if (status === 'assigned') return 'picked_up';
  if (status === 'picked_up') return 'on_the_way';
  if (status === 'on_the_way') return 'delivered';
  return null;
}

const stepTimeFormatter = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// «18/11/2026, 10:02», en la hora de quien lo mira.
export function formatStepTime(iso: string): string {
  return stepTimeFormatter.format(new Date(iso));
}

// «482193» → «482 193»: se lee mejor en voz alta al rider.
export function formatDeliveryCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

const dayFormatter = new Intl.DateTimeFormat('es-ES', { day: 'numeric', timeZone: 'UTC' });
const monthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' });
const yearFormatter = new Intl.DateTimeFormat('es-ES', { year: 'numeric', timeZone: 'UTC' });

function dateParts(isoDate: string) {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return {
    day: dayFormatter.format(date),
    month: monthFormatter.format(date).replace(/\.$/, ''),
    year: yearFormatter.format(date),
  };
}

// «18–20 nov. 2026», como en «Mis solicitudes».
export function formatDateRange(startDate: string, endDate: string): string {
  const start = dateParts(startDate);
  const end = dateParts(endDate);
  if (startDate.slice(0, 10) === endDate.slice(0, 10)) {
    return `${start.day} ${start.month}. ${start.year}`;
  }
  if (start.month === end.month && start.year === end.year) {
    return `${start.day}–${end.day} ${start.month}. ${start.year}`;
  }
  return `${start.day} ${start.month}. ${start.year}–${end.day} ${end.month}. ${end.year}`;
}

export function describeMode(tracking: Pick<DeliveryTracking, 'mode' | 'slot'>): string {
  if (tracking.mode === 'rider') {
    const when = tracking.slot ? `Franja ${tracking.slot.replace('-', '–')}` : 'Lo antes posible';
    return `Entrega por rider · ${when}`;
  }
  if (tracking.mode === 'home') return 'Recoger en casa del propietario';
  return 'Punto de recogida';
}
