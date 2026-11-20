// Generado con asistencia de IA (Claude)
// «Trabajos» de un rider aceptado (US-10.01, #293): los disponibles, agrupados por día, cada uno con
// su botón «Aceptar», y «Mis trabajos», con la dirección completa. Sustituye a la pantalla
// provisional de US-10.03.
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useMatch } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import {
  acceptJob,
  ASAP_SLOT,
  getAvailableJobs,
  getMyJobs,
  type AvailableJob,
  type JobStatus,
  type MyJob,
} from '../services/riderJobService';

const AVAILABLE_PATH = '/trabajos';
const MINE_PATH = '/trabajos/mios';

const LOAD_FAILED = 'No se han podido cargar los trabajos.';
const ACCEPT_FAILED = 'No se ha podido aceptar el trabajo. Inténtalo de nuevo.';

const priceFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const dayFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

// Aviso del último «Aceptar»: aceptado, ya era de otro rider (criterio 4) o error.
type NoticeContent =
  { kind: 'accepted' | 'taken'; title: string } | { kind: 'error'; message: string };
type Notice = NoticeContent & { id: number };

// Estados de la entrega con los nombres de la historia US-05.02 (#67). Los valores de la API se
// fijan con la máquina de estados de T13 (#288).
const STATUS_LABELS: Record<JobStatus, string> = {
  assigned: 'Asignada',
  picked_up: 'Recogida',
  on_the_way: 'En camino',
  delivered: 'Entregada',
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

// «asap» → «Lo antes posible»; «09:00-11:00» → «De 09:00 a 11:00».
function formatSlot(slot: string): string {
  if (slot === ASAP_SLOT) return 'Lo antes posible';
  const [from, to] = slot.split('-');
  return `De ${from} a ${to}`;
}

function formatFee(fee: string | number): string {
  return priceFormatter.format(Number(fee));
}

// El mismo orden que la API: por fecha y, dentro del día, «Lo antes posible» primero.
function byStart(a: AvailableJob, b: AvailableJob): number {
  if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
  if (a.slot === b.slot) return 0;
  if (a.slot === ASAP_SLOT) return -1;
  if (b.slot === ASAP_SLOT) return 1;
  return a.slot.localeCompare(b.slot);
}

// Los trabajos ya llegan ordenados por fecha: se agrupan por día conservando ese orden.
function groupByDay<T extends AvailableJob>(jobs: T[]): { day: string; jobs: T[] }[] {
  const groups: { day: string; jobs: T[] }[] = [];
  for (const job of jobs) {
    const day = job.startDate.slice(0, 10);
    const last = groups.at(-1);
    if (last?.day === day) last.jobs.push(job);
    else groups.push({ day, jobs: [job] });
  }
  return groups;
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
  const showingMine = useMatch(MINE_PATH) !== null;

  const [available, setAvailable] = useState<AvailableJob[] | null>(null);
  const [mine, setMine] = useState<MyJob[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [accepting, setAccepting] = useState<ReadonlySet<string>>(new Set());
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

  function showNotice(next: NoticeContent) {
    noticeCount.current += 1;
    setNotice({ ...next, id: noticeCount.current });
  }

  function setAcceptingJob(id: string, value: boolean) {
    setAccepting((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Cada trabajo se acepta por separado (decisión de Kai, 20/11). Al aceptarlo pasa a «Mis
  // trabajos» y la página se queda en «Disponibles» para seguir aceptando.
  async function accept(job: AvailableJob) {
    if (!token) return;
    setAcceptingJob(job.id, true);
    try {
      const { job: accepted } = await acceptJob(token, job.id);
      setAvailable((current) => current && current.filter((entry) => entry.id !== job.id));
      setMine(
        (current) =>
          current &&
          [...current.filter((entry) => entry.id !== accepted.id), accepted].sort(byStart),
      );
      showNotice({ kind: 'accepted', title: job.item.title });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        return;
      }
      // 409: otro rider lo aceptó antes (o ya no está disponible). Sale de la lista y se recarga.
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        setAvailable((current) => current && current.filter((entry) => entry.id !== job.id));
        showNotice({ kind: 'taken', title: job.item.title });
        setAttempt((current) => current + 1);
        return;
      }
      const showApiMessage = error instanceof ApiError && [0, 403].includes(error.status);
      showNotice({ kind: 'error', message: showApiMessage ? error.message : ACCEPT_FAILED });
    } finally {
      setAcceptingJob(job.id, false);
    }
  }

  const loaded = available !== null && mine !== null;

  return (
    <section className="rider-jobs">
      <div className="page-header">
        <div>
          <h1 className="page-title">Trabajos</h1>
          <p className="page-subtitle">
            Acepta las entregas que quieras hacer. Verás las direcciones completas al aceptarlas.
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
          <div className="jobs-day-list" aria-hidden="true">
            {[0, 1, 2].map((placeholder) => (
              <div key={placeholder} className="skeleton reservation-skeleton" />
            ))}
          </div>
        </>
      ) : showingMine ? (
        <MyJobsList jobs={mine} />
      ) : (
        <>
          {/* La clave cambia en cada «Aceptar»: el aviso se vuelve a montar y a anunciar. */}
          {notice && <AcceptNotice key={notice.id} notice={notice} />}
          <AvailableJobsList jobs={available} accepting={accepting} onAccept={accept} />
        </>
      )}
    </section>
  );
}

// Resultado del último «Aceptar». La tarjeta aceptada desaparece, así que el foco viene aquí para
// que se lea el resultado.
function AcceptNotice({ notice }: { notice: Notice }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div ref={ref} tabIndex={-1} className="jobs-result">
      {notice.kind === 'accepted' && (
        <p role="status" className="jobs-assigned">
          <Icon name="check_circle" />
          <span>
            Has aceptado «{notice.title}». Lo tienes en <Link to={MINE_PATH}>Mis trabajos</Link>,
            con las direcciones.
          </span>
        </p>
      )}
      {notice.kind === 'taken' && (
        <p role="alert" className="jobs-taken">
          <Icon name="warning" />
          <span>
            <strong>{notice.title}</strong>: Ya asignado a otro rider.
          </span>
        </p>
      )}
      {notice.kind === 'error' && (
        <p role="alert" className="form-error manage-notice">
          <Icon name="error" />
          {notice.message}
        </p>
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

// El trayecto de una entrega: de dónde se recoge a dónde se entrega. Hasta aceptar, solo barrios.
function JobRoute({ pickup, delivery }: { pickup: ReactNode; delivery: ReactNode }) {
  return (
    <span className="job-route">
      <span className="job-stop">
        <span className="job-stop-label">Recogida</span>{' '}
        <span className="job-stop-place">{pickup}</span>
      </span>{' '}
      <span className="job-stop">
        <span className="job-stop-label">Entrega</span>{' '}
        <span className="job-stop-place">{delivery}</span>
      </span>
    </span>
  );
}

function JobFee({ fee }: { fee: string }) {
  return (
    <span className="job-fee">
      <span className="job-fee-label">Tarifa</span>{' '}
      <span className="job-fee-amount">{formatFee(fee)}</span>
    </span>
  );
}

function DayHeading({ day }: { day: string }) {
  return <h2 className="jobs-day">{formatDay(day)}</h2>;
}

function AvailableJobsList({
  jobs,
  accepting,
  onAccept,
}: {
  jobs: AvailableJob[];
  accepting: ReadonlySet<string>;
  onAccept: (job: AvailableJob) => Promise<void>;
}) {
  if (jobs.length === 0) {
    return <EmptyJobs icon="pedal_bike">No hay trabajos disponibles ahora mismo.</EmptyJobs>;
  }

  return (
    <div className="jobs-day-list">
      {groupByDay(jobs).map((group) => (
        <Fragment key={group.day}>
          <DayHeading day={group.day} />
          <ul className="jobs-list" aria-label={`Trabajos de ${formatDay(group.day)}`}>
            {group.jobs.map((job) => {
              const busy = accepting.has(job.id);
              return (
                <li key={job.id} className="job-card">
                  <div className="job-main">
                    <h3 className="job-title">{job.item.title}</h3>
                    <JobRoute pickup={job.pickupNeighborhood} delivery={job.deliveryNeighborhood} />
                    <span className="job-slot">
                      <Icon name="schedule" />
                      {formatSlot(job.slot)}
                    </span>
                  </div>
                  <div className="job-side">
                    <JobFee fee={job.fee} />
                    {/* El nombre lleva el objeto: hay un «Aceptar» por tarjeta. */}
                    <button
                      type="button"
                      className="button-primary job-accept"
                      aria-label={
                        busy ? `Aceptando ${job.item.title}…` : `Aceptar ${job.item.title}`
                      }
                      disabled={busy}
                      onClick={() => void onAccept(job)}
                    >
                      {busy ? 'Aceptando…' : 'Aceptar'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Fragment>
      ))}
    </div>
  );
}

function MyJobsList({ jobs }: { jobs: MyJob[] }) {
  if (jobs.length === 0) {
    return <EmptyJobs icon="pedal_bike">Todavía no has aceptado ningún trabajo.</EmptyJobs>;
  }

  return (
    <div className="jobs-day-list">
      {groupByDay(jobs).map((group) => (
        <Fragment key={group.day}>
          <DayHeading day={group.day} />
          <ul className="jobs-list">
            {group.jobs.map((job) => (
              <li key={job.id} className="job-card">
                <div className="job-main">
                  <div className="job-header">
                    <h3 className="job-title">{job.item.title}</h3>
                    <span className="badge badge-success">
                      {STATUS_LABELS[job.status] ?? job.status}
                    </span>
                  </div>
                  <JobRoute
                    pickup={
                      <>
                        {job.pickupAddress}{' '}
                        <span className="job-stop-area">({job.pickupNeighborhood})</span>
                      </>
                    }
                    delivery={
                      <>
                        {job.deliveryAddress}{' '}
                        <span className="job-stop-area">({job.deliveryNeighborhood})</span>
                      </>
                    }
                  />
                  <span className="job-slot">
                    <Icon name="schedule" />
                    {formatSlot(job.slot)}
                  </span>
                </div>
                <div className="job-side">
                  <JobFee fee={job.fee} />
                  <Link to={`/entregas/${job.id}`} className="button-secondary job-tracking">
                    Ver seguimiento
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </div>
  );
}
