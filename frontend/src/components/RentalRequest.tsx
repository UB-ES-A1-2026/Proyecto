// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 03/11/2026
// Demanda de fechas en el calendario (US-04.07, #312): generado con asistencia de IA (Claude) –
// revisado por Marc Sanz, 13/11/2026
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { getItemDemand } from '../services/demandService';
import { checkAvailability } from '../services/rentalService';
import { formatMatchingRequests, monthBounds, monthOf, selectRangeDate } from '../utils/calendar';
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
import {
  EMPTY_DELIVERY_DRAFT,
  type DeliveryDraft,
  type DeliverySelection,
} from '../utils/deliveryDraft';
import { DateRangeCalendar, type CalendarDemand } from './DateRangeCalendar';
import { DeliveryStep } from './DeliveryStep';
import { Icon } from './Icon';

export type RentalItem = {
  id: string;
  title: string;
  pricePerDay: number;
  photoUrl?: string;
  // Pago al solicitar (US-07.01, #286).
  deposit?: number;
  ownerName?: string;
  // Barrio del objeto: con «Recoger en casa del propietario» es lo único que se ve antes de aceptar.
  neighborhood?: string;
};

export type RentalDates = { startDate: string; endDate: string };

// Lo que pasa a «Confirmar y pagar»: las fechas y la entrega elegida en el paso «Entrega»
// (US-05.01). El borrador sirve para volver al panel con lo que se había elegido.
export type RentalChoice = RentalDates & { delivery: DeliverySelection; draft: DeliveryDraft };

type RentalRequestProps = {
  item: RentalItem;
  // Las fechas con las que se vuelve de «Confirmar y pagar» (están en la dirección de la ficha).
  initialDates?: RentalDates;
  initialDraft?: DeliveryDraft;
  // Con las fechas libres, «Solicitar alquiler» pasa al paso «Entrega» y, de ahí, a la página
  // «Confirmar y pagar».
  onContinue: (choice: RentalChoice) => void;
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

// Selector de fechas de US-04.01 (#121), dentro del panel lateral de la ficha del objeto (#15). El
// resumen y el pago están en su propia página, «Confirmar y pagar» (US-07.01).
export function RentalRequest({
  item,
  initialDates,
  initialDraft,
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
  const [step, setStep] = useState<'dates' | 'delivery'>('dates');
  const [deliveryDraft, setDeliveryDraft] = useState<DeliveryDraft>(
    initialDraft ?? EMPTY_DELIVERY_DRAFT,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);
  const [monthDemand, setMonthDemand] = useState<MonthDemandResult | null>(null);
  const [rangeDemand, setRangeDemand] = useState<RangeDemandResult | null>(null);
  const { session, clearSession } = useAuth();
  const token = session?.token;

  // El botón pulsado desaparece al cambiar de paso: el foco pasa al título del paso nuevo.
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

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
    setStep('delivery');
  }

  // Paso «Entrega» (US-05.01, #282): modo, hora y destino. Al continuar se abre la página de pago.
  if (step === 'delivery') {
    return (
      <DeliveryStep
        item={item}
        startDate={startDate}
        endDate={endDate}
        days={days}
        rentalPrice={totalPrice}
        draft={deliveryDraft}
        onDraftChange={setDeliveryDraft}
        initialErrors={{}}
        formError={null}
        headingRef={headingRef}
        onBack={() => setStep('dates')}
        onContinue={(delivery) =>
          onContinue({ startDate, endDate, delivery, draft: deliveryDraft })
        }
      />
    );
  }

  return (
    <section className="rental-request" aria-labelledby="rental-title">
      <h2 id="rental-title" ref={headingRef} tabIndex={-1}>
        Elige las fechas
      </h2>
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
