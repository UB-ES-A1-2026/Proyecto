// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 03/11/2026
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { createPaymentMethod, type CardDetails, type CardField } from '../services/cardGateway';
import { checkAvailability, requestRental, type Reservation } from '../services/rentalService';
import { monthOf, selectRangeDate } from '../utils/calendar';
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
import { CardFields } from './CardFields';
import { DateRangeCalendar } from './DateRangeCalendar';
import { Icon } from './Icon';

export type RentalItem = {
  id: string;
  title: string;
  pricePerDay: number;
  photoUrl?: string;
  // Pago al solicitar (US-07.01, #286).
  deposit?: number;
  // Con reserva inmediata se cobra al momento y la reserva queda confirmada.
  instantBooking?: boolean;
  ownerName?: string;
};

const EMPTY_CARD: CardDetails = { number: '', expiry: '', cvc: '' };

// Un bloqueo con tarjeta caduca a los ~7 días: hasta 6 días de alquiler la fianza se bloquea el día
// antes de empezar; si dura más, se cobra y se devuelve al terminar (propuesta de US-07.01, #286).
const MAX_DEPOSIT_HOLD_DAYS = 6;

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
  const [card, setCard] = useState<CardDetails>(EMPTY_CARD);
  const [cardErrors, setCardErrors] = useState<Partial<Record<CardField, string>>>({});
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

  function handleCardChange(field: CardField, value: string) {
    setCard((current) => ({ ...current, [field]: value }));
    setCardErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !session) return;
    setFormError(null);

    // La tarjeta se comprueba antes de llamar a la API: su número nunca sale hacia Rentit.
    const method = createPaymentMethod(card);
    if (!method.ok) {
      setCardErrors(method.errors);
      return;
    }

    setSubmitting(true);
    try {
      const reservation = await requestRental(
        session.token,
        { itemId: item.id, startDate, endDate },
        method.paymentMethodId,
      );
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
      // a elegirlas; si no (tarjeta rechazada, objeto propio, no publicado, solicitud
      // duplicada…), se queda en el resumen con el mensaje de la API para probar otra vez.
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
    const deposit = item.deposit ?? 0;
    const instant = item.instantBooking === true;
    const owner = item.ownerName ?? 'el propietario';
    const depositCharged = days > MAX_DEPOSIT_HOLD_DAYS;

    return (
      <section key="summary" className="rental-request" aria-labelledby="rental-title">
        <h2 id="rental-title" ref={headingRef} tabIndex={-1}>
          {instant ? 'Revisa tu reserva' : 'Revisa tu solicitud'}
        </h2>
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
          {/* El importe destacado es siempre el último: el total si hay fianza. */}
          <dd className={deposit > 0 ? undefined : 'rental-total'}>{formatPrice(totalPrice)}</dd>
          {deposit > 0 && (
            <>
              <dt>
                {depositCharged
                  ? 'Fianza (se cobra y se devuelve al terminar)'
                  : 'Fianza (se retiene, no se cobra)'}
              </dt>
              <dd>{formatPrice(deposit)}</dd>
              <dt>Importe total</dt>
              <dd className="rental-total">{formatPrice(totalPrice + deposit)}</dd>
            </>
          )}
        </dl>

        {/* Criterio de US-07.01 (#286): qué pasa con el dinero, antes de meter la tarjeta. */}
        <div className={`rental-payment-note${instant ? ' is-instant' : ''}`}>
          <Icon name={instant ? 'bolt' : 'lock'} size="1.125rem" />
          <p>
            {instant ? (
              <>
                <strong>Reserva inmediata.</strong> Se cobran {formatPrice(totalPrice)} ahora y la
                reserva queda confirmada, sin esperar a {owner}.
              </>
            ) : (
              <>
                Bloquearemos {formatPrice(totalPrice)} en tu tarjeta.{' '}
                <strong>Solo se cobran si {owner} acepta</strong>; si la rechaza o no responde en 48
                horas, se liberan.
              </>
            )}
            {deposit > 0 &&
              (depositCharged
                ? ` Como el alquiler dura más de ${MAX_DEPOSIT_HOLD_DAYS} días, la fianza (${formatPrice(deposit)}) se cobra el día antes de empezar y se devuelve al terminar.`
                : ` La fianza (${formatPrice(deposit)}) se bloquea el día antes de empezar y se libera al terminar, sin cobrarla.`)}
          </p>
        </div>

        <form onSubmit={(event) => void handleConfirm(event)} noValidate>
          <CardFields
            card={card}
            errors={cardErrors}
            disabled={submitting}
            onChange={handleCardChange}
          />
          {/* Justo encima del botón: es donde se mira al pulsar (p. ej. «Tu tarjeta ha sido rechazada.»). */}
          {formError && (
            <p role="alert" className="form-error rental-payment-error">
              <Icon name="error" size="1.125rem" />
              {formError}
            </p>
          )}
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
            <button type="submit" className="button-primary" disabled={submitting}>
              {submitting
                ? 'Procesando el pago…'
                : instant
                  ? 'Reservar y pagar'
                  : 'Enviar solicitud'}
            </button>
          </div>
        </form>
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
