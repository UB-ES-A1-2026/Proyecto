// Generado con asistencia de IA (Claude)
// «Trabajos» de un rider aceptado (US-10.01, #293): los disponibles, para marcar varios y
// aceptarlos a la vez, y «Mis trabajos», con la dirección completa. Sustituye a la pantalla
// provisional de US-10.03.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useMatch, useNavigate } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import {
  acceptJobs,
  ASAP_SLOT,
  getAvailableJobs,
  getMyJobs,
  type AcceptJobsResult,
  type AvailableJob,
  type JobStatus,
  type MyJob,
} from '../services/riderJobService';

const AVAILABLE_PATH = '/trabajos';
const MINE_PATH = '/trabajos/mios';

const LOAD_FAILED = 'No se han podido cargar los trabajos.';
const ACCEPT_FAILED = 'No se han podido aceptar los trabajos. Inténtalo de nuevo.';

const priceFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const dayFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

// Resultado de «Aceptar trabajos» que se lleva a «Mis trabajos» con la navegación.
type AcceptedState = { accepted: AcceptJobsResult };
type Notice = { id: string; result: AcceptJobsResult };

const STATUS_LABELS: Record<JobStatus, string> = {
  assigned: 'Asignado',
  picked_up: 'Recogido',
  on_the_way: 'En camino',
  delivered: 'Entregado',
};

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function localToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// «Hoy», «Mañana» o «Sábado, 21 de noviembre».
function formatDay(date: string): string {
  const day = parseLocalDate(date);
  const diff = Math.round((day.getTime() - localToday().getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  const text = dayFormatter.format(day);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// «asap» → «Lo antes posible»; «09:00-11:00» → «09:00 – 11:00».
function formatSlot(slot: string): string {
  return slot === ASAP_SLOT ? 'Lo antes posible' : slot.replace('-', ' – ');
}

function formatWhen(job: AvailableJob): string {
  return `${formatDay(job.startDate)} · ${formatSlot(job.slot)}`;
}

function formatFee(fee: string | number): string {
  return priceFormatter.format(Number(fee));
}

function jobsText(count: number): string {
  return count === 1 ? '1 trabajo' : `${count} trabajos`;
}

function loadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.status === 0 || error.status === 403)) {
    return error.message;
  }
  return LOAD_FAILED;
}

