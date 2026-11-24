// Generado con asistencia de IA (Claude)
import { API_URL } from './apiClient';

// Cliente del canal de tiempo real (SSE, ADR 0004 y docs/arquitectura.md). Usa fetch + ReadableStream
// en lugar de EventSource porque EventSource no deja mandar la cabecera Authorization, y el token
// nunca va en la URL. El canal solo avisa: quien lo usa vuelve a pedir los datos por REST.

export type StreamEvent = { id: string | null; type: string; data: unknown };

export type EventStreamHandlers = {
  onEvent: (event: StreamEvent) => void;
  // El canal se ha abierto (también al reconectar).
  onOpen?: () => void;
  // No se ha podido abrir o se ha cortado. Lleva la cuenta de fallos seguidos.
  onFailure?: (consecutiveFailures: number) => void;
  // 401: la sesión ya no vale. No se reintenta.
  onUnauthorized?: () => void;
};

// Lo que pide el servidor con «retry: 1000». Si falla varias veces seguidas, se espera algo más.
const DEFAULT_RETRY_MS = 1000;
const MAX_RETRY_MS = 5000;

function parseData(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// Lee el texto del stream por trozos y avisa de cada evento completo (bloques separados por una
// línea en blanco). Las líneas que empiezan por «:» son comentarios (el «: ping» del heartbeat).
export function createSseParser(onEvent: (event: StreamEvent) => void) {
  let buffer = '';
  let retryMs: number | null = null;

  function dispatch(block: string) {
    let id: string | null = null;
    let type = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'id') id = value;
      else if (field === 'event') type = value;
      else if (field === 'data') data.push(value);
      else if (field === 'retry' && /^\d+$/.test(value)) retryMs = Number(value);
    }
    if (data.length > 0) onEvent({ id, type, data: parseData(data.join('\n')) });
  }

  return {
    push(text: string) {
      buffer += text.replace(/\r\n?/g, '\n');
      let end = buffer.indexOf('\n\n');
      while (end !== -1) {
        dispatch(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf('\n\n');
      }
    },
    get retryMs() {
      return retryMs;
    },
  };
}

// Abre el canal y lo mantiene abierto, reconectando con Last-Event-ID para no perder eventos.
// Devuelve la función que lo cierra.
export function openEventStream(token: string, handlers: EventStreamHandlers): () => void {
  let closed = false;
  let failures = 0;
  let lastEventId: string | null = null;
  let serverRetryMs = DEFAULT_RETRY_MS;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleReconnect() {
    if (closed) return;
    failures += 1;
    handlers.onFailure?.(failures);
    const delay = Math.min(serverRetryMs * failures, MAX_RETRY_MS);
    retryTimer = setTimeout(() => void connect(), delay);
  }

  async function connect() {
    if (closed) return;
    controller = new AbortController();
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    };
    if (lastEventId) headers['Last-Event-ID'] = lastEventId;

    let response: Response;
    try {
      response = await fetch(`${API_URL}/eventos/stream`, { headers, signal: controller.signal });
    } catch {
      scheduleReconnect();
      return;
    }
    if (closed) return;
    if (response.status === 401) {
      handlers.onUnauthorized?.();
      return;
    }
    if (!response.ok || !response.body) {
      scheduleReconnect();
      return;
    }

    failures = 0;
    handlers.onOpen?.();
    const parser = createSseParser((event) => {
      if (event.id) lastEventId = event.id;
      if (!closed) handlers.onEvent(event);
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || closed) break;
        parser.push(decoder.decode(value, { stream: true }));
        if (parser.retryMs !== null) serverRetryMs = parser.retryMs;
      }
    } catch {
      // Corte de red o cierre: se reconecta abajo.
    }
    if (!closed) scheduleReconnect();
  }

  void connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    controller?.abort();
  };
}
