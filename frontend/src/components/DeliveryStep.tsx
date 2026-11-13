// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
// Paso «Entrega» de la solicitud de alquiler (US-05.01, #282): entre las fechas y el resumen.
// Wireframe: docs/wireframes/US-05.01-modo-entrega (pantallas 2 a 7).
import { useEffect, useState, type FormEvent, type RefObject } from 'react';
import { ApiError } from '../services/apiClient';
import {
  ASAP_SLOT,
  DELIVERY_ADDRESS_MAX_LENGTH,
  DELIVERY_MODE_LABELS,
  formatDistance,
  formatSlot,
  getDeliveryOptions,
  getRiderQuote,
  type DeliveryMode,
  type DeliveryOptions,
} from '../services/deliveryService';
import { getNeighborhoods } from '../services/neighborhoodService';
import {
  DELIVERY_ERROR_FIELDS,
  type DeliveryDraft,
  type DeliveryErrors,
  type DeliverySelection,
} from '../utils/deliveryDraft';
import { formatInputDate, formatPrice } from '../utils/rental';

// Mismos textos que la API (#321): el frontend los comprueba antes de continuar.
const MODE_REQUIRED = 'Elige un modo de entrega.';
const SLOT_REQUIRED = 'Elige una hora de entrega.';
const PICKUP_POINT_REQUIRED = 'Elige un punto de recogida.';
const ADDRESS_INVALID = 'El campo "dirección de entrega" no es correcto, revísalo.';
const NEIGHBORHOOD_INVALID = 'El campo "barrio de entrega" no es correcto, revísalo.';
const UNEXPECTED_ERROR = 'Ha ocurrido un error inesperado.';

// Id del control que recibe el foco cuando su campo tiene un error.
const FIELD_IDS: Record<keyof DeliveryErrors, string> = {
  deliveryMode: 'delivery-mode',
  slot: 'delivery-slot',
  deliveryAddress: 'delivery-address',
  deliveryNeighborhood: 'delivery-neighborhood',
  pickupPointId: 'delivery-pickup-point',
};

const MODE_ORDER: readonly { mode: DeliveryMode; offered: keyof DeliveryOptions['modes'] }[] = [
  { mode: 'home', offered: 'home' },
  { mode: 'rider', offered: 'rider' },
  { mode: 'pickup_point', offered: 'pickupPoint' },
];

type Loaded<T> = { key: string } & ({ data: T } | { error: string });

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : UNEXPECTED_ERROR;
}

// Lleva el foco al primer control del campo (en un grupo de opciones, a la primera).
function focusField(field: keyof DeliveryErrors) {
  const element = document.getElementById(FIELD_IDS[field]);
  const control = element?.matches('input, select') ? element : element?.querySelector('input');
  control?.focus();
}

type DeliveryStepProps = {
  item: { id: string; title: string; neighborhood?: string };
  startDate: string;
  endDate: string;
  days: number;
  rentalPrice: number;
  draft: DeliveryDraft;
  onDraftChange: (draft: DeliveryDraft) => void;
  initialErrors: DeliveryErrors;
  formError: string | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onContinue: (selection: DeliverySelection) => void;
};

