// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 03/11/2026
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { checkAvailability } from '../services/rentalService';
import { monthOf, selectRangeDate } from '../utils/calendar';
import {
  calculateTotalPrice,
  countRentalDays,
  formatInputDate,
  formatPrice,
  maskInputDate,
  parseInputDate,
  todayIso,
  validateInputDates,
  validateRentalDates,
  type RentalDateErrors,
} from '../utils/rental';
import { DateRangeCalendar } from './DateRangeCalendar';
import { Icon } from './Icon';

export type RentalItem = {
  id: string;
  title: string;
  pricePerDay: number;
  photoUrl?: string;
  // Pago al solicitar (US-07.01, #286).
  deposit?: number;
  ownerName?: string;
};

export type RentalDates = { startDate: string; endDate: string };

type RentalRequestProps = {
  item: RentalItem;
  // Las fechas con las que se vuelve de «Confirmar y pagar» (están en la dirección de la ficha).
  initialDates?: RentalDates;
  // Con las fechas libres, «Solicitar alquiler» lleva a la página «Confirmar y pagar».
  onContinue: (dates: RentalDates) => void;
  onSessionExpired: () => void;
};

// Mismo texto que el 409 de POST /reservas (#120).
const NOT_AVAILABLE_MESSAGE = 'El objeto no está disponible en esas fechas.';

// Resultado de la consulta de disponibilidad para unas fechas concretas («inicio|fin»): así se
// ignora el de unas fechas anteriores si el usuario las cambia mientras se espera la respuesta.
type AvailabilityResult = { datesKey: string } & ({ available: boolean } | { error: string });