export function RiderJobsPage() {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const navigate = useNavigate();
  const location = useLocation();
  const showingMine = useMatch(MINE_PATH) !== null;

  const [available, setAvailable] = useState<AvailableJob[] | null>(null);
  const [mine, setMine] = useState<MyJob[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeCount = useRef(0);

  useEffect(() => {
    if (!token) return;
    let ignore = false;
    Promise.all([getAvailableJobs(token), getMyJobs(token)])
      .then(([availableData, mineData]) => {
        if (ignore) return;
        setAvailable(availableData.jobs);
        setMine(mineData.jobs);
      })
      .catch((error: unknown) => {
        if (ignore) return;
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          return;
        }
        setLoadError(loadErrorMessage(error));
      });
    return () => {
      ignore = true;
    };
  }, [token, clearSession, attempt]);

  function retry() {
    setLoadError(null);
    setAvailable(null);
    setMine(null);
    setAttempt((current) => current + 1);
  }

  const handleAccepted = useCallback(
    (accepted: AcceptJobsResult) => {
      // Con alguno asignado va a «Mis trabajos»; el resultado viaja con la navegación porque la
      // página se vuelve a montar al cambiar de ruta.
      if (accepted.assigned.length > 0) {
        navigate(MINE_PATH, { state: { accepted } satisfies AcceptedState });
        return;
      }
      // Ninguno: se queda en «Disponibles» con el aviso, sin los que ya eran de otro rider.
      const taken = new Set(accepted.alreadyTaken.map((job) => job.id));
      noticeCount.current += 1;
      setNotice({ id: `aviso-${noticeCount.current}`, result: accepted });
      setAvailable((current) => current && current.filter((job) => !taken.has(job.id)));
      setAttempt((current) => current + 1);
    },
    [navigate],
  );

  const navigatedResult = (location.state as AcceptedState | null)?.accepted;
  const shownNotice =
    notice ?? (navigatedResult ? { id: location.key, result: navigatedResult } : null);
  const loaded = available !== null && mine !== null;

  return (
    <section className="rider-jobs">
      <div className="page-header">
        <div>
          <h1 className="page-title">Trabajos</h1>
          <p className="page-subtitle">
            Marca las entregas que quieras hacer y síguelas desde «Mis trabajos».
          </p>
        </div>
      </div>

      <nav aria-label="Trabajos" className="jobs-tabs">
        <NavLink to={AVAILABLE_PATH} end className="jobs-tab">
          {loaded ? `Disponibles (${available.length})` : 'Disponibles'}
        </NavLink>
        <NavLink to={MINE_PATH} className="jobs-tab">
          {loaded ? `Mis trabajos (${mine.length})` : 'Mis trabajos'}
        </NavLink>
      </nav>

      {/* La clave cambia en cada aceptación: el aviso se vuelve a montar y a anunciar. */}
      {shownNotice && <AcceptResultNotice key={shownNotice.id} result={shownNotice.result} />}

      {loadError ? (
        <div className="jobs-load-error">
          <p role="alert" className="form-error manage-notice">
            <Icon name="error" />
            {loadError}
          </p>
          <button type="button" className="button-secondary" onClick={retry}>
            Reintentar
          </button>
        </div>
      ) : !loaded ? (
        <>
          <p role="status" className="manage-visually-hidden">
            Cargando los trabajos…
          </p>
          <div className="jobs-list" aria-hidden="true">
            {[0, 1, 2].map((placeholder) => (
              <div key={placeholder} className="skeleton reservation-skeleton" />
            ))}
          </div>
        </>
      ) : showingMine ? (
        <MyJobsList jobs={mine} />
      ) : (
        token && (
          <AvailableJobsList
            jobs={available}
            token={token}
            onAccepted={handleAccepted}
            onSessionExpired={clearSession}
          />
        )
      )}
    </section>
  );
}