export function DeliveryStep({
  item,
  startDate,
  endDate,
  days,
  rentalPrice,
  draft,
  onDraftChange,
  initialErrors,
  formError,
  headingRef,
  onBack,
  onContinue,
}: DeliveryStepProps) {
  const [errors, setErrors] = useState<DeliveryErrors>(initialErrors);
  const optionsKey = `${item.id}|${startDate}`;
  const [optionsResult, setOptionsResult] = useState<Loaded<DeliveryOptions> | null>(null);
  const [neighborhoodsResult, setNeighborhoodsResult] = useState<Loaded<string[]> | null>(null);
  const [quoteResult, setQuoteResult] = useState<Loaded<string> | null>(null);

  // Modos, puntos y franjas del objeto para el día de inicio.
  useEffect(() => {
    let ignore = false;
    getDeliveryOptions(item.id, startDate)
      .then((data) => {
        if (!ignore) setOptionsResult({ key: optionsKey, data });
      })
      .catch((error: unknown) => {
        if (!ignore) setOptionsResult({ key: optionsKey, error: errorMessage(error) });
      });
    return () => {
      ignore = true;
    };
  }, [item.id, startDate, optionsKey]);

  const options =
    optionsResult?.key === optionsKey && 'data' in optionsResult ? optionsResult.data : null;
  const optionsError =
    optionsResult?.key === optionsKey && 'error' in optionsResult ? optionsResult.error : null;

  // Lo guardado solo vale si el objeto lo sigue ofreciendo (p. ej. al volver tras cambiar fechas).
  const mode = options && isOffered(options, draft.mode) ? draft.mode : '';
  const slot =
    options && (draft.slot === ASAP_SLOT || options.slots.includes(draft.slot)) ? draft.slot : '';
  const pickupPoint = options?.pickupPoints.find((point) => point.id === draft.pickupPointId);

  // La lista de barrios solo hace falta con rider; se pide una vez.
  const needsNeighborhoods = mode === 'rider' && neighborhoodsResult === null;
  useEffect(() => {
    if (!needsNeighborhoods) return;
    let ignore = false;
    getNeighborhoods()
      .then((data) => {
        if (!ignore) setNeighborhoodsResult({ key: 'barrios', data });
      })
      .catch((error: unknown) => {
        if (!ignore) setNeighborhoodsResult({ key: 'barrios', error: errorMessage(error) });
      });
    return () => {
      ignore = true;
    };
  }, [needsNeighborhoods]);

  const neighborhoods =
    neighborhoodsResult && 'data' in neighborhoodsResult ? neighborhoodsResult.data : null;
  const neighborhood =
    neighborhoods && neighborhoods.includes(draft.neighborhood) ? draft.neighborhood : '';
  const neighborhoodError =
    errors.deliveryNeighborhood ??
    (neighborhoodsResult && 'error' in neighborhoodsResult ? neighborhoodsResult.error : null);

  // Tarifa del rider hasta el barrio elegido.
  const quoteKey = mode === 'rider' && neighborhood ? neighborhood : null;
  useEffect(() => {
    if (!quoteKey) return;
    let ignore = false;
    getRiderQuote(item.id, quoteKey)
      .then(({ fee }) => {
        if (!ignore) setQuoteResult({ key: quoteKey, data: fee });
      })
      .catch((error: unknown) => {
        if (!ignore) setQuoteResult({ key: quoteKey, error: errorMessage(error) });
      });
    return () => {
      ignore = true;
    };
  }, [item.id, quoteKey]);

  const currentQuote = quoteKey && quoteResult?.key === quoteKey ? quoteResult : null;
  const fee = currentQuote && 'data' in currentQuote ? currentQuote.data : null;
  const quoteError = currentQuote && 'error' in currentQuote ? currentQuote.error : null;
  const loadingQuote = quoteKey !== null && currentQuote === null;
  const deliveryFee = mode === 'rider' && fee !== null ? Number(fee) : 0;

  function update(changes: Partial<DeliveryDraft>, clears: (keyof DeliveryErrors)[]) {
    onDraftChange({ ...draft, mode, slot, neighborhood, ...changes });
    setErrors((current) => {
      const next = { ...current };
      for (const field of clears) delete next[field];
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!options || loadingQuote) return;

    const found: DeliveryErrors = {};
    if (mode === '') {
      found.deliveryMode = MODE_REQUIRED;
    } else if (mode === 'rider') {
      if (slot === '') found.slot = SLOT_REQUIRED;
      const address = draft.address.trim();
      if (address === '' || address.length > DELIVERY_ADDRESS_MAX_LENGTH) {
        found.deliveryAddress = ADDRESS_INVALID;
      }
      if (neighborhood === '') found.deliveryNeighborhood = NEIGHBORHOOD_INVALID;
      else if (quoteError) found.deliveryNeighborhood = quoteError;
    } else if (mode === 'pickup_point' && !pickupPoint) {
      found.pickupPointId = PICKUP_POINT_REQUIRED;
    }

    const firstError = DELIVERY_ERROR_FIELDS.find((field) => found[field]);
    if (firstError) {
      setErrors(found);
      focusField(firstError);
      return;
    }

    if (mode === 'home') onContinue({ mode: 'home' });
    else if (mode === 'pickup_point' && pickupPoint) {
      onContinue({
        mode: 'pickup_point',
        pickupPoint: {
          id: pickupPoint.id,
          name: pickupPoint.name,
          address: pickupPoint.address,
          neighborhood: pickupPoint.neighborhood,
        },
      });
    } else if (mode === 'rider' && fee !== null) {
      onContinue({
        mode: 'rider',
        slot,
        address: draft.address.trim(),
        neighborhood,
        fee,
      });
    }
  }

  return (
    <section className="rental-request" aria-labelledby="rental-title">
      <h2 id="rental-title" ref={headingRef} tabIndex={-1}>
        Entrega
      </h2>
      <p className="field-hint rental-delivery-context">
        {item.title} · Del {formatInputDate(startDate)} al {formatInputDate(endDate)}
      </p>
      {formError && (
        <p role="alert" className="form-error">
          {formError}
        </p>
      )}
      {optionsError && (
        <>
          <p role="alert" className="form-error">
            {optionsError}
          </p>
          <div className="rental-actions">
            <button type="button" className="button-secondary" onClick={onBack}>
              Volver
            </button>
          </div>
        </>
      )}
      {!options && !optionsError && <p className="field-hint">Cargando…</p>}
      {options && (
        <form onSubmit={handleSubmit} noValidate>
          <fieldset
            id={FIELD_IDS.deliveryMode}
            className="rental-delivery-fieldset"
            aria-describedby={errors.deliveryMode ? 'delivery-mode-error' : undefined}
          >
            <legend>¿Cómo quieres recibir el objeto?</legend>
            {MODE_ORDER.filter(({ offered }) => options.modes[offered]).map((option) => (
              <label key={option.mode} className="rental-delivery-option">
                <input
                  type="radio"
                  name="delivery-mode"
                  value={option.mode}
                  checked={mode === option.mode}
                  onChange={() => update({ mode: option.mode }, ['deliveryMode'])}
                />
                {DELIVERY_MODE_LABELS[option.mode]}
              </label>
            ))}
            {errors.deliveryMode && (
              <p id="delivery-mode-error" className="field-error">
                {errors.deliveryMode}
              </p>
            )}
          </fieldset>

          {mode === 'rider' && (
            <div className="rental-delivery-details">
              <div className="form-field">
                <label htmlFor={FIELD_IDS.slot}>
                  Hora de entrega ({formatInputDate(startDate)})
                </label>
                <select
                  id={FIELD_IDS.slot}
                  value={slot}
                  onChange={(event) => update({ slot: event.target.value }, ['slot'])}
                  aria-invalid={errors.slot ? true : undefined}
                  aria-describedby={errors.slot ? 'delivery-slot-error' : undefined}
                >
                  <option value="">Elige una hora</option>
                  <option value={ASAP_SLOT}>{formatSlot(ASAP_SLOT)}</option>
                  {options.slots.map((option) => (
                    <option key={option} value={option}>
                      {formatSlot(option)}
                    </option>
                  ))}
                </select>
                {errors.slot && (
                  <p id="delivery-slot-error" className="field-error">
                    {errors.slot}
                  </p>
                )}
              </div>
              <div className="form-field">
                <label htmlFor={FIELD_IDS.deliveryAddress}>Dirección de entrega</label>
                <input
                  id={FIELD_IDS.deliveryAddress}
                  type="text"
                  autoComplete="street-address"
                  maxLength={DELIVERY_ADDRESS_MAX_LENGTH}
                  value={draft.address}
                  onChange={(event) => update({ address: event.target.value }, ['deliveryAddress'])}
                  aria-invalid={errors.deliveryAddress ? true : undefined}
                  aria-describedby={
                    errors.deliveryAddress ? 'delivery-address-error' : 'delivery-address-hint'
                  }
                />
                {errors.deliveryAddress ? (
                  <p id="delivery-address-error" className="field-error">
                    {errors.deliveryAddress}
                  </p>
                ) : (
                  <p id="delivery-address-hint" className="field-hint">
                    Solo la verá el rider que haga la entrega.
                  </p>
                )}
              </div>
              <div className="form-field">
                <label htmlFor={FIELD_IDS.deliveryNeighborhood}>Barrio de entrega</label>
                <select
                  id={FIELD_IDS.deliveryNeighborhood}
                  value={neighborhood}
                  disabled={!neighborhoods}
                  onChange={(event) =>
                    update({ neighborhood: event.target.value }, ['deliveryNeighborhood'])
                  }
                  aria-invalid={errors.deliveryNeighborhood ? true : undefined}
                  aria-describedby={neighborhoodError ? 'delivery-neighborhood-error' : undefined}
                >
                  <option value="">{neighborhoods ? 'Elige un barrio' : 'Cargando…'}</option>
                  {neighborhoods?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {neighborhoodError && (
                  <p id="delivery-neighborhood-error" className="field-error">
                    {neighborhoodError}
                  </p>
                )}
              </div>
            </div>
          )}

          {mode === 'pickup_point' && (
            <fieldset
              id={FIELD_IDS.pickupPointId}
              className="rental-delivery-fieldset rental-delivery-details"
              aria-describedby={errors.pickupPointId ? 'delivery-pickup-point-error' : undefined}
            >
              <legend>Puntos cercanos</legend>
              {options.pickupPoints.map((point) => (
                <label key={point.id} className="rental-delivery-option">
                  <input
                    type="radio"
                    name="delivery-pickup-point"
                    value={point.id}
                    checked={pickupPoint?.id === point.id}
                    onChange={() => update({ pickupPointId: point.id }, ['pickupPointId'])}
                  />
                  <span className="rental-delivery-point">
                    <span>
                      {point.name} · {point.address}
                    </span>
                    {point.distanceKm !== null && (
                      <span className="field-hint">{formatDistance(point.distanceKm)}</span>
                    )}
                  </span>
                </label>
              ))}
              {errors.pickupPointId && (
                <p id="delivery-pickup-point-error" className="field-error">
                  {errors.pickupPointId}
                </p>
              )}
            </fieldset>
          )}

          {mode === 'home' && (
            <p className="field-hint rental-delivery-details">
              {item.neighborhood ? `Lo recoges en ${item.neighborhood}. ` : ''}La dirección se
              mostrará cuando acepten la solicitud.
            </p>
          )}

          <div className="rental-price rental-delivery-price" aria-live="polite">
            <p>
              Importe del alquiler ({days === 1 ? '1 día' : `${days} días`}):{' '}
              {formatPrice(rentalPrice)}
            </p>
            {mode === 'rider' && (
              <p>
                {fee !== null
                  ? `${DELIVERY_MODE_LABELS.rider}: ${formatPrice(deliveryFee)}`
                  : loadingQuote
                    ? 'Calculando el coste de la entrega…'
                    : 'Elige el barrio para ver el coste.'}
              </p>
            )}
            {mode !== '' && (
              <p>
                Total: <strong>{formatPrice(rentalPrice + deliveryFee)}</strong>
              </p>
            )}
          </div>

          <div className="rental-actions">
            <button type="button" className="button-secondary" onClick={onBack}>
              Volver
            </button>
            <button type="submit" className="button-primary" disabled={loadingQuote}>
              Continuar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function isOffered(options: DeliveryOptions, mode: DeliveryMode | ''): mode is DeliveryMode {
  if (mode === '') return false;
  const entry = MODE_ORDER.find((option) => option.mode === mode);
  return entry ? options.modes[entry.offered] : false;
}
