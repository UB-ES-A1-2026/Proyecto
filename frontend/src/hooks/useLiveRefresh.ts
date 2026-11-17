// Generado con asistencia de IA (Claude)
import { useEffect, useRef, useState } from 'react';
import { openEventStream, type StreamEvent } from '../services/eventStreamService';

// Cómo llegan los cambios: al momento por el canal, o consultando cada 5 s si el canal falla.
export type LiveStatus = 'connecting' | 'live' | 'polling';

// Tras 3 fallos seguidos del canal se pasa a consultar por REST (wireframe de US-05.02, pantalla 10).
export const MAX_STREAM_FAILURES = 3;
export const POLLING_INTERVAL_MS = 5000;

type LiveRefreshOptions = {
  token: string | undefined;
  // Vuelve a pedir los datos por REST.
  refresh: () => void;
  // Si un evento del canal afecta a lo que se está mirando.
  isRelevant: (event: StreamEvent) => boolean;
  onUnauthorized: () => void;
  // Para dejar de escuchar cuando ya no puede cambiar nada (p. ej. alquiler finalizado).
  enabled?: boolean;
};

// Mantiene al día una pantalla con el canal de tiempo real (#289). Ante un evento que le afecta o un
// `resync` (el servidor ha perdido la cuenta de los eventos), recarga por REST: la BD manda.
export function useLiveRefresh({
  token,
  refresh,
  isRelevant,
  onUnauthorized,
  enabled = true,
}: LiveRefreshOptions): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  // Las funciones cambian en cada render; el canal no se tiene que reabrir por eso.
  const callbacks = useRef({ refresh, isRelevant, onUnauthorized });
  useEffect(() => {
    callbacks.current = { refresh, isRelevant, onUnauthorized };
  });

  useEffect(() => {
    if (!token || !enabled) return;
    const close = openEventStream(token, {
      onOpen: () => setStatus('live'),
      onFailure: (failures) => {
        if (failures >= MAX_STREAM_FAILURES) setStatus('polling');
      },
      onUnauthorized: () => callbacks.current.onUnauthorized(),
      onEvent: (event) => {
        if (event.type === 'resync' || callbacks.current.isRelevant(event)) {
          callbacks.current.refresh();
        }
      },
    });
    return () => {
      close();
      setStatus('connecting');
    };
  }, [token, enabled]);

  useEffect(() => {
    if (status !== 'polling' || !enabled) return;
    const timer = setInterval(() => callbacks.current.refresh(), POLLING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status, enabled]);

  return enabled ? status : 'connecting';
}
