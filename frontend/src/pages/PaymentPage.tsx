// Generado con asistencia de IA (Claude)
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CardFields } from '../components/CardFields';
import { Icon } from '../components/Icon';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { createPaymentMethod, type CardDetails, type CardField } from '../services/cardGateway';
import { getItemDetail } from '../services/itemService';
import { payReservation } from '../services/paymentService';
import { getMyReservations, type Reservation } from '../services/reservationService';

const priceFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });

export const PAYMENT_DONE = 'Pago registrado.';
const NOT_FOUND = 'No hemos encontrado esta solicitud.';
const ALREADY_PAID = 'Esta reserva ya está pagada.';
const NOT_ACCEPTED = 'Solo se puede pagar una solicitud aceptada.';
const LOAD_ERROR = 'No hemos podido cargar el pago. Inténtalo de nuevo más tarde.';

const EMPTY_CARD: CardDetails = { number: '', expiry: '', cvc: '' };

type PaymentData = { reservation: Reservation; deposit: number };

// Lo que impide pagar: se muestra en lugar del formulario, con el camino de vuelta.
type Blocked = { icon: 'search_off' | 'check_circle' | 'info'; message: string };

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function rentalDays(reservation: Reservation): number {
  const start = parseLocalDate(reservation.startDate).getTime();
  const end = parseLocalDate(reservation.endDate).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

// En céntimos, para que la suma no arrastre decimales de coma flotante.
function toCents(amount: string | number): number {
  return Math.round(Number(amount) * 100);
}

function formatCents(cents: number): string {
  return priceFormatter.format(cents / 100);
}

function blockedFor(reservation: Reservation): Blocked | null {
  if (reservation.status === 'accepted') return null;
  if (reservation.status === 'paid') return { icon: 'check_circle', message: ALREADY_PAID };
  return { icon: 'info', message: NOT_ACCEPTED };
}

function BackToReservations() {
  return (
    <Link to="/mis-solicitudes" className="button-secondary">
      Volver a Mis solicitudes
    </Link>
  );
}

function BlockedState({ icon, message }: Blocked) {
  return (
    <div className="empty-state card payment-blocked">
      <Icon name={icon} />
      <p role="alert">{message}</p>
      <BackToReservations />
    </div>
  );
}

function SummaryRow({
  label,
  detail,
  amount,
}: {
  label: string;
  detail?: ReactNode;
  amount: string;
}) {
  return (
    <div className="payment-row">
      <dt>
        {label}
        {detail && <span className="payment-row-detail">{detail}</span>}
      </dt>
      <dd>{amount}</dd>
    </div>
  );
}

function PaymentSummary({ reservation, deposit }: PaymentData) {
  const days = rentalDays(reservation);
  const rental = toCents(reservation.totalPrice);
  const delivery = toCents(reservation.deliveryAmount ?? 0);
  const depositCents = toCents(deposit);
  const chargedNow = rental + delivery;
  const sameDay = reservation.startDate === reservation.endDate;

  return (
    <section className="card payment-summary" aria-labelledby="payment-summary-title">
      <h2 id="payment-summary-title" className="payment-section-title">
        Resumen
      </h2>
      <p className="payment-item">
        <Link to={`/objetos/${reservation.item.id}`}>{reservation.item.title}</Link>
      </p>
      <p className="payment-fact">
        <Icon name="event" size="1.125rem" />
        {sameDay
          ? dateFormatter.format(parseLocalDate(reservation.startDate))
          : `Del ${dateFormatter.format(parseLocalDate(reservation.startDate))} al ${dateFormatter.format(parseLocalDate(reservation.endDate))}`}
      </p>
      <p className="payment-fact">
        <Icon name="person" size="1.125rem" />
        Propietario: {reservation.owner.username}
      </p>

      <dl className="payment-breakdown">
        <SummaryRow
          label="Precio del alquiler"
          detail={`${days} ${days === 1 ? 'día' : 'días'}`}
          amount={formatCents(rental)}
        />
        {delivery > 0 && <SummaryRow label="Entrega" amount={formatCents(delivery)} />}
        <SummaryRow
          label="Fianza"
          detail={depositCents > 0 ? 'Se retiene, no se cobra' : undefined}
          amount={depositCents > 0 ? formatCents(depositCents) : 'Sin fianza'}
        />
        <div className="payment-row payment-total">
          <dt>Importe total</dt>
          <dd>{formatCents(chargedNow + depositCents)}</dd>
        </div>
      </dl>

      <p className="payment-note">
        Ahora se cobran <strong>{formatCents(chargedNow)}</strong>.
        {depositCents > 0 &&
          ` La fianza (${formatCents(depositCents)}) queda retenida en tu tarjeta y se libera al terminar el alquiler.`}
      </p>
    </section>
  );
}

function PaymentSkeleton() {
  return (
    <>
      <p role="status" className="manage-visually-hidden">
        Cargando el pago…
      </p>
      <div className="payment-layout" aria-hidden="true">
        <div className="skeleton payment-skeleton" />
        <div className="skeleton payment-skeleton" />
      </div>
    </>
  );
}

// Pantalla de pago (US-07.01, #286): el arrendatario paga una solicitud aceptada desde
// «Mis solicitudes». Al terminar vuelve allí con «Pago registrado.».
export function PaymentPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { session, clearSession } = useAuth();
  const token = session?.token;

  const [data, setData] = useState<PaymentData | null>(null);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [card, setCard] = useState<CardDetails>(EMPTY_CARD);
  const [cardErrors, setCardErrors] = useState<Partial<Record<CardField, string>>>({});
  const [payError, setPayError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    async function load(sessionToken: string) {
      const reservations = await getMyReservations(sessionToken);
      // Solo se paga lo que uno ha pedido: las recibidas no cuentan.
      const reservation = reservations.sent.find((candidate) => candidate.id === id);
      if (!reservation) return { blocked: { icon: 'search_off', message: NOT_FOUND } as Blocked };

      const reasonNotPayable = blockedFor(reservation);
      if (reasonNotPayable) return { blocked: reasonNotPayable };

      const item = await getItemDetail(reservation.item.id, sessionToken);
      return { data: { reservation, deposit: Number(item.deposit) } };
    }

    load(token)
      .then((result) => {
        if (ignore) return;
        if (result.blocked) setBlocked(result.blocked);
        else setData(result.data);
      })
      .catch((requestError: unknown) => {
        if (ignore) return;
        if (requestError instanceof ApiError && requestError.status === 401) {
          clearSession();
        } else if (requestError instanceof ApiError && requestError.status === 0) {
          setLoadError(requestError.message);
        } else {
          setLoadError(LOAD_ERROR);
        }
      });

    return () => {
      ignore = true;
    };
  }, [id, token, clearSession]);

  function handleCardChange(field: CardField, value: string) {
    setCard((current) => ({ ...current, [field]: value }));
    setCardErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !data || submitting) return;
    setPayError(null);

    const method = createPaymentMethod(card);
    if (!method.ok) {
      setCardErrors(method.errors);
      return;
    }

    setSubmitting(true);
    try {
      await payReservation(token, data.reservation.id, method.paymentMethodId);
      navigate('/mis-solicitudes', { state: { notice: PAYMENT_DONE } });
    } catch (requestError: unknown) {
      setSubmitting(false);
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
      } else if (
        requestError instanceof ApiError &&
        [403, 404, 409].includes(requestError.status)
      ) {
        // Ya no se puede pagar (por ejemplo, ya está pagada): no tiene sentido reintentarlo.
        setBlocked({
          icon: requestError.status === 409 ? 'check_circle' : 'info',
          message: requestError.message,
        });
      } else if (requestError instanceof ApiError) {
        // Tarjeta rechazada (402) o datos no válidos (400): se puede probar con otra.
        setPayError(requestError.message);
      } else {
        setPayError('Ha ocurrido un error inesperado.');
      }
    }
  }

  let content: ReactNode;
  if (loadError) {
    content = (
      <p role="alert" className="form-error manage-notice">
        <Icon name="error" />
        {loadError}
      </p>
    );
  } else if (blocked) {
    content = <BlockedState {...blocked} />;
  } else if (!data) {
    content = <PaymentSkeleton />;
  } else {
    content = (
      <div className="payment-layout">
        <PaymentSummary {...data} />

        <section className="card payment-form-card" aria-labelledby="payment-card-title">
          <h2 id="payment-card-title" className="payment-section-title">
            <Icon name="credit_card" />
            Tarjeta
          </h2>
          <form onSubmit={(event) => void handleSubmit(event)} noValidate>
            {payError && (
              <p role="alert" className="form-error manage-notice">
                <Icon name="error" />
                {payError}
              </p>
            )}
            <CardFields
              card={card}
              errors={cardErrors}
              disabled={submitting}
              onChange={handleCardChange}
            />
            <button type="submit" className="button-primary payment-submit" disabled={submitting}>
              {submitting ? 'Procesando el pago…' : 'Pagar'}
            </button>
            <p className="payment-secure">
              <Icon name="lock" size="1rem" />
              Los datos de la tarjeta no se guardan en Rentit.
            </p>
          </form>
        </section>
      </div>
    );
  }

  return (
    <section className="payment-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pagar el alquiler</h1>
          <p className="page-subtitle">
            Revisa el importe y paga con tarjeta para confirmar la reserva.
          </p>
        </div>
      </div>
      {content}
    </section>
  );
}
