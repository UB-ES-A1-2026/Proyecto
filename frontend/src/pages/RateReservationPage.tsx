// Generado con asistencia de IA (Claude)
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { StarRating, StarsDisplay } from '../components/StarRating';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { COMMENT_MAX, rateReservation } from '../services/ratingService';
import { getMyReservations, type Reservation } from '../services/reservationService';

const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });

export const RATING_DONE = 'Valoración publicada.';
const NOT_FOUND = 'No hemos encontrado este alquiler.';
const NOT_FINISHED = 'Solo se puede valorar un alquiler finalizado.';
const ALREADY_RATED = 'Ya has valorado este alquiler.';
const NO_SCORE = 'Elige una puntuación de 1 a 5 estrellas.';
const LOAD_ERROR = 'No hemos podido cargar el alquiler. Inténtalo de nuevo más tarde.';

// Lo que impide valorar: se muestra en lugar del formulario, con el camino de vuelta.
type Blocked = { icon: IconName; message: string; reservation?: Reservation };

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDates({ startDate, endDate }: Reservation): string {
  const start = dateFormatter.format(parseLocalDate(startDate));
  return startDate === endDate
    ? start
    : `Del ${start} al ${dateFormatter.format(parseLocalDate(endDate))}`;
}

function blockedFor(reservation: Reservation): Blocked | null {
  if (reservation.myRating) {
    return { icon: 'check_circle', message: ALREADY_RATED, reservation };
  }
  if (reservation.status !== 'finished') return { icon: 'info', message: NOT_FINISHED };
  return null;
}

function RentalSummary({ reservation }: { reservation: Reservation }) {
  return (
    <div className="rate-summary">
      <p className="rate-summary-item">
        <Link to={`/objetos/${reservation.item.id}`}>{reservation.item.title}</Link>
      </p>
      <p className="rate-summary-fact">
        <Icon name="event" size="1.125rem" />
        {formatDates(reservation)}
      </p>
      <p className="rate-summary-fact">
        <Icon name="person" size="1.125rem" />
        Propietario: {reservation.owner.username}
      </p>
    </div>
  );
}

function BlockedState({ icon, message, reservation }: Blocked) {
  const rating = reservation?.myRating;
  return (
    <div className="empty-state card rate-blocked">
      <Icon name={icon} />
      <p role="alert">{message}</p>
      {rating && (
        <div className="rate-done">
          <StarsDisplay score={rating.score} />
          {rating.comment && <p className="rate-done-comment">«{rating.comment}»</p>}
        </div>
      )}
      <Link to="/mis-solicitudes" className="button-secondary">
        Volver a Mis solicitudes
      </Link>
    </div>
  );
}

// Valorar un alquiler finalizado (US-08.01, #296): el arrendatario llega desde «Mis solicitudes»,
// elige de 1 a 5 estrellas, escribe un comentario si quiere y publica.
export function RateReservationPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { session, clearSession } = useAuth();
  const token = session?.token;
  const commentId = useId();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const firstStarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    getMyReservations(token)
      .then(({ sent }) => {
        if (ignore) return;
        // US-08.01: valora quien hizo la solicitud. Las recibidas son de US-08.02.
        const found = sent.find((candidate) => candidate.id === id);
        if (!found) {
          setBlocked({ icon: 'search_off', message: NOT_FOUND });
          return;
        }
        const reason = blockedFor(found);
        if (reason) setBlocked(reason);
        else setReservation(found);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !reservation || submitting) return;
    setFormError(null);

    // Criterios 4 y 5: sin puntuación no se publica y se indica en ese campo.
    if (score === null) {
      setScoreError(NO_SCORE);
      firstStarRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await rateReservation(token, reservation.id, { score, comment: comment.trim() });
      navigate('/mis-solicitudes', { state: { notice: RATING_DONE } });
    } catch (requestError: unknown) {
      // Síncrono: las estrellas tienen que estar activas otra vez para poder recibir el foco.
      flushSync(() => setSubmitting(false));
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
      } else if (requestError instanceof ApiError && requestError.field === 'score') {
        setScoreError(requestError.message);
        firstStarRef.current?.focus();
      } else if (requestError instanceof ApiError && requestError.field === 'comment') {
        setCommentError(requestError.message);
      } else if (
        requestError instanceof ApiError &&
        [403, 404, 409].includes(requestError.status)
      ) {
        // Ya valorado (otra pestaña), no finalizado o ajeno: no tiene sentido reintentarlo. El check
        // solo cuando ya estaba valorado; el 409 de «no finalizado» lleva el de información.
        setBlocked({
          icon: requestError.message === ALREADY_RATED ? 'check_circle' : 'info',
          message: requestError.message,
        });
      } else if (requestError instanceof ApiError) {
        setFormError(requestError.message);
      } else {
        setFormError('Ha ocurrido un error inesperado.');
      }
    }
  }

  let content;
  if (loadError) {
    content = (
      <p role="alert" className="form-error manage-notice">
        <Icon name="error" />
        {loadError}
      </p>
    );
  } else if (blocked) {
    content = <BlockedState {...blocked} />;
  } else if (!reservation) {
    content = (
      <>
        <p role="status" className="manage-visually-hidden">
          Cargando el alquiler…
        </p>
        <div className="skeleton rate-skeleton" aria-hidden="true" />
      </>
    );
  } else {
    const hintId = `${commentId}-hint`;
    const errorId = `${commentId}-error`;
    content = (
      <div className="card rate-card">
        <RentalSummary reservation={reservation} />
        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          <StarRating
            value={score}
            onChange={(newScore) => {
              setScore(newScore);
              setScoreError(null);
            }}
            error={scoreError}
            disabled={submitting}
            firstStarRef={firstStarRef}
          />
          <div className="form-field">
            <label htmlFor={commentId}>Comentario (opcional)</label>
            <textarea
              id={commentId}
              name="comment"
              rows={5}
              maxLength={COMMENT_MAX}
              value={comment}
              disabled={submitting}
              placeholder="¿Qué tal ha ido? El objeto, la entrega, el trato…"
              onChange={(event) => {
                setComment(event.target.value);
                setCommentError(null);
              }}
              aria-invalid={commentError ? true : undefined}
              aria-describedby={commentError ? `${hintId} ${errorId}` : hintId}
            />
            <p id={hintId} className="field-hint">
              Lo verán otras personas en el perfil de {reservation.owner.username}. Hasta{' '}
              {COMMENT_MAX} caracteres ({comment.length}/{COMMENT_MAX}).
            </p>
            {commentError && (
              <p id={errorId} className="field-error">
                {commentError}
              </p>
            )}
          </div>
          {formError && (
            <p role="alert" className="form-error rate-error">
              <Icon name="error" size="1.125rem" />
              {formError}
            </p>
          )}
          <div className="form-actions rate-actions">
            <button type="submit" className="button-primary" disabled={submitting}>
              {submitting ? 'Publicando…' : 'Publicar'}
            </button>
            <Link to="/mis-solicitudes" className="button-secondary">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    );
  }

  return (
    <section className="rate-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Valorar el alquiler</h1>
          <p className="page-subtitle">Cuenta tu experiencia para ayudar a otras personas.</p>
        </div>
      </div>
      {content}
    </section>
  );
}
