// Generado con asistencia de IA (Claude)
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/useAuth';
import { useLiveRefresh, type LiveStatus } from '../hooks/useLiveRefresh';
import { ApiError } from '../services/apiClient';
import {
  advanceDelivery,
  confirmItemReceived,
  getDeliveryTracking,
  requestNewDeliveryCode,
  returnItem,
  type DeliveryTracking,
} from '../services/deliveryTrackingService';
import type { StreamEvent } from '../services/eventStreamService';
import {
  buildSteps,
  describeMode,
  formatDateRange,
  formatDeliveryCode,
  formatStepTime,
  isDelivered,
  nextRiderStep,
  RESERVATION_STATUS_LABELS,
  STEP_LABELS,
  type StepView,
} from '../utils/deliveryTracking';
import '../styles/tracking.css';

// Textos validados por Marc en el wireframe de US-05.02 (13/11).
const NOT_FOUND_MESSAGE = 'No hemos encontrado esta entrega.';
const OUTDATED_MESSAGE =
  'Este paso ya no está disponible: el estado ha cambiado. Te enseñamos el actual.';
const CODE_FORMAT_MESSAGE = 'Escribe las 6 cifras del código de entrega.';
const NEW_CODE_MESSAGE = 'Hemos generado un código nuevo. El anterior ya no vale.';

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'success'; tracking: DeliveryTracking };

type RenterAction = 'received' | 'returned';

const RENTER_DIALOGS: Record<
  RenterAction,
  { title: string; question: string; result: string; confirm: string }
> = {
  received: {
    title: 'Ya tengo el objeto',
    question: '¿Ya tienes el objeto? No se puede deshacer',
    result: 'En curso',
    confirm: 'Sí, ya lo tengo',
  },
  returned: {
    title: 'He devuelto el objeto',
    question: '¿Has devuelto el objeto? No se puede deshacer',
    result: 'Finalizada',
    confirm: 'Sí, lo he devuelto',
  },
};

const STEP_MARKS: Record<StepView['state'], { mark: string; text: string }> = {
  done: { mark: '✔', text: 'hecho' },
  current: { mark: '●', text: 'estado actual' },
  todo: { mark: '○', text: 'pendiente' },
};

function StepList({ steps }: { steps: StepView[] }) {
  return (
    <ol className="tracking-steps">
      {steps.map((step) => (
        <li
          key={step.step}
          className={`tracking-step is-${step.state}`}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <span className="tracking-step-mark" aria-hidden="true">
            {STEP_MARKS[step.state].mark}
          </span>
          <span className="tracking-step-label">{step.label}</span>
          <span className="manage-visually-hidden"> ({STEP_MARKS[step.state].text})</span>
          {step.at && <span className="tracking-step-time"> · {formatStepTime(step.at)}</span>}
        </li>
      ))}
    </ol>
  );
}

function LiveIndicator({ status }: { status: LiveStatus }) {
  if (status === 'connecting') return null;
  return (
    <p className={`tracking-live is-${status}`}>
      {status === 'live'
        ? '● Actualizado al momento'
        : '○ Sin conexión en tiempo real: se actualiza cada 5 s'}
    </p>
  );
}

