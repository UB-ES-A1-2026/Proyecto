// Generado con asistencia de IA (Claude)
// Cálculos del calendario de fechas del alquiler. Las fechas son «AAAA-MM-DD» y los meses «AAAA-MM».
import { toUtcTime } from './rental';

export type DateRange = { startDate: string; endDate: string };

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKS_PER_GRID = 6;
const DAYS_PER_WEEK = 7;

export const WEEKDAYS = [
  { initial: 'L', name: 'lunes' },
  { initial: 'M', name: 'martes' },
  { initial: 'X', name: 'miércoles' },
  { initial: 'J', name: 'jueves' },
  { initial: 'V', name: 'viernes' },
  { initial: 'S', name: 'sábado' },
  { initial: 'D', name: 'domingo' },
];

function toIso(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function addDays(isoDate: string, days: number): string {
  return toIso(toUtcTime(isoDate) + days * MS_PER_DAY);
}

export function addMonths(month: string, months: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return monthOf(toIso(Date.UTC(year, monthNumber - 1 + months, 1)));
}

function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

// El mismo día en otro mes; si no existe (31 de febrero), el último día de ese mes.
export function addMonthsToDate(isoDate: string, months: number): string {
  const month = addMonths(monthOf(isoDate), months);
  const day = Math.min(Number(isoDate.slice(8)), daysInMonth(month));
  return `${month}-${String(day).padStart(2, '0')}`;
}

// Primer y último día de la semana (de lunes a domingo) de una fecha.
export function startOfWeek(isoDate: string): string {
  const mondayBasedDay = (new Date(toUtcTime(isoDate)).getUTCDay() + 6) % DAYS_PER_WEEK;
  return addDays(isoDate, -mondayBasedDay);
}

export function endOfWeek(isoDate: string): string {
  return addDays(startOfWeek(isoDate), DAYS_PER_WEEK - 1);
}

// Siempre 6 semanas, con null en los huecos: así el panel no cambia de alto al cambiar de mes.
export function monthWeeks(month: string): (string | null)[][] {
  const firstDay = `${month}-01`;
  const firstCell = startOfWeek(firstDay);
  return Array.from({ length: WEEKS_PER_GRID }, (_, week) =>
    Array.from({ length: DAYS_PER_WEEK }, (_, weekday) => {
      const date = addDays(firstCell, week * DAYS_PER_WEEK + weekday);
      return monthOf(date) === month ? date : null;
    }),
  );
}

// Regla de selección: el segundo clic cierra el rango si no es anterior al inicio; cualquier otro
// clic empieza uno nuevo. Si solo se ha escrito la fecha de fin, el clic pone el inicio.
export function selectRangeDate({ startDate, endDate }: DateRange, date: string): DateRange {
  if (startDate && !endDate && date >= startDate) return { startDate, endDate: date };
  if (!startDate && endDate && date <= endDate) return { startDate: date, endDate };
  return { startDate: date, endDate: '' };
}

const dayLabelFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const monthLabelFormatter = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

// «2030-03-10» → «10 de marzo de 2030».
export function formatDayLabel(isoDate: string): string {
  return dayLabelFormatter.format(new Date(toUtcTime(isoDate)));
}

// «2030-03» → «marzo de 2030».
export function formatMonthLabel(month: string): string {
  return monthLabelFormatter.format(new Date(toUtcTime(`${month}-01`)));
}

// Demanda de fechas (US-04.07, #312). Generado con asistencia de IA (Claude) – revisado por Marc
// Sanz, 13/11/2026.

// Nivel de demanda de un día según sus solicitudes pendientes (decisión 4 del equipo):
// 0 libre, 1–2 poca, 3–5 media y 6 o más mucha.
export type DemandLevel = 0 | 1 | 2 | 3;

export function demandLevel(pendingRequests: number): DemandLevel {
  if (pendingRequests >= 6) return 3;
  if (pendingRequests >= 3) return 2;
  if (pendingRequests >= 1) return 1;
  return 0;
}

export const DEMAND_LEVEL_LABELS: Record<DemandLevel, string> = {
  0: 'Libre',
  1: 'Poca demanda (1–2)',
  2: 'Demanda media (3–5)',
  3: 'Mucha demanda (6 o más)',
};

export const BOOKED_LABEL = 'Reservado';

// Primer y último día de un mes «AAAA-MM».
export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: addDays(`${addMonths(month, 1)}-01`, -1) };
}

// «6 solicitudes para este día», «1 solicitud para este día» o «Ninguna solicitud para este día».
export function formatDayDemand(pendingRequests: number): string {
  if (pendingRequests === 0) return 'Ninguna solicitud para este día';
  if (pendingRequests === 1) return '1 solicitud para este día';
  return `${pendingRequests} solicitudes para este día`;
}

// Aviso al elegir las fechas. Con 0 no se dice nada.
export function formatMatchingRequests(pendingRequests: number): string | null {
  if (pendingRequests <= 0) return null;
  if (pendingRequests === 1) {
    return 'Hay 1 solicitud que coincide con tus fechas. Es posible que no te acepten.';
  }
  return `Hay ${pendingRequests} solicitudes que coinciden con tus fechas. Es posible que no te acepten.`;
}