// Cuántos se han asignado y cuáles ya eran de otro rider (criterio 4). Se lleva el foco aquí
// para que se lea al terminar.
function AcceptResultNotice({ result }: { result: AcceptJobsResult }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div ref={ref} tabIndex={-1} className="jobs-result">
      {result.assigned.length > 0 && (
        <p role="status" className="jobs-assigned">
          <Icon name="check_circle" />
          Te hemos asignado {jobsText(result.assigned.length)}.
        </p>
      )}
      {result.alreadyTaken.length > 0 && (
        <ul role="alert" className="jobs-taken">
          {result.alreadyTaken.map((job) => (
            <li key={job.id}>
              <Icon name="warning" />
              <span>
                <strong>{job.item.title}</strong>: Ya asignado a otro rider.
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyJobs({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="empty-state card manage-empty">
      <Icon name={icon} />
      <p>{children}</p>
    </div>
  );
}

function AvailableJobsList({
  jobs,
  token,
  onAccepted,
  onSessionExpired,
}: {
  jobs: AvailableJob[];
  token: string;
  onAccepted: (result: AcceptJobsResult) => void;
  onSessionExpired: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo cuentan los marcados que siguen en la lista.
  const marked = jobs.filter((job) => selected.has(job.id));
  const total = marked.reduce((sum, job) => sum + Number(job.fee), 0);

  function toggle(id: string) {
    setError(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function accept() {
    setSubmitting(true);
    setError(null);
    try {
      const accepted = await acceptJobs(
        token,
        marked.map((job) => job.id),
      );
      setSelected(new Set());
      onAccepted(accepted);
    } catch (requestError: unknown) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired();
        return;
      }
      const showApiMessage =
        requestError instanceof ApiError && [0, 400, 403].includes(requestError.status);
      setError(showApiMessage ? requestError.message : ACCEPT_FAILED);
    } finally {
      setSubmitting(false);
    }
  }

  if (jobs.length === 0) {
    return <EmptyJobs icon="pedal_bike">No hay trabajos disponibles ahora mismo.</EmptyJobs>;
  }

  return (
    <form
      className="jobs-form"
      aria-label="Trabajos disponibles"
      onSubmit={(event) => {
        event.preventDefault();
        if (marked.length > 0 && !submitting) void accept();
      }}
    >
      {error && (
        <p role="alert" className="form-error manage-notice">
          <Icon name="error" />
          {error}
        </p>
      )}
      <ul className="jobs-list">
        {jobs.map((job) => {
          const titleId = `job-${job.id}-title`;
          const detailId = `job-${job.id}-detail`;
          const checked = selected.has(job.id);
          return (
            <li key={job.id}>
              {/* Toda la tarjeta marca la casilla; el lector lee el objeto y luego el detalle. */}
              <label className={`job-card card job-option${checked ? ' is-selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={submitting}
                  aria-labelledby={titleId}
                  aria-describedby={`${detailId}-route ${detailId}-when ${detailId}-fee`}
                  onChange={() => toggle(job.id)}
                />
                <span className="job-body">
                  <span id={titleId} className="job-title">
                    {job.item.title}
                  </span>
                  <span className="job-details">
                    <span className="job-fact">
                      <Icon name="location_on" />
                      <span id={`${detailId}-route`}>
                        De <strong>{job.pickupNeighborhood}</strong> a{' '}
                        <strong>{job.deliveryNeighborhood}</strong>
                      </span>
                    </span>
                    <span className="job-fact">
                      <Icon name="event" />
                      <span id={`${detailId}-when`}>{formatWhen(job)}</span>
                    </span>
                    <span id={`${detailId}-fee`} className="job-fee">
                      Cobras {formatFee(job.fee)}
                    </span>
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="jobs-action-bar">
        <p aria-live="polite" className="jobs-action-summary">
          {marked.length === 0
            ? 'Marca los trabajos que quieras hacer.'
            : `${marked.length === 1 ? '1 trabajo marcado' : `${marked.length} trabajos marcados`} · cobrarás ${formatFee(total)}`}
        </p>
        <button
          type="submit"
          className="button-primary"
          disabled={marked.length === 0 || submitting}
        >
          {submitting ? 'Aceptando…' : 'Aceptar trabajos'}
        </button>
      </div>
    </form>
  );
}

function MyJobsList({ jobs }: { jobs: MyJob[] }) {
  if (jobs.length === 0) {
    return <EmptyJobs icon="pedal_bike">Todavía no has aceptado ningún trabajo.</EmptyJobs>;
  }

  return (
    <ul className="jobs-list" aria-label="Mis trabajos">
      {jobs.map((job) => (
        <li key={job.id} className="job-card card">
          <div className="job-header">
            <h2 className="job-title">{job.item.title}</h2>
            <span className="badge badge-success">{STATUS_LABELS[job.status] ?? job.status}</span>
          </div>
          <p className="job-fact">
            <Icon name="pin_drop" />
            <span>
              Recoges en: {job.pickupAddress} ({job.pickupNeighborhood})
            </span>
          </p>
          <p className="job-fact">
            <Icon name="location_on" />
            <span>
              Entregas en: {job.deliveryAddress} ({job.deliveryNeighborhood})
            </span>
          </p>
          <p className="job-fact">
            <Icon name="event" />
            <span>
              {formatWhen(job)} · Cobras {formatFee(job.fee)}
            </span>
          </p>
          <Link to={`/entregas/${job.id}`} className="button-secondary job-tracking">
            Ver seguimiento
          </Link>
        </li>
      ))}
    </ul>
  );
}
