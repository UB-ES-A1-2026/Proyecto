// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 03/11/2026
// Cálculos del alquiler (US-04.01, #121). Las fechas son cadenas «AAAA-MM-DD», como las espera la
// API, así que no dependen de la zona horaria. Los campos de texto usan «dd/mm/aaaa».

export type RentalDateErrors = Partial<Record<'startDate' | 'endDate', string>>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COMPLETE_INPUT_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const INVALID_DATE_MESSAGE = 'Esa fecha no existe.';

export function toUtcTime(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

// Fecha de hoy en España, en formato «AAAA-MM-DD»: la misma referencia que usa el backend.
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Cuenta el primer y el último día: del 4 al 6 son 3 días, igual que el backend (#120).
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

// «2030-03-10» → «10/03/2030». Sin fecha, texto vacío.
export function formatInputDate(isoDate: string): string {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

// «10/03/2030» → «2030-03-10». Texto vacío si la fecha está a medias o no existe (31/02/2030).
export function parseInputDate(text: string): string {
  const match = COMPLETE_INPUT_DATE.exec(text);
  if (!match) return '';
  const [day, month, year] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const exists =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return exists ? date.toISOString().slice(0, 10) : '';
}

// Solo se valida la fecha completa: mientras se escribe no hay error.
export function validateInputDates(startText: string, endText: string): RentalDateErrors {
  const errors: RentalDateErrors = {};
  if (COMPLETE_INPUT_DATE.test(startText) && !parseInputDate(startText)) {
    errors.startDate = INVALID_DATE_MESSAGE;
  }
  if (COMPLETE_INPUT_DATE.test(endText) && !parseInputDate(endText)) {
    errors.endDate = INVALID_DATE_MESSAGE;
  }
  return errors;
}

// Da forma al texto mientras se escribe, para no tener que teclear las barras (en el teclado
// numérico del móvil a veces no están): «10032030» → «10/03/2030». Borrar sigue funcionando.
export function maskInputDate(rawText: string): string {
  const parts = [''];
  for (const character of rawText) {
    const current = parts[parts.length - 1];
    if (/[/.\-\s]/.test(character)) {
      if (current && parts.length < 3) parts.push('');
    } else if (/\d/.test(character)) {
      if (parts.length < 3 && current.length === 2) parts.push(character);
      else if (current.length < 4) parts[parts.length - 1] = current + character;
    }
  }
  return parts.join('/');
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
