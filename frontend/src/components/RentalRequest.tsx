// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 03/11/2026
// Demanda de fechas en el calendario (US-04.07, #312): generado con asistencia de IA (Claude) –
// revisado por Marc Sanz, 13/11/2026
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getItemDemand } from '../services/demandService';
import { checkAvailability, requestRental, type Reservation } from '../services/rentalService';
import { formatMatchingRequests, monthBounds, monthOf, selectRangeDate } from '../utils/calendar';
import {
  calculateTotalPrice,
  countRentalDays,
  formatInputDate,
  formatLongDate,
  formatPrice,
  maskInputDate,
  parseInputDate,
  todayIso,
  validateInputDates,
  validateRentalDates,
  type RentalDateErrors,
} from '../utils/rental';
import { DateRangeCalendar, type CalendarDemand } from './DateRangeCalendar';
import { Icon } from './Icon';

export type RentalItem = {
  id: string;
  title: string;
  pricePerDay: number;
  photoUrl?: string;
};

type RentalRequestProps = {
  item: RentalItem;
  onRequested: (reservation: Reservation) => void;
  onSessionExpired: () => void;
};

// Mismo texto que el 409 de POST /reservas (#120).
const NOT_AVAILABLE_MESSAGE = 'El objeto no está disponible en esas fechas.';

// Resultado de la consulta de disponibilidad para unas fechas concretas («inicio|fin»): así se
// ignora el de unas fechas anteriores si el usuario las cambia mientras se espera la respuesta.
type AvailabilityResult = { datesKey: string } & ({ available: boolean } | { error: string });

// Demanda del mes visible (US-04.07) y número de solicitudes que coinciden con las fechas elegidas.
// Llevan la clave de lo que se pidió, igual que la disponibilidad.
type MonthDemandResult = { month: string } & ({ demand: CalendarDemand } | { failed: true });
type RangeDemandResult = { datesKey: string; pendingRequests: number };

const DEMAND_ERROR_MESSAGE = 'No se ha podido cargar la demanda de las fechas.';

