import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { requestRental, type Reservation } from '../services/rentalService';
import {
  calculateTotalPrice,
  countRentalDays,
  formatLongDate,
  formatPrice,
  todayIso,
  validateRentalDates,
  type RentalDateErrors,
} from '../utils/rental';

export type RentalItem = {
  id: string;
  title: string;
  pricePerDay: number;
  photoUrl?: string;
};

type RentalRequestProps = {
  item: RentalItem;
  onCancel: () => void;
  onRequested: (reservation: Reservation) => void;
};

// Selector de fechas, resumen y confirmación de US-04.01 (#121). Solo es el contenido: la página
// de detalle del objeto (#15) lo mostrará dentro de una ventana al pulsar «Alquilar».
export function RentalRequest({ item, onCancel, onRequested }: RentalRequestProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [apiErrors, setApiErrors] = useState<RentalDateErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<'dates' | 'summary'>('dates');
  const [submitting, setSubmitting] = useState(false);
  const { session, clearSession } = useAuth();

  const today = todayIso();
  const errors = { ...validateRentalDates(startDate, endDate, today), ...apiErrors };
  const datesValid = startDate !== '' && endDate !== '' && !errors.startDate && !errors.endDate;
  const days = datesValid ? countRentalDays(startDate, endDate) : 0;
  const totalPrice = calculateTotalPrice(item.pricePerDay, days);

  function changeDate(field: 'startDate' | 'endDate', value: string) {
    if (field === 'startDate') setStartDate(value);
    else setEndDate(value);
    setApiErrors({});
    setFormError(null);
  }

  function handleDatesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (datesValid) setStep('summary');
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
      // Sesión caducada o revocada: al borrarla, PrivateRoute lleva al login.
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        return;
      }
      // Errores de #120. Si el problema está en las fechas (409 por solape, con field), se vuelve
      // a elegirlas; si no (objeto propio, no publicado, solicitud duplicada…), se queda en el
      // resumen con el mensaje de la API.
      if (error instanceof ApiError && error.status === 409 && error.field) {
        setFormError(error.message);
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
      setSubmitting(false);
    }
  }

  if (step === 'summary') {
    return (
      <section className="rental-request" aria-labelledby="rental-title">
        <h2 id="rental-title">Revisa tu solicitud</h2>
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
    <section className="rental-request" aria-labelledby="rental-title">
      <h2 id="rental-title">Solicitar alquiler</h2>
      <p className="field-hint">
        {item.title} · {formatPrice(item.pricePerDay)} / día
      </p>
      {formError && (
        <p role="alert" className="form-error">
          {formError}
        </p>
      )}
      <form onSubmit={handleDatesSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="rental-start-date">Fecha de inicio</label>
          <input
            id="rental-start-date"
            type="date"
            min={today}
            value={startDate}
            onChange={(event) => changeDate('startDate', event.target.value)}
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
            type="date"
            min={startDate || today}
            value={endDate}
            onChange={(event) => changeDate('endDate', event.target.value)}
            aria-invalid={errors.endDate ? true : undefined}
            aria-describedby={errors.endDate ? 'rental-end-date-error' : undefined}
          />
          {errors.endDate && (
            <p id="rental-end-date-error" className="field-error">
              {errors.endDate}
            </p>
          )}
        </div>
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
        <div className="rental-actions">
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="button-primary" disabled={!datesValid}>
            Solicitar alquiler
          </button>
        </div>
      </form>
    </section>
  );
}
