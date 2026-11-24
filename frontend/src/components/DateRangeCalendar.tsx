// Generado con asistencia de IA (Claude)
// Demanda de fechas y días reservados (US-04.07, #312): generado con asistencia de IA (Claude) –
// revisado por Marc Sanz, 13/11/2026
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  addDays,
  addMonths,
  addMonthsToDate,
  BOOKED_LABEL,
  DEMAND_LEVEL_LABELS,
  demandLevel,
  endOfWeek,
  formatDayDemand,
  formatDayLabel,
  formatMonthLabel,
  monthOf,
  monthWeeks,
  startOfWeek,
  WEEKDAYS,
} from '../utils/calendar';
import { Icon } from './Icon';
import '../styles/calendar.css';

type DateRangeCalendarProps = {
  startDate: string;
  endDate: string;
  today: string;
  month: string;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
  // Demanda del mes visible (US-04.07). Sin ella, el calendario es el de US-04.01.
  demand?: CalendarDemand | null;
};

// Solicitudes pendientes de otras personas por día y días ya reservados.
export type CalendarDemand = { counts: Record<string, number>; booked: string[] };

const LEGEND_LEVELS = [0, 1, 2, 3] as const;

// Destino de cada tecla de navegación dentro de los días.
const KEY_TARGETS: Record<string, (date: string) => string> = {
  ArrowLeft: (date) => addDays(date, -1),
  ArrowRight: (date) => addDays(date, 1),
  ArrowUp: (date) => addDays(date, -7),
  ArrowDown: (date) => addDays(date, 7),
  Home: startOfWeek,
  End: endOfWeek,
  PageUp: (date) => addMonthsToDate(date, -1),
  PageDown: (date) => addMonthsToDate(date, 1),
};

