// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 03/11/2026
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  // Mientras se procesa algo que no se puede deshacer: «×», Esc y el fondo no cierran (#309).
  closeDisabled?: boolean;
};

// Ventana modal con el <dialog> nativo: el navegador mantiene el foco dentro y bloquea el fondo.
// Se abre al montarse; quien la usa la cierra desmontándola desde onClose.
export function Modal({ title, onClose, children, closeDisabled = false }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    // Al cerrar, el foco vuelve al botón que abrió la ventana.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();

    return () => {
      if (dialog?.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={titleId}
      // Esc: lo cierra React (desmontando) en lugar del navegador, para no desincronizar el estado.
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
      // Clic en el fondo oscuro, fuera del contenido.
      onClick={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Cerrar ventana"
            disabled={closeDisabled}
            onClick={onClose}
          >
            <Icon name="close" size="1.375rem" />
          </button>
        </div>
        {/* Si el contenido es alto hace scroll aquí: la cabecera se queda siempre a la vista. */}
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  );
}
