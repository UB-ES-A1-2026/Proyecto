// Generado con asistencia de IA (Claude)
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  addDays,
  addMonths,
  addMonthsToDate,
  endOfWeek,
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
};

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
}: DateRangeCalendarProps) {
  const monthLabelId = useId();
  const gridRef = useRef<HTMLTableElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef(false);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
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
                ];
                return (
                  <td key={date} className={cellClasses.filter(Boolean).join(' ')}>
                    <button
                      type="button"
                      className={dayClasses.filter(Boolean).join(' ')}
                      data-date={date}
                      aria-label={formatDayLabel(date)}
                      aria-pressed={isStart || isEnd || (isInsideRange && date < endDate)}
                      aria-current={date === today ? 'date' : undefined}
                      disabled={date < today}
                      tabIndex={date === tabbableDate ? 0 : -1}
                      onClick={() => onSelectDate(date)}
                      onKeyDown={(event) => handleDayKeyDown(event, date)}
                      onMouseEnter={() => setPreviewDate(date)}
                      onFocus={() => {
                        setFocusedDate(date);
                        setPreviewDate(date);
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
    </div>
  );
}
