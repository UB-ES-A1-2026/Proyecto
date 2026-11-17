// Generado con asistencia de IA (Claude)
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { createPaymentMethod, type CardDetails, type CardField } from '../services/cardGateway';
import {
  PaymentVerificationRequired,
  requestRental,
  type PaymentCredential,
  type Reservation,
} from '../services/rentalService';
import { isStripeEnabled } from '../services/stripeService';
import { calculateTotalPrice, countRentalDays, formatLongDate, formatPrice } from '../utils/rental';
import { CardFields, TestCardsNote } from './CardFields';
import { Icon } from './Icon';
import type { RentalItem } from './RentalRequest';
import { StripePayment, type StripeConfirmer } from './StripePayment';

const EMPTY_CARD: CardDetails = { number: '', expiry: '', cvc: '' };

// Un bloqueo con tarjeta caduca a los ~7 días: hasta 6 días de alquiler la fianza se bloquea el día
// antes de empezar; si dura más, se cobra y se devuelve al terminar (propuesta de US-07.01, #286).
const MAX_DEPOSIT_HOLD_DAYS = 6;
// Stripe no puede retener menos de 0,50 €: con una fianza menor no hay pago de fianza (#72).
const MIN_DEPOSIT_TO_HOLD = 0.5;

type RentalCheckoutProps = {
  item: RentalItem;
  startDate: string;
  endDate: string;
  // La ficha con estas fechas: «Cambiar» y «Elegir otras fechas» vuelven a ella.
  datesPath: string;
  onRequested: (reservation: Reservation) => void;
  onSessionExpired: () => void;
};

type CheckoutError = { message: string; dates: boolean };

