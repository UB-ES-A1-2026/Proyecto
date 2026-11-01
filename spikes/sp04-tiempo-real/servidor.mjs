// SP-04 (#93) · Servidor mínimo de tiempo real con Server-Sent Events (SSE), sin dependencias.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026
//
// Imita lo que haría el backend de Rentit (ADR 0004), pero con node:http y datos en memoria:
//   - Las ESCRITURAS siguen siendo REST normal (PATCH del estado de la entrega, POST de un mensaje),
//     con su token Bearer, sus permisos y sus reglas, como cualquier otro endpoint.
//   - Después de guardar, el «service» publica un evento en un bus en memoria (EventEmitter).
//   - GET /api/eventos/stream es UN canal SSE por pestaña y usuario: recibe solo los eventos
//     de las entregas y conversaciones en las que participa (se filtra en el servidor).
//   - Cada evento lleva un id «<arranque>-<secuencia>». Al reconectar, el cliente manda Last-Event-ID
//     y el servidor le reenvía lo que se perdió. Si el servidor se ha reiniciado (otro arranque),
//     le manda «resync» y el cliente recarga por REST (la BD es la fuente de verdad).
// NO es código de producción: no hay Express, ni Prisma, ni tabla `sesion`.
import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const HEARTBEAT_MS = 15_000; // comentario «: ping» para que ningún proxy cierre la conexión por inactividad
const RETRY_MS = 1_000; // «retry:» que se le sugiere al cliente para reconectar
const MAX_LOG = 500; // eventos recientes que se guardan para poder reenviarlos (solo en memoria)
const DELIVERY_STATES = ['pendiente', 'asignada', 'recogida', 'en_camino', 'entregada'];

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// Tokens de prueba del prototipo (no son secretos: solo existen en este script).
export const TEST_TOKENS = {
  ana: 'token-de-prueba-ana', // arrendataria
  carla: 'token-de-prueba-carla', // propietaria
  rider: 'token-de-prueba-rider', // rider asignado
  intruso: 'token-de-prueba-intruso', // sesión válida, pero no participa en nada
};

// «Base de datos» en memoria. Se pasa desde fuera para que sobreviva a un reinicio del servidor,
// igual que PostgreSQL sobrevive a un redespliegue de Render.
export function createStore() {
  const sessions = new Map(Object.entries(TEST_TOKENS).map(([userId, token]) => [hashToken(token), userId]));
  return {
    sessions, // token_hash → usuario (como la tabla `sesion`)
    deliveries: new Map([
      ['e1', { id: 'e1', estado: 'asignada', codigoEntrega: '4821', arrendatario: 'ana', propietario: 'carla', rider: 'rider' }],
    ]),
    conversations: new Map([['c1', { id: 'c1', usuarios: ['ana', 'carla'] }]]),
    messages: [], // { seq, id, conversacionId, autor, contenido, enviadoEn }
    messageSeq: 0, // en la BD real sería el cursor (enviado_en, id)
  };
}

