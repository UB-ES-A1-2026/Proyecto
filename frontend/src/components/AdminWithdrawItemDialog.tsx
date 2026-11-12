// Generado con asistencia de IA (Claude)
import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';
import {
  adminWithdrawItem,
  WITHDRAW_REASONS,
  type AdminWithdrawReason,
} from '../services/adminItemService';
import { ApiError } from '../services/apiClient';
import { Icon } from './Icon';
import { Modal } from './Modal';

const DETAILS_MAX_LENGTH = 500;

type AdminWithdrawItemDialogProps = {
  item: { id: string; title: string };
  onClose: () => void;
  onWithdrawn: () => void;
};

// El admin retira un anuncio que incumple las normas (una estafa, un objeto prohibido…).
export function AdminWithdrawItemDialog({
  item,
  onClose,
  onWithdrawn,
}: AdminWithdrawItemDialogProps) {
  const { session, clearSession } = useAuth();
  const detailsId = useId();
  const [reason, setReason] = useState<AdminWithdrawReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needsDetails = reason === 'other' && details.trim() === '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !session) return;
    if (!reason) {
      setError('Elige el motivo por el que retiras el anuncio.');
      return;
    }
    if (needsDetails) {
      setError('Explica el motivo en los detalles.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await adminWithdrawItem(session.token, item.id, reason, details.trim());
      onWithdrawn();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
        return;
      }
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Ha ocurrido un error inesperado.',
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Retirar anuncio" onClose={onClose}>
      <form className="admin-withdraw-form" onSubmit={handleSubmit} noValidate>
        <div className="withdraw-notice">
          <span className="withdraw-notice-icon">
            <Icon name="warning" size="1.5rem" />
          </span>
          <div>
            <p className="withdraw-notice-question">¿Retirar «{item.title}» de Rentit?</p>
            <p className="withdraw-notice-text">
              Dejará de aparecer en las búsquedas y nadie podrá alquilarlo. El propietario recibirá
              un aviso con el motivo. No se puede deshacer.
            </p>
          </div>
        </div>

        <fieldset className="admin-reasons">
          <legend>Motivo</legend>
          {WITHDRAW_REASONS.map((option) => (
            <label key={option.value} className="admin-reason">
              <input
                type="radio"
                name="reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
              />
              <span>
                <span className="admin-reason-label">{option.label}</span>
                <span className="admin-reason-hint">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="form-field">
          <label htmlFor={detailsId}>
            Detalles {reason === 'other' ? '(obligatorio)' : '(opcional)'}
          </label>
          <textarea
            id={detailsId}
            value={details}
            rows={3}
            maxLength={DETAILS_MAX_LENGTH}
            onChange={(event) => setDetails(event.target.value)}
            aria-describedby={`${detailsId}-hint`}
          />
          <p id={`${detailsId}-hint`} className="field-hint">
            Lo leerá el propietario. Hasta {DETAILS_MAX_LENGTH} caracteres.
          </p>
        </div>

        {/* Junto a los botones: la ventana puede tener scroll y el aviso de arriba no se vería. */}
        {error && (
          <p role="alert" className="form-error manage-notice">
            <Icon name="error" />
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="submit" className="button-danger" disabled={submitting}>
            {submitting ? 'Retirando…' : 'Retirar anuncio'}
          </button>
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