// Resumen y pago de la página «Confirmar y pagar» (US-07.01): antes estaban en el panel de la
// ficha, después de las fechas, y no se notaba que ahí se confirma y se paga.
export function RentalCheckout({
  item,
  startDate,
  endDate,
  datesPath,
  onRequested,
  onSessionExpired,
}: RentalCheckoutProps) {
  const [error, setError] = useState<CheckoutError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [card, setCard] = useState<CardDetails>(EMPTY_CARD);
  const [cardErrors, setCardErrors] = useState<Partial<Record<CardField, string>>>({});
  const { session, clearSession } = useAuth();
  // Con Stripe, el formulario de pago (Payment Element) se maneja a través de este objeto.
  // Además del estado: dos envíos seguidos antes de que React pinte (doble clic, Intro repetido)
  // verían submitting=false los dos.
  const submittingRef = useRef(false);
  const stripeConfirmer = useRef<StripeConfirmer | null>(null);
  const useStripeForm = isStripeEnabled();

  const days = countRentalDays(startDate, endDate);
  const totalPrice = calculateTotalPrice(item.pricePerDay, days);
  const deposit = (item.deposit ?? 0) >= MIN_DEPOSIT_TO_HOLD ? (item.deposit ?? 0) : 0;
  const owner = item.ownerName ?? 'el propietario';
  const depositCharged = days > MAX_DEPOSIT_HOLD_DAYS;

  function handleCardChange(field: CardField, value: string) {
    setCard((current) => ({ ...current, [field]: value }));
    setCardErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || submittingRef.current || !session) return;
    setError(null);

    // Sin Stripe, la tarjeta simulada se comprueba antes de llamar a la API: su número nunca sale
    // hacia Rentit. Con Stripe, el Payment Element valida y da el token al pulsar.
    let simulatedToken = '';
    if (!useStripeForm) {
      const method = createPaymentMethod(card);
      if (!method.ok) {
        setCardErrors(method.errors);
        const firstInvalid = (['number', 'expiry', 'cvc'] as const).find(
          (field) => method.errors[field],
        );
        const input = firstInvalid ? event.currentTarget.elements.namedItem(firstInvalid) : null;
        if (input instanceof HTMLInputElement) input.focus();
        return;
      }
      simulatedToken = method.confirmationTokenId;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const input = { itemId: item.id, startDate, endDate };
      let credential: PaymentCredential = simulatedToken;
      if (useStripeForm) {
        const confirmer = stripeConfirmer.current;
        if (!confirmer) throw new ApiError(0, 'El formulario de pago todavía se está cargando.');
        const result = await confirmer.createToken();
        if ('error' in result) throw new ApiError(0, result.error);
        credential = result.confirmationTokenId;
      }

      let reservation: Reservation;
      try {
        reservation = await requestRental(session.token, input, credential);
      } catch (requestError) {
        if (!(requestError instanceof PaymentVerificationRequired)) throw requestError;
        // Tu banco pide verificar el pago (3D Secure): todavía no hay reserva. Con Stripe se abre la
        // ventana del banco; en el modo simulado se da por verificado.
        if (stripeConfirmer.current) {
          const verified = await stripeConfirmer.current.handleNextAction(
            requestError.clientSecret,
          );
          if (verified.error) throw new ApiError(402, verified.error);
        }
        reservation = await requestRental(session.token, input, {
          paymentIntentId: requestError.paymentIntentId,
        });
      }
      onRequested(reservation);
    } catch (requestError) {
      submittingRef.current = false;
      // El botón se reactiva siempre, también si el componente sigue montado tras un 401.
      setSubmitting(false);
      // Sesión caducada o revocada: se borra y se vuelve al login.
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
        onSessionExpired();
        return;
      }
      // Errores de #120. Si el problema está en las fechas (409 por solape, fecha no válida), se
      // ofrece volver a la ficha a elegir otras; si no (tarjeta rechazada, objeto propio, no
      // publicado, solicitud duplicada…), se queda aquí con el mensaje de la API para reintentar.
      if (requestError instanceof ApiError) {
        setError({
          message: requestError.message,
          dates: requestError.field === 'startDate' || requestError.field === 'endDate',
        });
      } else {
        setError({ message: 'Ha ocurrido un error inesperado.', dates: false });
      }
    }
  }

  return (
    <div className="checkout">
      <section className="card checkout-summary" aria-labelledby="checkout-summary-title">
        <h2 id="checkout-summary-title">Tu solicitud</h2>
        <div className="rental-item">
          {item.photoUrl && <img src={item.photoUrl} alt="" className="rental-item-photo" />}
          <div>
            <p className="rental-item-title">{item.title}</p>
            <p className="field-hint">
              {formatPrice(item.pricePerDay)} / día
              {item.ownerName && ` · de ${item.ownerName}`}
            </p>
          </div>
        </div>
        <dl className="rental-summary">
          <dt>Desde</dt>
          <dd>{formatLongDate(startDate)}</dd>
          <dt>Hasta</dt>
          <dd>
            {formatLongDate(endDate)}
            {' · '}
            <Link to={datesPath} aria-label="Cambiar las fechas">
              Cambiar
            </Link>
          </dd>
          <dt>Importe del alquiler ({days === 1 ? '1 día' : `${days} días`})</dt>
          <dd>{formatPrice(totalPrice)}</dd>
          {/* El importe destacado es lo que se paga: sin la fianza. */}
          <dt>Total</dt>
          <dd className="rental-total">{formatPrice(totalPrice)}</dd>
        </dl>
        {/* La fianza aparte y en pequeño: no es lo que se paga ahora, y sumada asustaba. */}
        {deposit > 0 && (
          <dl className="checkout-deposit">
            <dt>
              {depositCharged
                ? 'Fianza (se cobra y se devuelve al terminar)'
                : 'Fianza (se retiene, no se cobra)'}
            </dt>
            <dd>{formatPrice(deposit)}</dd>
            <dt>Total con fianza</dt>
            <dd>{formatPrice(totalPrice + deposit)}</dd>
          </dl>
        )}
      </section>

      <section className="card checkout-payment" aria-labelledby="checkout-payment-title">
        <h2 id="checkout-payment-title">Pago</h2>
        {/* Criterio de US-07.01 (#286): qué pasa con el dinero, antes de meter la tarjeta. */}
        <div className="rental-payment-note">
          <Icon name="lock" size="1.125rem" />
          <p>
            Bloquearemos {formatPrice(totalPrice)} en tu tarjeta.{' '}
            <strong>Solo se cobran si {owner} acepta</strong>; si la rechaza o no responde en 48
            horas, se liberan.
            {deposit > 0 &&
              (depositCharged
                ? ` Como el alquiler dura más de ${MAX_DEPOSIT_HOLD_DAYS} días, la fianza (${formatPrice(deposit)}) se cobra el día antes de empezar y se devuelve al terminar.`
                : ` La fianza (${formatPrice(deposit)}) se bloquea el día antes de empezar y se libera al terminar, sin cobrarla.`)}
          </p>
        </div>

        <form onSubmit={(event) => void handleConfirm(event)} noValidate>
          {useStripeForm ? (
            <>
              <StripePayment
                amountCents={Math.round(totalPrice * 100)}
                disabled={submitting}
                confirmerRef={stripeConfirmer}
              />
              <TestCardsNote />
            </>
          ) : (
            <CardFields
              card={card}
              errors={cardErrors}
              disabled={submitting}
              onChange={handleCardChange}
            />
          )}
          {/* Justo encima del botón: es donde se mira al pulsar (p. ej. «Tu tarjeta ha sido rechazada.»). */}
          {error && (
            <p role="alert" className="form-error rental-payment-error">
              <Icon name="error" size="1.125rem" />
              <span>
                {error.message}
                {error.dates && (
                  <>
                    {' '}
                    <Link to={datesPath}>Elegir otras fechas</Link>
                  </>
                )}
              </span>
            </p>
          )}
          <button type="submit" className="button-primary checkout-submit" disabled={submitting}>
            {submitting ? 'Procesando el pago…' : 'Confirmar y enviar solicitud'}
          </button>
          <p className="field-hint checkout-hint">
            Al confirmar, la solicitud le llega a {owner} y se bloquean {formatPrice(totalPrice)}.
          </p>
        </form>
      </section>
    </div>
  );
}