// El código de entrega nunca sale por la API ni por los eventos (lo conoce solo el arrendatario en la BD real).
function toPublicDelivery({ codigoEntrega, ...rest }) {
  return rest;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

export async function startServer({ port = 0, store = createStore() } = {}) {
  const bootId = randomBytes(4).toString('hex'); // cambia en cada arranque (redespliegue o despertar de Render)
  const bus = new EventEmitter(); // con una sola instancia basta; con varias haría falta Postgres LISTEN/NOTIFY o Redis
  bus.setMaxListeners(0);
  const log = []; // últimos eventos: { seq, users, event, data }
  let seq = 0;
  const openStreams = new Set();

  // Lo que haría un service tras guardar en la BD: publicar a quién le interesa el cambio.
  function publish(users, event, data) {
    const entry = { seq: ++seq, users: new Set(users), event, data };
    log.push(entry);
    if (log.length > MAX_LOG) log.shift();
    bus.emit('event', entry);
  }

  // Equivalente a requireAuth + findValidSession: Authorization: Bearer <token> → usuario.
  function authenticate(req) {
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) return null;
    return store.sessions.get(hashToken(token)) ?? null;
  }

  function writeEvent(res, entry) {
    res.write(`id: ${bootId}-${entry.seq}\nevent: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`);
  }

  function handleStream(req, res, userId) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform', // que nadie lo guarde ni lo comprima por bloques
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // desactiva el buffer de proxies tipo nginx
    });
    res.write(`retry: ${RETRY_MS}\n: conectado como ${userId}\n\n`);

    // Reconexión: reenviar lo perdido o pedir un «resync» si el servidor ya no lo tiene.
    const lastEventId = req.headers['last-event-id'];
    if (lastEventId) {
      const [lastBoot, lastSeqText] = String(lastEventId).split('-');
      const lastSeq = Number(lastSeqText);
      const oldest = log[0]?.seq ?? seq + 1;
      if (lastBoot !== bootId || !Number.isInteger(lastSeq) || lastSeq < oldest - 1) {
        res.write(`id: ${bootId}-${seq}\nevent: resync\ndata: {"motivo":"El servidor se ha reiniciado: recarga por REST"}\n\n`);
      } else {
        for (const entry of log) if (entry.seq > lastSeq && entry.users.has(userId)) writeEvent(res, entry);
      }
    }

    const onEvent = (entry) => {
      if (entry.users.has(userId)) writeEvent(res, entry); // filtro de permisos en el servidor
    };
    bus.on('event', onEvent);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    const stream = { res, cleanup: () => { clearInterval(heartbeat); bus.off('event', onEvent); } };
    openStreams.add(stream);
    req.on('close', () => {
      stream.cleanup();
      openStreams.delete(stream);
    });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    // Página de demo opcional (dos pestañas): mismo origen, así no hace falta CORS.
    const staticFiles = { '/': ['demo.html', 'text/html'], '/cliente-sse.mjs': ['cliente-sse.mjs', 'text/javascript'] };
    if (req.method === 'GET' && staticFiles[url.pathname]) {
      const [file, type] = staticFiles[url.pathname];
      const content = await readFile(fileURLToPath(new URL(`./${file}`, import.meta.url)));
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      return res.end(content);
    }

    const userId = authenticate(req);
    if (!userId) return sendJson(res, 401, { error: 'Sesión no válida o caducada. Inicia sesión de nuevo.' });

    // GET /api/eventos/stream → canal SSE del usuario
    if (req.method === 'GET' && url.pathname === '/api/eventos/stream') return handleStream(req, res, userId);

    // /api/entregas/:id y /api/entregas/:id/estado
    if (parts[0] === 'api' && parts[1] === 'entregas' && parts[2]) {
      const delivery = store.deliveries.get(parts[2]);
      const participants = delivery ? [delivery.arrendatario, delivery.propietario, delivery.rider] : [];
      if (!delivery || !participants.includes(userId)) return sendJson(res, 404, { error: 'Entrega no encontrada.' });
      // GET: estado actual (lo usa el polling y la recarga tras un «resync»).
      if (req.method === 'GET' && parts.length === 3) return sendJson(res, 200, toPublicDelivery(delivery));

      // PATCH: el rider avanza el estado, solo al siguiente (criterio de US-05.02).
      if (req.method === 'PATCH' && parts[3] === 'estado') {
        if (userId !== delivery.rider) return sendJson(res, 403, { error: 'Solo el rider puede cambiar el estado.' });
        const body = await readJson(req);
        const next = DELIVERY_STATES[DELIVERY_STATES.indexOf(delivery.estado) + 1];
        if (!body || body.estado !== next) {
          return sendJson(res, 409, { error: `El siguiente estado es «${next ?? 'ninguno'}».`, field: 'estado' });
        }
        if (next === 'entregada' && body.codigo !== delivery.codigoEntrega) {
          return sendJson(res, 400, { error: 'El código de entrega no es correcto.', field: 'codigo' });
        }
        delivery.estado = next;
        delivery.actualizadoEn = new Date().toISOString();
        const data = toPublicDelivery(delivery);
        publish(participants, 'entrega.estado', data);
        return sendJson(res, 200, data);
      }
    }

    // /api/conversaciones/:id/mensajes
    if (parts[0] === 'api' && parts[1] === 'conversaciones' && parts[3] === 'mensajes') {
      const conversation = store.conversations.get(parts[2]);
      if (!conversation || !conversation.usuarios.includes(userId)) {
        return sendJson(res, 404, { error: 'Conversación no encontrada.' });
      }
      // GET ?despues=<cursor>: mensajes nuevos desde el cursor (polling y recarga tras «resync»).
      if (req.method === 'GET') {
        const after = Number(url.searchParams.get('despues') ?? 0);
        return sendJson(res, 200, store.messages.filter((m) => m.conversacionId === conversation.id && m.seq > after));
      }
      if (req.method === 'POST') {
        const body = await readJson(req);
        const contenido = typeof body?.contenido === 'string' ? body.contenido.trim() : '';
        if (!contenido || contenido.length > 2000) {
          return sendJson(res, 400, { error: 'El mensaje no puede estar vacío ni pasar de 2000 caracteres.', field: 'contenido' });
        }
        const message = {
          seq: ++store.messageSeq,
          id: randomBytes(8).toString('hex'),
          conversacionId: conversation.id,
          autor: userId,
          contenido,
          enviadoEn: new Date().toISOString(),
        };
        store.messages.push(message);
        publish(conversation.usuarios, 'mensaje.nuevo', message); // también al autor, por si tiene otra pestaña
        return sendJson(res, 201, message);
      }
    }

    return sendJson(res, 404, { error: 'Ruta no encontrada.' });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => sendJson(res, 500, { error: `Error interno: ${error.message}` }));
  });
  server.keepAliveTimeout = 5_000;
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: realPort } = server.address();

  return {
    url: `http://127.0.0.1:${realPort}`,
    bootId,
    openStreams: () => openStreams.size,
    // Cierre ordenado (lo que haríamos con el SIGTERM de Render): se cierran los streams y el cliente reconecta.
    close: () =>
      new Promise((resolve) => {
        for (const stream of openStreams) {
          stream.cleanup();
          stream.res.end();
        }
        openStreams.clear();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

// `npm run demo`: arranca el servidor para abrir demo.html en dos pestañas.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 49393);
  const server = await startServer({ port });
  console.log(`Demo de SP-04 en ${server.url}/ (abre dos pestañas: una como «rider» y otra como «ana»). Ctrl+C para parar.`);
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}
