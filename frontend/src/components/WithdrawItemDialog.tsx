import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { ApiError } from '../services/apiClient';
import { changeItemStatus } from '../services/itemService';
import { Modal } from './Modal';

type WithdrawItemDialogProps = {
  item: { id: string; title: string };
  onClose: () => void;
  onWithdrawn: (id: string) => void;
};

// Confirmación de «Retirar anuncio» (US-02.03, #111). Cancelar no cambia nada (criterio 3).
export function WithdrawItemDialog({ item, onClose, onWithdrawn }: WithdrawItemDialogProps) {
  const { session, clearSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (submitting || !session) return;

    setSubmitting(true);
    setError(null);
    try {
      await changeItemStatus(session.token, item.id, 'withdrawn');
      onWithdrawn(item.id);
    } catch (requestError) {
      // Sesión caducada o revocada: al borrarla, PrivateRoute lleva al login.
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSession();
        return;
      }
      // El backend (#110) no deja retirar un objeto con reservas activas.
      if (requestError instanceof ApiError && requestError.status === 409) {
        setError('No puedes retirar este anuncio porque tiene reservas activas.');
      } else if (requestError instanceof ApiError) {
        setError(requestError.message);
      } else {
        setError('Ha ocurrido un error inesperado.');
      }
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Retirar anuncio" onClose={onClose}>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <p>
        ¿Seguro que quieres retirar «{item.title}»? Dejará de aparecer para los demás usuarios y
        nadie podrá solicitar su alquiler.
      </p>
      <div className="form-actions">
        <button
          type="button"
          className="button-danger"
          disabled={submitting}
          onClick={handleConfirm}
        >
          {submitting ? 'Retirando…' : 'Retirar anuncio'}
        </button>
        <button type="button" className="button-secondary" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