// Selector de fechas de US-04.01 (#121), dentro del panel lateral de la ficha del objeto (#15). El
// resumen y el pago están en su propia página, «Confirmar y pagar» (US-07.01).
export function RentalRequest({
  item,
  initialDates,
  onContinue,
  onSessionExpired,
}: RentalRequestProps) {
  // Lo que hay escrito en los campos («dd/mm/aaaa»). El calendario escribe en ellos al hacer clic.
  const [startText, setStartText] = useState(() =>
    initialDates ? formatInputDate(initialDates.startDate) : '',
  );
  const [endText, setEndText] = useState(() =>
    initialDates ? formatInputDate(initialDates.endDate) : '',
  );
  const [apiErrors, setApiErrors] = useState<RentalDateErrors>({});
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);
  const { session, clearSession } = useAuth();
  const token = session?.token;

  const today = todayIso();
  const [calendarMonth, setCalendarMonth] = useState(() =>
    monthOf(initialDates && initialDates.startDate >= today ? initialDates.startDate : today),
  );

  const startDate = parseInputDate(startText);
  const endDate = parseInputDate(endText);
  const errors = {
    ...validateRentalDates(startDate, endDate, today),
    ...validateInputDates(startText, endText),
    ...apiErrors,
  };
  const datesValid = startDate !== '' && endDate !== '' && !errors.startDate && !errors.endDate;
  const days = datesValid ? countRentalDays(startDate, endDate) : 0;
  const totalPrice = calculateTotalPrice(item.pricePerDay, days);
  const datesKey = datesValid ? `${startDate}|${endDate}` : null;
  const currentAvailability = availability?.datesKey === datesKey ? availability : null;
  const checkingAvailability = datesKey !== null && currentAvailability === null;
  const isAvailable =
    currentAvailability !== null &&
    'available' in currentAvailability &&
    currentAvailability.available;

  // Criterio 3 de US-04.01: con las dos fechas válidas se pregunta si están libres (#204), y solo
  // entonces se puede pulsar «Solicitar alquiler».
  useEffect(() => {
    if (!datesKey || !token) return;
    let ignore = false;

    checkAvailability(token, { itemId: item.id, startDate, endDate })
      .then(({ available }) => {
        if (!ignore) setAvailability({ datesKey, available });
      })
      .catch((error: unknown) => {
        if (ignore) return;
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          onSessionExpired();
        } else if (
          error instanceof ApiError &&
          (error.field === 'startDate' || error.field === 'endDate')
        ) {
          setApiErrors({ [error.field]: error.message });
        } else {
          setAvailability({
            datesKey,
            error: error instanceof ApiError ? error.message : 'Ha ocurrido un error inesperado.',
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [datesKey, token, item.id, startDate, endDate, clearSession, onSessionExpired]);

  function clearErrors() {
    setApiErrors({});
  }

  function changeDateText(setText: (text: string) => void, rawText: string) {
    const text = maskInputDate(rawText);
    setText(text);
    clearErrors();
    // Una fecha escrita se enseña en el calendario; las pasadas no, porque no se pueden elegir.
    const date = parseInputDate(text);
    if (date >= today) setCalendarMonth(monthOf(date));
  }

  // Al salir del campo, «1/3/2030» pasa a «01/03/2030».
  function normalizeDateText(setText: (text: string) => void, text: string) {
    const date = parseInputDate(text);
    if (date) setText(formatInputDate(date));
  }

  function handleSelectDate(date: string) {
    // Una fecha de inicio con error no cuenta: el clic empieza de nuevo.
    const range = selectRangeDate({ startDate: errors.startDate ? '' : startDate, endDate }, date);
    setStartText(formatInputDate(range.startDate));
    setEndText(formatInputDate(range.endDate));
    clearErrors();
  }

  function handleDatesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAvailable) return;
    onContinue({ startDate, endDate });
  }

  return (
    <section className="rental-request" aria-labelledby="rental-title">
      <h2 id="rental-title">Elige las fechas</h2>
      <form onSubmit={handleDatesSubmit} noValidate>
        <div className="rental-dates">
          <div className="form-field">
            <label htmlFor="rental-start-date">Fecha de inicio</label>
            <input
              id="rental-start-date"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd/mm/aaaa"
              value={startText}
              onChange={(event) => changeDateText(setStartText, event.target.value)}
              onBlur={() => normalizeDateText(setStartText, startText)}
              aria-invalid={errors.startDate ? true : undefined}
              aria-describedby={errors.startDate ? 'rental-start-date-error' : undefined}
            />
            {errors.startDate && (
              <p id="rental-start-date-error" className="field-error">
                {errors.startDate}
              </p>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="rental-end-date">Fecha de fin</label>
            <input
              id="rental-end-date"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd/mm/aaaa"
              value={endText}
              onChange={(event) => changeDateText(setEndText, event.target.value)}
              onBlur={() => normalizeDateText(setEndText, endText)}
              aria-invalid={errors.endDate ? true : undefined}
              aria-describedby={errors.endDate ? 'rental-end-date-error' : undefined}
            />
            {errors.endDate && (
              <p id="rental-end-date-error" className="field-error">
                {errors.endDate}
              </p>
            )}
          </div>
        </div>
        <DateRangeCalendar
          startDate={startDate}
          endDate={endDate}
          today={today}
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
          onSelectDate={handleSelectDate}
        />
        <p className="rental-price" aria-live="polite">
          {datesValid ? (
            <>
              {days === 1 ? '1 día' : `${days} días`} × {formatPrice(item.pricePerDay)} ={' '}
              <strong>{formatPrice(totalPrice)}</strong>
            </>
          ) : (
            'Elige las fechas para ver el precio.'
          )}
        </p>
        {checkingAvailability && (
          <p className="rental-price rental-checking field-hint">
            <Icon name="hourglass_top" size="1rem" />
            Comprobando disponibilidad…
          </p>
        )}
        {isAvailable && (
          <p className="rental-available" role="status">
            <Icon name="check_circle" size="1rem" />
            Fechas disponibles
          </p>
        )}
        {currentAvailability &&
          ('error' in currentAvailability || !currentAvailability.available) && (
            <p role="alert" className="form-error">
              {'error' in currentAvailability ? currentAvailability.error : NOT_AVAILABLE_MESSAGE}
            </p>
          )}
        <div className="rental-actions">
          <button type="submit" className="button-primary" disabled={!isAvailable}>
            Solicitar alquiler
          </button>
        </div>
      </form>
    </section>
  );
}
