// Cálculos del alquiler (US-04.01, #121). Las fechas son cadenas «AAAA-MM-DD», como las da
// <input type="date"> y como las espera la API, así que no dependen de la zona horaria.

export type RentalDateErrors = Partial<Record<'startDate' | 'endDate', string>>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcTime(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

// Fecha de hoy en la zona horaria del usuario, en formato «AAAA-MM-DD».
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// Cuenta el primer y el último día: del 4 al 6 son 3 días. Pendiente de confirmar con #120.
export function countRentalDays(startDate: string, endDate: string): number {
  return Math.round((toUtcTime(endDate) - toUtcTime(startDate)) / MS_PER_DAY) + 1;
}

// Redondeado a céntimos para evitar errores de coma flotante (3 × 0,1 = 0,30000000000000004).
export function calculateTotalPrice(pricePerDay: number, days: number): number {
  return Math.round(pricePerDay * days * 100) / 100;
}

// Criterio 1 de US-04.01. Con alguna fecha vacía no hay error: solo falta completarla.
export function validateRentalDates(
  startDate: string,
  endDate: string,
  today: string,
): RentalDateErrors {
  const errors: RentalDateErrors = {};
  if (startDate && startDate < today) {
    errors.startDate = 'La fecha de inicio no puede ser anterior a hoy.';
  }
  if (startDate && endDate && endDate < startDate) {
    errors.endDate = 'La fecha de fin no puede ser anterior a la fecha de inicio.';
  }
  return errors;
}

const priceFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export function formatPrice(amount: number): string {
  return priceFormatter.format(amount);
}

const longDateFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

// «2026-11-04» → «miércoles, 4 de noviembre de 2026».
export function formatLongDate(isoDate: string): string {
  return longDateFormatter.format(new Date(toUtcTime(isoDate)));
}