// Selector de fechas, resumen y confirmación de US-04.01 (#121), dentro del panel lateral de la
// ficha del objeto (#15).
export function RentalRequest({ item, onRequested, onSessionExpired }: RentalRequestProps) {
  // Lo que hay escrito en los campos («dd/mm/aaaa»). El calendario escribe en ellos al hacer clic.
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [apiErrors, setApiErrors] = useState<RentalDateErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<'dates' | 'summary'>('dates');
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);
  const [monthDemand, setMonthDemand] = useState<MonthDemandResult | null>(null);
  const [rangeDemand, setRangeDemand] = useState<RangeDemandResult | null>(null);
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);

  const today = todayIso();
  const [calendarMonth, setCalendarMonth] = useState(monthOf(today));
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
  const currentMonthDemand = monthDemand?.month === calendarMonth ? monthDemand : null;
  const calendarDemand =
    currentMonthDemand && 'demand' in currentMonthDemand ? currentMonthDemand.demand : null;
  const matchingRequests =
    rangeDemand?.datesKey === datesKey ? formatMatchingRequests(rangeDemand.pendingRequests) : null;
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

  // US-04.07: la demanda del mes visible colorea el calendario. Si falla, se usa sin colores.
  useEffect(() => {
    if (!token) return;
    let ignore = false;
    const { from, to } = monthBounds(calendarMonth);

    getItemDemand(token, item.id, from, to)
      .then(({ days: demandDays, bookedDays }) => {
        if (ignore) return;
        const counts = Object.fromEntries(
          demandDays.map(({ date, pendingRequests }) => [date, pendingRequests]),
        );
        setMonthDemand({ month: calendarMonth, demand: { counts, booked: bookedDays } });
      })
      .catch((error: unknown) => {
        if (ignore) return;
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          onSessionExpired();
        } else {
          setMonthDemand({ month: calendarMonth, failed: true });
        }
      });

    return () => {
      ignore = true;
    };
  }, [calendarMonth, token, item.id, clearSession, onSessionExpired]);

  // US-04.07: con las dos fechas elegidas, cuántas solicitudes de otras personas coinciden.
  // Si falla, no se avisa de nada y se puede solicitar igual.
  useEffect(() => {
    if (!datesKey || !token) return;
    let ignore = false;

    getItemDemand(token, item.id, startDate, endDate)
      .then(({ pendingRequests }) => {
        if (!ignore) setRangeDemand({ datesKey, pendingRequests });
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [datesKey, token, item.id, startDate, endDate]);

  // El botón pulsado desaparece al cambiar de paso: el foco pasa al título del paso nuevo.
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  function clearErrors() {
    setApiErrors({});
    setFormError(null);
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
    // Un error de un envío anterior (p. ej. el 409 por solape) no se arrastra al resumen nuevo.
    setFormError(null);
    setStep('summary');
  }

  async function handleConfirm() {
    if (submitting || !session) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const reservation = await requestRental(session.token, {
        itemId: item.id,
        startDate,
        endDate,
      });
      onRequested(reservation);
    } catch (error) {
      // Los botones se reactivan siempre, también si el componente sigue montado tras un 401.
      setSubmitting(false);
      // Sesión caducada o revocada: se borra y se vuelve al login.
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        onSessionExpired();
        return;
      }
      // Errores de #120. Si el problema está en las fechas (409 por solape, con field), se vuelve
      // a elegirlas; si no (objeto propio, no publicado, solicitud duplicada…), se queda en el
      // resumen con el mensaje de la API.
      if (error instanceof ApiError && error.status === 409 && error.field && datesKey) {
        // Alguien ha ocupado las fechas después de consultarlas: ahora ya no están libres.
        setAvailability({ datesKey, available: false });
        setStep('dates');
      } else if (
        error instanceof ApiError &&
        (error.field === 'startDate' || error.field === 'endDate')
      ) {
        setApiErrors({ [error.field]: error.message });
        setStep('dates');
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError('Ha ocurrido un error inesperado.');
      }
    }
  }

  if (step === 'summary') {
    return (
      <section key="summary" className="rental-request" aria-labelledby="rental-title">
        <h2 id="rental-title" ref={headingRef} tabIndex={-1}>
          Revisa tu solicitud
        </h2>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        <div className="rental-item">
          {item.photoUrl && <img src={item.photoUrl} alt="" className="rental-item-photo" />}
          <div>
            <p className="rental-item-title">{item.title}</p>
            <p className="field-hint">{formatPrice(item.pricePerDay)} / día</p>
          </div>
        </div>
        <dl className="rental-summary">
          <dt>Desde</dt>
          <dd>{formatLongDate(startDate)}</dd>
          <dt>Hasta</dt>
          <dd>{formatLongDate(endDate)}</dd>
          <dt>Importe del alquiler ({days === 1 ? '1 día' : `${days} días`})</dt>
          <dd className="rental-total">{formatPrice(totalPrice)}</dd>
        </dl>
        <div className="rental-actions">
          <button
            type="button"
            className="button-secondary"
            disabled={submitting}
            onClick={() => {
              setFormError(null);
              setStep('dates');
            }}
          >
            Volver
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={submitting}
            onClick={handleConfirm}
          >
            {submitting ? 'Enviando…' : 'Confirmar'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section key="dates" className="rental-request" aria-labelledby="rental-title">
      <h2 id="rental-title" ref={headingRef} tabIndex={-1}>
        Elige las fechas
      </h2>
      {formError && (
        <p role="alert" className="form-error">
          {formError}
        </p>
      )}
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
          demand={calendarDemand}
        />
        {currentMonthDemand && 'failed' in currentMonthDemand && (
          <p className="field-hint rental-demand-error">{DEMAND_ERROR_MESSAGE}</p>
        )}
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
        {isAvailable && matchingRequests && (
          <p className="rental-demand-warning" role="status">
            <Icon name="info" size="1rem" />
            {matchingRequests}
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