// Seguimiento de una entrega y del alquiler (US-05.02, #67): solo una lista de estados con su
// fecha y hora, sin mapa. Lo ven el arrendatario, el propietario y el rider de la reserva; cada uno
// con sus botones. Los cambios llegan solos por el canal de tiempo real (#289).
export function DeliveryTrackingPage() {
  const { id = '' } = useParams();
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [renewingCode, setRenewingCode] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dialog, setDialog] = useState<RenterAction | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  // Solo vale la última respuesta: si se piden dos recargas seguidas, la antigua se ignora.
  const lastRequest = useRef(0);

  const load = useCallback(() => {
    if (!token) return;
    const request = ++lastRequest.current;
    getDeliveryTracking(token, id)
      .then((tracking) => {
        if (request === lastRequest.current) setState({ status: 'success', tracking });
      })
      .catch((requestError: unknown) => {
        if (request !== lastRequest.current) return;
        if (requestError instanceof ApiError && requestError.status === 401) {
          clearSession();
        } else if (
          requestError instanceof ApiError &&
          (requestError.status === 404 || requestError.status === 403)
        ) {
          // No existe o no es tuya: el mismo mensaje en los dos casos.
          setState({ status: 'not-found' });
        } else if (requestError instanceof ApiError && requestError.status === 0) {
          setState({ status: 'error', message: requestError.message });
        } else {
          setState({
            status: 'error',
            message: 'No hemos podido cargar la entrega. Inténtalo de nuevo más tarde.',
          });
        }
      });
  }, [token, id, clearSession]);

  useEffect(() => {
    load();
  }, [load]);

  const isRelevant = useCallback(
    (event: StreamEvent) =>
      event.type === 'entrega.estado' &&
      typeof event.data === 'object' &&
      event.data !== null &&
      'reservationId' in event.data &&
      event.data.reservationId === id,
    [id],
  );

  const tracking = state.status === 'success' ? state.tracking : null;
  const liveStatus = useLiveRefresh({
    token,
    refresh: load,
    isRelevant,
    onUnauthorized: clearSession,
    // Con el alquiler finalizado ya no puede cambiar nada.
    enabled: tracking?.reservationStatus !== 'finished',
  });

  async function runAction(action: () => Promise<DeliveryTracking>, successMessage?: string) {
    if (submitting) return;
    setSubmitting(true);
    setNotice(null);
    setSuccess(null);
    setActionError(null);
    try {
      const updated = await action();
      lastRequest.current += 1;
      setState({ status: 'success', tracking: updated });
      setCode('');
      setCodeError(null);
      if (successMessage) setSuccess(successMessage);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
        return;
      }
      // Los errores del código van en su campo, también el bloqueo tras 5 intentos (409 con
      // field "code"): si no, el rider vería «Este paso ya no está disponible».
      if (requestError instanceof ApiError && requestError.field === 'code') {
        setCodeError(requestError.message);
      } else if (requestError instanceof ApiError && requestError.status === 409) {
        // Alguien ya ha cambiado el estado (otra pestaña, doble clic): se enseña el actual.
        setNotice(OUTDATED_MESSAGE);
        load();
      } else if (requestError instanceof ApiError) {
        setActionError(requestError.message);
      } else {
        setActionError('Ha ocurrido un error inesperado.');
      }
    } finally {
      setSubmitting(false);
      setRenewingCode(false);
      setDialog(null);
    }
  }

  if (state.status === 'loading') {
    return (
      <section className="tracking" aria-busy="true">
        <p role="status" className="field-hint">
          Cargando la entrega…
        </p>
      </section>
    );
  }

  if (state.status === 'not-found' || state.status === 'error') {
    return (
      <section className="tracking" aria-labelledby="tracking-title">
        <h1 id="tracking-title" className="page-title">
          Entrega
        </h1>
        <p role="alert" className="form-error manage-notice">
          <Icon name="error" />
          {state.status === 'not-found' ? NOT_FOUND_MESSAGE : state.message}
        </p>
        <Link to="/mis-solicitudes" className="tracking-back" aria-label="Volver a Mis solicitudes">
          <Icon name="chevron_left" size="1.25rem" />
          Mis solicitudes
        </Link>
      </section>
    );
  }

  const current = state.tracking;
  const steps = buildSteps(current);
  const delivered = isDelivered(current);
  const isRenter = current.role === 'renter';
  const riderStep = current.role === 'rider' ? nextRiderStep(current.deliveryStatus) : null;
  const facts = [
    formatDateRange(current.startDate, current.endDate),
    describeMode(current),
    ...(isRenter ? [] : [`Arrendatario: ${current.renter.username}`]),
    `Alquiler: ${RESERVATION_STATUS_LABELS[current.reservationStatus]}`,
  ];

  function handleRiderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !riderStep) return;
    if (riderStep !== 'delivered') {
      void runAction(() => advanceDelivery(token, id, riderStep));
      return;
    }
    const digits = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(digits)) {
      setCodeError(CODE_FORMAT_MESSAGE);
      return;
    }
    void runAction(() => advanceDelivery(token, id, 'delivered', digits));
  }

  function confirmRenterAction(action: RenterAction) {
    if (!token) return;
    void runAction(() =>
      action === 'received' ? confirmItemReceived(token, id) : returnItem(token, id),
    );
  }

  // Si el código se bloquea tras 5 intentos, el arrendatario pide otro (POST …/codigo, T13).
  function renewCode() {
    if (!token) return;
    setRenewingCode(true);
    void runAction(() => requestNewDeliveryCode(token, id), NEW_CODE_MESSAGE);
  }

  const dialogTexts = dialog ? RENTER_DIALOGS[dialog] : null;

  return (
    <section className="tracking" aria-labelledby="tracking-title">
      {current.role !== 'rider' && (
        <Link to="/mis-solicitudes" className="tracking-back" aria-label="Volver a Mis solicitudes">
          <Icon name="chevron_left" size="1.25rem" />
          Mis solicitudes
        </Link>
      )}
      <h1 id="tracking-title" className="page-title">
        Entrega de {current.item.title}
      </h1>
      <p className="page-subtitle">{facts.join(' · ')}</p>

      <div className="card tracking-card">
        {notice && (
          <p role="alert" className="form-error manage-notice">
            <Icon name="error" />
            {notice}
          </p>
        )}
        {actionError && (
          <p role="alert" className="form-error manage-notice">
            <Icon name="error" />
            {actionError}
          </p>
        )}
        {success && (
          <p role="status" className="form-success manage-notice">
            <Icon name="check_circle" />
            {success}
          </p>
        )}

        <StepList steps={steps} />

        {/* El código solo lo ve el arrendatario y solo hasta que el rider lo usa (#67). */}
        {isRenter && current.mode === 'rider' && current.deliveryCode && !delivered && (
          <p className="tracking-code">
            Tu código de entrega: <strong>{formatDeliveryCode(current.deliveryCode)}</strong>.
            Enséñaselo al rider cuando te dé el objeto.
          </p>
        )}
        {isRenter && current.mode === 'rider' && current.deliveryCode && !delivered && (
          <>
            <p className="field-hint">¿El rider te dice que el código se ha bloqueado?</p>
            <button
              type="button"
              className="button-secondary tracking-action"
              disabled={submitting}
              onClick={renewCode}
            >
              {renewingCode ? 'Generando…' : 'Generar un código nuevo'}
            </button>
          </>
        )}

        {isRenter && current.mode !== 'rider' && !delivered && (
          <>
            {current.pickupAddress && (
              <p className="tracking-address">
                <Icon name="location_on" />
                <span>Recógela en: {current.pickupAddress}</span>
              </p>
            )}
            <button
              type="button"
              className="button-primary tracking-action"
              disabled={submitting}
              onClick={() => setDialog('received')}
            >
              Ya tengo el objeto
            </button>
          </>
        )}

        {isRenter && current.reservationStatus === 'in_progress' && (
          <>
            <p className="field-hint">Cuando se lo hayas devuelto al propietario, márcalo aquí.</p>
            <button
              type="button"
              className="button-primary tracking-action"
              disabled={submitting}
              onClick={() => setDialog('returned')}
            >
              He devuelto el objeto
            </button>
          </>
        )}

        {/* «Valorar» se enseñará cuando US-08.01 y US-08.02 estén en develop (decisión de Marc). */}
        {current.reservationStatus === 'finished' && (
          <p className="tracking-finished">
            <Icon name="task_alt" />
            Alquiler finalizado.
          </p>
        )}

        {riderStep && (
          <form className="tracking-rider" onSubmit={handleRiderSubmit} noValidate>
            {riderStep === 'delivered' && (
              <div className="form-field">
                <label htmlFor="delivery-code">Código de entrega</label>
                <input
                  id="delivery-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={7}
                  value={code}
                  aria-invalid={codeError ? true : undefined}
                  aria-describedby={codeError ? 'delivery-code-error' : 'delivery-code-hint'}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setCodeError(null);
                  }}
                />
                {codeError ? (
                  <p id="delivery-code-error" className="field-error" role="alert">
                    {codeError}
                  </p>
                ) : (
                  <p id="delivery-code-hint" className="field-hint">
                    Pídeselo al arrendatario.
                  </p>
                )}
              </div>
            )}
            <button type="submit" className="button-primary tracking-action" disabled={submitting}>
              {submitting ? 'Guardando…' : `Marcar como ${STEP_LABELS[riderStep]}`}
            </button>
          </form>
        )}
      </div>

      {current.reservationStatus !== 'finished' && <LiveIndicator status={liveStatus} />}

      {dialog && dialogTexts && (
        <Modal title={dialogTexts.title} onClose={() => !submitting && setDialog(null)}>
          <div className="withdraw-notice">
            <span className="withdraw-notice-icon">
              <Icon name="warning" size="1.5rem" />
            </span>
            <div>
              <p className="withdraw-notice-question">{dialogTexts.question}</p>
              <p className="withdraw-notice-text">
                El alquiler de «{current.item.title}» pasará a «{dialogTexts.result}».
              </p>
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button-primary"
              disabled={submitting}
              onClick={() => confirmRenterAction(dialog)}
            >
              {submitting ? 'Guardando…' : dialogTexts.confirm}
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={submitting}
              onClick={() => setDialog(null)}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
