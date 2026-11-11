// Generado con asistencia de IA (Claude)
import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { useAuth } from '../context/useAuth';
import {
  acceptRiderApplication,
  getRiderApplications,
  rejectRiderApplication,
  type RiderApplication,
  type RiderApplicationStatus,
  type RiderSlot,
  type RiderVehicle,
  type RiderWeekday,
} from '../services/adminRiderService';
import { ApiError } from '../services/apiClient';

const REASON_MAX_LENGTH = 500;
const ALREADY_REVIEWED = 'Esta solicitud ya se ha revisado.';

const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });
const shortDateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const VEHICLES: Record<RiderVehicle, string> = {
  on_foot: 'A pie',
  bike: 'Bici',
  scooter: 'Patinete',
  motorbike: 'Moto',
  car: 'Coche',
};
const WEEKDAYS: Record<RiderWeekday, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};
const SLOTS: Record<RiderSlot, string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
  night: 'Noche',
};

const STATUS: Record<
  RiderApplicationStatus,
  { label: string; badge: string; filter: string; empty: string }
> = {
  pending: {
    label: 'Pendiente de revisión',
    badge: 'badge-warning',
    filter: 'Pendientes',
    empty: 'No hay solicitudes pendientes.',
  },
  approved: {
    label: 'Aceptada',
    badge: 'badge-success',
    filter: 'Aceptadas',
    empty: 'Todavía no has aceptado ninguna solicitud.',
  },
  rejected: {
    label: 'Rechazada',
    badge: 'badge-error',
    filter: 'Rechazadas',
    empty: 'Todavía no has rechazado ninguna solicitud.',
  },
};
const FILTERS: RiderApplicationStatus[] = ['pending', 'approved', 'rejected'];

// Las pendientes, de la más antigua a la más nueva; las resueltas, la última revisada primero.
function sortApplications(applications: RiderApplication[], status: RiderApplicationStatus) {
  const time = (value: string | null) => (value ? new Date(value).getTime() : 0);
  return applications
    .filter((application) => application.status === status)
    .sort((a, b) =>
      status === 'pending'
        ? time(a.createdAt) - time(b.createdAt)
        : time(b.reviewedAt) - time(a.reviewedAt),
    );
}

function Fact({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <p className="reservation-fact">
      <Icon name={icon} />
      <span>{children}</span>
    </p>
  );
}

type Notice = { kind: 'success' | 'error'; text: string };

