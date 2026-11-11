// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
// Canal SSE de tiempo real (ADR 0004): un stream por pestaña con todos los eventos del usuario.
import type { RequestHandler } from 'express';
import {
  subscribe,
  type RealtimeMessage,
} from '../services/realtimeService.js';
import { findValidSession } from '../services/sessionService.js';

export const HEARTBEAT_MS = 15_000;
export const SESSION_CHECK_MS = 60_000;
const RETRY_MS = 1_000;

function formatEvent({ id, type, data }: RealtimeMessage): string {
  return `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Los intervalos se pueden cambiar para que los tests no esperen 15 ni 60 s.
export function createEventStreamHandler(
  options: {
    heartbeatMs?: number;
    sessionCheckMs?: number;
  } = {},
): RequestHandler {
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const sessionCheckMs = options.sessionCheckMs ?? SESSION_CHECK_MS;

  return (request, response) => {
    // requireAuth garantiza que request.auth existe.
    const { userId, sessionId } = request.auth!;
    const lastEventId = request.get('last-event-id') || undefined;

    response.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Token en bruto solo para revisar la sesión con findValidSession (AGENTS.md: una única forma
    // de validarla). Vive en esta clausura: no se registra ni se envía a ningún sitio.
    const token = request.get('authorization')?.split(' ')[1] ?? '';
    response.flushHeaders();
    response.write(`retry: ${RETRY_MS}\n\n`);

    let closed = false;
    let heartbeat: NodeJS.Timeout | undefined;
    let sessionCheck: NodeJS.Timeout | undefined;
    let unsubscribe: (() => void) | undefined;

    // Puede llamarse durante el replay de `subscribe`, antes de que existan la baja y los timers.
    const finish = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      clearInterval(sessionCheck);
      unsubscribe?.();
      if (!response.writableEnded) response.end();
    };

    unsubscribe = subscribe(
      userId,
      sessionId,
      (message) => {
        if (closed) return;
        response.write(formatEvent(message));
      },
      lastEventId,
      finish,
    );

    if (closed) {
      unsubscribe();
      return;
    }

    heartbeat = setInterval(() => {
      if (!closed) response.write(': ping\n\n');
    }, heartbeatMs);

    // El logout ya cierra el stream; esto cubre sesiones caducadas o revocadas por otra vía.
    sessionCheck = setInterval(() => {
      void findValidSession(token)
        .then((session) => {
          if (session?.id !== sessionId) finish();
        })
        .catch(() => {
          // Si la BD falla no se corta el stream: se vuelve a comprobar en el siguiente ciclo.
        });
    }, sessionCheckMs);

    request.on('close', finish);
  };
}

export const streamEvents = createEventStreamHandler();
