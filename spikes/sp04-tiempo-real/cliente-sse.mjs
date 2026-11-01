// SP-04 (#93) · Cliente SSE con fetch: manda «Authorization: Bearer», reconecta solo y usa Last-Event-ID.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026
//
// Por qué no usamos `EventSource`: el EventSource del navegador NO permite cabeceras, así que no podría
// mandar nuestro token Bearer (ADR 0001) y habría que ponerlo en la URL, donde acaba en logs e historial.
// Con fetch + ReadableStream sí se puede, y este mismo código funciona en Node 22 y en el navegador
// (es lo que usa demo.html). En el frontend real iría en `frontend/src/services/`.

// Lee un stream SSE y llama a onEvent({ id, event, data }) por cada evento completo.
async function readSse(body, onEvent, onRetry) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let current = { id: undefined, event: 'message', data: [] };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line === '') {
        // Línea vacía = fin del evento.
        if (current.data.length > 0) onEvent({ id: current.id, event: current.event, data: current.data.join('\n') });
        current = { id: undefined, event: 'message', data: [] };
        continue;
      }
      if (line.startsWith(':')) continue; // comentario (heartbeat «: ping»)
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const text = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'id') current.id = text;
      else if (field === 'event') current.event = text;
      else if (field === 'data') current.data.push(text);
      else if (field === 'retry' && /^\d+$/.test(text)) onRetry(Number(text));
    }
  }
}

/**
 * Abre el canal de eventos del usuario y lo mantiene abierto.
 * - Reconecta solo (espera `retry` del servidor y, si falla, backoff exponencial hasta 30 s).
 * - En cada reconexión manda Last-Event-ID para recuperar lo que se perdió.
 * - Con un 401 NO reintenta: la sesión no es válida (habría que volver al login).
 */
export function connectEvents({ baseUrl, token, onEvent, onStatus = () => {}, lastEventId }) {
  let controller = new AbortController();
  let closed = false;
  let retryMs = 1_000;
  let failures = 0;
  const state = { lastEventId };

  async function run() {
    while (!closed) {
      try {
        const headers = { Accept: 'text/event-stream' };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (state.lastEventId) headers['Last-Event-ID'] = state.lastEventId;
        const res = await fetch(`${baseUrl}/api/eventos/stream`, { headers, signal: controller.signal });
        if (res.status === 401) {
          onStatus({ type: 'unauthorized', status: 401 });
          return;
        }
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        failures = 0;
        onStatus({ type: 'open' });
        await readSse(
          res.body,
          (evt) => {
            if (evt.id) state.lastEventId = evt.id;
            onEvent(evt);
          },
          (ms) => (retryMs = ms),
        );
        onStatus({ type: 'closed-by-server' }); // redespliegue, reinicio o corte de red
      } catch (error) {
        if (closed) return;
        failures++;
        onStatus({ type: 'error', message: error.message });
      }
      if (closed) return;
      const wait = failures === 0 ? retryMs : Math.min(retryMs * 2 ** failures, 30_000);
      await new Promise((resolve) => setTimeout(resolve, wait));
      controller = new AbortController();
    }
  }

  const done = run();
  return {
    get lastEventId() {
      return state.lastEventId;
    },
    done,
    close() {
      closed = true;
      controller.abort();
      return done.catch(() => {});
    },
  };
}
