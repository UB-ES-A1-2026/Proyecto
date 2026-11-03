// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import {
  acceptReservation,
  rejectReservation,
  type DecidedReservation,
} from '../services/reservationDecisionService';

type Decision = 'accept' | 'reject';

type ReservationDecisionProps = {
  reservationId: string;
  status: string;
  onDecided: (updated: DecidedReservation) => void;
};

export function ReservationDecision({
  reservationId,
  status,
  onDecided,
}: ReservationDecisionProps) {
  const { session, clearSession } = useAuth();
  const [submitting, setSubmitting] = useState<Decision | null>(null);
  const [completed, setCompleted] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState(false);

  if (!session) return null;
  if (status !== 'pending' && completed === null) return null;
  const token = session.token;

  async function decide(decision: Decision) {
    setSubmitting(decision);
    setError(null);

    try {
      const updated =
        decision === 'accept'
          ? await acceptReservation(token, reservationId)
          : await rejectReservation(token, reservationId);
      setCompleted(decision);
      onDecided(updated);
    } catch (requestError: unknown) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
        return;
      }

      if (requestError instanceof ApiError) {
        setError(requestError.message);
        setTerminalError([403, 404, 409].includes(requestError.status));
      } else {
        setError('Ha ocurrido un error inesperado.');
        setTerminalError(false);
      }
    } finally {
      setSubmitting(null);
    }
  }

  if (completed !== null) {
    return (
      <p className="reservation-decision-message" role="status">
        {completed === 'accept' ? 'Has aceptado la solicitud.' : 'Has rechazado la solicitud.'}
      </p>
    );
  }

  return (
    <div className="reservation-decision">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!terminalError && (
        <div className="reservation-decision-actions">
          <button
            className="button-primary"
            type="button"
            disabled={submitting !== null}
            onClick={() => void decide('accept')}
          >
            {submitting === 'accept' ? 'Aceptando…' : 'Aceptar'}
          </button>
          <button
            className="button-secondary"
            type="button"
            disabled={submitting !== null}
            onClick={() => void decide('reject')}
          >
            {submitting === 'reject' ? 'Rechazando…' : 'Rechazar'}
          </button>
        </div>
      )}
    </div>
  );
}