// Calendario de rango, siempre visible en el panel de alquiler (US-04.01). No guarda las fechas:
// las recibe de los campos de texto, que son la única fuente, y avisa de cada clic.
export function DateRangeCalendar({
  startDate,
  endDate,
  today,
  month,
  onMonthChange,
  onSelectDate,
  demand = null,
}: DateRangeCalendarProps) {
  const monthLabelId = useId();
  const gridRef = useRef<HTMLTableElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef(false);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  // Día del que se enseña el número de solicitudes: el último que se ha señalado o tocado.
  const [inspectedDate, setInspectedDate] = useState<string | null>(null);
  const bookedDays = new Set(demand?.booked ?? []);
  const inspectedCount =
    demand && inspectedDate && monthOf(inspectedDate) === month && !bookedDays.has(inspectedDate)
      ? (demand.counts[inspectedDate] ?? 0)
      : null;
  // Dirección de la transición: al montar no hay, y al cambiar de mes se decide aquí mismo.
  const [transition, setTransition] = useState({ month, direction: 'none' });
  if (transition.month !== month) {
    setTransition({ month, direction: month > transition.month ? 'next' : 'previous' });
  }

  const firstMonth = monthOf(today);
  const rangeEnd = endDate || (startDate && previewDate ? previewDate : '');
  const hasRange = startDate !== '' && rangeEnd > startDate;
  // Solo un día del mes entra en el orden de tabulación: las flechas mueven el foco por el resto.
  const tabbableDate =
    [focusedDate, startDate, endDate, today].find(
      (date) => date && monthOf(date) === month && date >= today,
    ) ?? `${month}-01`;

  useEffect(() => {
    if (!pendingFocus.current || !focusedDate) return;
    pendingFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${focusedDate}"]`)?.focus();
  }, [focusedDate, month]);

  function handleDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const getTarget = KEY_TARGETS[event.key];
    if (!getTarget) return;
    event.preventDefault();
    const requested = getTarget(date);
    const target = requested < today ? today : requested;
    if (target === date) return;
    pendingFocus.current = true;
    setFocusedDate(target);
    if (monthOf(target) !== month) onMonthChange(monthOf(target));
  }

  function goToPreviousMonth() {
    const previousMonth = addMonths(month, -1);
    onMonthChange(previousMonth);
    // El botón se va a desactivar: el foco no se puede quedar en él.
    if (previousMonth <= firstMonth) nextButtonRef.current?.focus();
  }

  return (
    <div className="calendar" role="group" aria-label="Calendario">
      <div className="calendar-header">
        <button
          type="button"
          className="calendar-nav"
          aria-label="Mes anterior"
          disabled={month <= firstMonth}
          onClick={goToPreviousMonth}
        >
          <Icon name="chevron_left" />
        </button>
        <p id={monthLabelId} className="calendar-month" aria-live="polite">
          {formatMonthLabel(month)}
        </p>
        <button
          ref={nextButtonRef}
          type="button"
          className="calendar-nav"
          aria-label="Mes siguiente"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <Icon name="chevron_right" />
        </button>
      </div>
      <table
        ref={gridRef}
        role="grid"
        className="calendar-grid"
        aria-labelledby={monthLabelId}
        onMouseLeave={() => setPreviewDate(null)}
        onBlur={() => setPreviewDate(null)}
      >
        <thead>
          <tr>
            {WEEKDAYS.map(({ initial, name }) => (
              <th key={name} scope="col" aria-label={name}>
                {initial}
              </th>
            ))}
          </tr>
        </thead>
        <tbody key={month} className="calendar-weeks" data-direction={transition.direction}>
          {monthWeeks(month).map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((date, dayIndex) => {
                if (!date) return <td key={dayIndex} className="calendar-cell" />;
                const isStart = date === startDate;
                const isEnd = date === endDate;
                const isInsideRange = hasRange && date > startDate && date < rangeEnd;
                const isBooked = bookedDays.has(date);
                const pending = demand && !isBooked ? (demand.counts[date] ?? 0) : 0;
                const level = date >= today ? demandLevel(pending) : 0;
                const demandText = isBooked
                  ? `, ${BOOKED_LABEL}`
                  : level > 0
                    ? `, ${formatDayDemand(pending)}`
                    : '';
                const cellClasses = [
                  'calendar-cell',
                  isInsideRange && 'is-in-range',
                  hasRange && isStart && 'is-range-start',
                  hasRange && date === rangeEnd && 'is-range-end',
                ];
                const dayClasses = [
                  'calendar-day',
                  (isStart || isEnd) && 'is-selected',
                  date === today && 'is-today',
                  level > 0 && `has-demand-${level}`,
                  isBooked && 'is-booked',
                ];
                return (
                  <td key={date} className={cellClasses.filter(Boolean).join(' ')}>
                    <button
                      type="button"
                      className={dayClasses.filter(Boolean).join(' ')}
                      data-date={date}
                      aria-label={`${formatDayLabel(date)}${demandText}`}
                      aria-pressed={isStart || isEnd || (isInsideRange && date < endDate)}
                      aria-current={date === today ? 'date' : undefined}
                      disabled={date < today || isBooked}
                      tabIndex={date === tabbableDate ? 0 : -1}
                      onClick={() => {
                        setInspectedDate(date);
                        onSelectDate(date);
                      }}
                      onKeyDown={(event) => handleDayKeyDown(event, date)}
                      onMouseEnter={() => {
                        setPreviewDate(date);
                        setInspectedDate(date);
                      }}
                      onFocus={() => {
                        setFocusedDate(date);
                        setPreviewDate(date);
                        setInspectedDate(date);
                      }}
                    >
                      {Number(date.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {demand && (
        <>
          <p className="calendar-day-demand" aria-live="polite">
            {inspectedDate && inspectedCount !== null
              ? `${formatDayLabel(inspectedDate)}: ${formatDayDemand(inspectedCount)}`
              : ''}
          </p>
          <ul className="calendar-legend" aria-label="Leyenda de la demanda">
            {LEGEND_LEVELS.map((level) => (
              <li key={level}>
                <span className={`calendar-swatch has-demand-${level}`} aria-hidden="true" />
                {DEMAND_LEVEL_LABELS[level]}
              </li>
            ))}
            <li>
              <span className="calendar-swatch is-booked" aria-hidden="true" />
              {BOOKED_LABEL}
            </li>
          </ul>
        </>
      )}
    </div>
  );
}