function RiderApplicationCard({
  application,
  onResolved,
  onOutdated,
}: {
  application: RiderApplication;
  onResolved: (updated: RiderApplication, text: string) => void;
  onOutdated: () => void;
}) {
  const { session, clearSession } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState<'accept' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const detailId = useId();
  const reasonId = useId();
  const status = STATUS[application.status];
  const name = application.user.username;

  async function resolve(decision: 'accept' | 'reject') {
    if (!session) return;
    setSubmitting(decision);
    setError(null);
    try {
      const updated =
        decision === 'accept'
          ? await acceptRiderApplication(session.token, application.id)
          : await rejectRiderApplication(session.token, application.id, reason.trim());
      onResolved(
        updated,
        decision === 'accept'
          ? `Has aceptado a ${name}: ya puede hacer entregas.`
          : `Has rechazado la solicitud de ${name}.`,
      );
    } catch (requestError: unknown) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
        return;
      }
      if (requestError instanceof ApiError && requestError.status === 409) {
        // Otro admin se ha adelantado: la página avisa y recarga la lista.
        onOutdated();
      } else {
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Ha ocurrido un error inesperado.',
        );
      }
    } finally {
      setSubmitting(null);
    }
  }

  function handleReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void resolve('reject');
  }

  return (
    <article className="reservation-card rider-card card">
      {/* El botón se lee «<nombre> · <zona> · <vehículo> · <fecha> · <estado>». */}
      <button
        type="button"
        className="reservation-card-toggle"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((isExpanded) => !isExpanded)}
      >
        <span className="reservation-card-summary">
          <span className="reservation-card-title">{name}</span>{' '}
          <span className="manage-visually-hidden">·</span>{' '}
          <span className="reservation-card-dates rider-card-meta">
            <span>{application.zone}</span>
            <span aria-hidden="true">·</span>
            <span>{VEHICLES[application.vehicle]}</span>
            <span aria-hidden="true">·</span>
            <span>{shortDateFormatter.format(new Date(application.createdAt))}</span>
          </span>
        </span>{' '}
        <span className="manage-visually-hidden">·</span>{' '}
        <span className={`badge ${status.badge} reservation-card-status`}>{status.label}</span>
        <span className="reservation-card-chevron">
          <Icon name="keyboard_arrow_down" />
        </span>
      </button>
      <div id={detailId} className="reservation-card-detail" hidden={!expanded}>
        <div className="reservation-card-clip">
          <div className="reservation-card-body">
            <div className="reservation-facts">
              <Fact icon="person">Nombre de usuario: {name}</Fact>
              <Fact icon="mail">Correo electrónico: {application.user.email}</Fact>
              <Fact icon="info">Teléfono: {application.phone}</Fact>
              <Fact icon="location_on">Zona de reparto: {application.zone}</Fact>
              <Fact icon="pedal_bike">Vehículo: {VEHICLES[application.vehicle]}</Fact>
              <Fact icon="event">
                Días: {application.days.map((day) => WEEKDAYS[day]).join(', ')}
              </Fact>
              <Fact icon="schedule">
                Franjas: {application.slots.map((slot) => SLOTS[slot]).join(', ')}
              </Fact>
              <Fact icon="task_alt">
                Aceptó las condiciones el{' '}
                {dateFormatter.format(new Date(application.termsAcceptedAt))}
              </Fact>
              <Fact icon="receipt_long">
                Enviada el {dateFormatter.format(new Date(application.createdAt))}
              </Fact>
              {application.status !== 'pending' && application.reviewedAt && (
                <Fact icon={application.status === 'approved' ? 'check_circle' : 'cancel'}>
                  {status.label} el {dateFormatter.format(new Date(application.reviewedAt))}
                  {application.reviewedBy && ` por ${application.reviewedBy.username}`}
                </Fact>
              )}
              {application.status === 'rejected' && (
                <Fact icon="description">
                  Motivo: {application.rejectionReason || 'Sin motivo indicado'}
                </Fact>
              )}
            </div>

            {error && (
              <p role="alert" className="form-error manage-notice">
                <Icon name="error" />
                {error}
              </p>
            )}

            {application.status === 'pending' && (
              <div className="rider-decision">
                {rejecting ? (
                  <form className="rider-reject-form" onSubmit={handleReject} noValidate>
                    <div className="form-field">
                      <label htmlFor={reasonId}>Motivo del rechazo (opcional)</label>
                      <textarea
                        id={reasonId}
                        value={reason}
                        maxLength={REASON_MAX_LENGTH}
                        rows={3}
                        onChange={(event) => setReason(event.target.value)}
                        aria-describedby={`${reasonId}-hint`}
                      />
                      <p id={`${reasonId}-hint`} className="field-hint">
                        Lo verá la persona que lo solicitó. Hasta {REASON_MAX_LENGTH} caracteres.
                      </p>
                    </div>
                    <div className="rider-decision-actions">
                      <button
                        type="submit"
                        className="button-danger"
                        disabled={submitting !== null}
                      >
                        {submitting === 'reject' ? 'Rechazando…' : 'Rechazar solicitud'}
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={submitting !== null}
                        onClick={() => setRejecting(false)}
                      >
                        Volver
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="rider-decision-actions">
                    <button
                      type="button"
                      className="button-primary"
                      disabled={submitting !== null}
                      onClick={() => void resolve('accept')}
                    >
                      {submitting === 'accept' ? 'Aceptando…' : 'Aceptar'}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={submitting !== null}
                      onClick={() => setRejecting(true)}
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

// Pantalla «Riders» del admin (US-11.03, #318): revisa las solicitudes para ser rider.
export function AdminRidersPage() {
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const [applications, setApplications] = useState<RiderApplication[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RiderApplicationStatus>('pending');
  const [notice, setNotice] = useState<Notice | null>(null);

  const handleLoadError = useCallback(
    (requestError: unknown) => {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
      } else if (requestError instanceof ApiError && requestError.status === 0) {
        setLoadError(requestError.message);
      } else {
        setLoadError('No hemos podido cargar las solicitudes. Inténtalo de nuevo más tarde.');
      }
    },
    [clearSession],
  );

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    getRiderApplications(token)
      .then((data) => {
        if (!ignore) setApplications(data);
      })
      .catch((requestError: unknown) => {
        if (!ignore) handleLoadError(requestError);
      });

    return () => {
      ignore = true;
    };
  }, [token, handleLoadError]);

  // Tras un aviso de «ya revisada»: vuelve a pedir la lista sin quitar la que se ve.
  function reload() {
    if (!token) return;
    getRiderApplications(token).then(setApplications).catch(handleLoadError);
  }

  function handleResolved(updated: RiderApplication, text: string) {
    setApplications(
      (current) =>
        current &&
        current.map((application) => (application.id === updated.id ? updated : application)),
    );
    setNotice({ kind: 'success', text });
  }

  const visible = applications ? sortApplications(applications, filter) : [];
  const count = (status: RiderApplicationStatus) =>
    applications?.filter((application) => application.status === status).length ?? 0;

  return (
    <section className="admin-riders">
      <div className="page-header">
        <div>
          <h1 className="page-title">Solicitudes de rider</h1>
          <p className="page-subtitle">
            Revisa quién quiere repartir y acepta solo a personas de confianza.
          </p>
        </div>
      </div>

      {notice && (
        <p
          role={notice.kind === 'success' ? 'status' : 'alert'}
          className={`${notice.kind === 'success' ? 'form-success' : 'form-error'} manage-notice`}
        >
          <Icon name={notice.kind === 'success' ? 'check_circle' : 'error'} />
          {notice.text}
        </p>
      )}

      {loadError ? (
        <p role="alert" className="form-error manage-notice">
          <Icon name="error" />
          {loadError}
        </p>
      ) : applications === null ? (
        <>
          <p role="status" className="manage-visually-hidden">
            Cargando las solicitudes…
          </p>
          <div className="reservation-list" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <div key={row} className="skeleton rider-card-skeleton" />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="filter-chips" role="group" aria-label="Filtrar por estado">
            {FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                className="filter-chip"
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                {STATUS[status].filter} · {count(status)}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="empty-state card manage-empty">
              <Icon name="pedal_bike" />
              <p>{STATUS[filter].empty}</p>
            </div>
          ) : (
            <div key={filter} className="reservation-list stagger">
              {visible.map((application) => (
                <RiderApplicationCard
                  key={application.id}
                  application={application}
                  onResolved={handleResolved}
                  onOutdated={() => {
                    setNotice({ kind: 'error', text: ALREADY_REVIEWED });
                    reload();
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
