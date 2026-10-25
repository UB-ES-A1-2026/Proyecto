// SP-04 (#93) · Prototipo: un cambio en un cliente llega a otro en menos de 10 s (y en menos de 1 s con SSE).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026
//
// Simula dos historias: US-05.02 (el rider avanza el estado de la entrega y la arrendataria lo ve)
// y US-06.01 (la propietaria envía un mensaje y la arrendataria lo recibe). Comprueba también:
//   - que sin token, o con un token inválido, no se recibe nada (401);
//   - que un usuario con sesión válida que no participa no recibe los eventos de otros;
//   - que al reconectar se recupera lo perdido (Last-Event-ID) y que, si el servidor se reinicia
//     (redespliegue o «despertar» de Render), el cliente recibe «resync» y recarga por REST;
//   - y lo compara con polling cada 3 s.
// Sale con código 1 si algo no se cumple. Sin dependencias: solo Node 22.
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { connectEvents } from './cliente-sse.mjs';
import { TEST_TOKENS, createStore, startServer } from './servidor.mjs';

const PUSH_LIMIT_MS = 1_000; // objetivo para SSE
const ACCEPTANCE_LIMIT_MS = 10_000; // criterio del issue y de US-05.02
const POLL_INTERVAL_MS = 3_000;

const checks = [];
function check(ok, text) {
  checks.push({ ok, text });
  return ok ? '✔' : '✘';
}
const ms = (value) => `${value.toFixed(0)} ms`;

// Cliente de prueba: guarda los eventos que recibe y permite esperar a uno concreto.
function createTestClient(name, baseUrl, token, lastEventId) {
  const events = [];
  const statuses = [];
  const listeners = new Set();
  const connection = connectEvents({
    baseUrl,
    token,
    lastEventId,
    onEvent: (evt) => {
      const item = { ...evt, at: performance.now(), json: JSON.parse(evt.data) };
      events.push(item);
      for (const listener of listeners) listener();
    },
    onStatus: (status) => {
      statuses.push({ ...status, at: performance.now() });
      for (const listener of listeners) listener();
    },
  });
  const waitUntil = (predicate, timeoutMs, label) =>
    new Promise((resolve, reject) => {
      const tryNow = () => {
        const found = predicate();
        if (found) {
          listeners.delete(tryNow);
          clearTimeout(timer);
          resolve(found);
        }
      };
      const timer = setTimeout(() => {
        listeners.delete(tryNow);
        reject(new Error(`${name}: no ha llegado «${label}» en ${timeoutMs} ms`));
      }, timeoutMs);
      listeners.add(tryNow);
      tryNow();
    });
  return {
    name,
    events,
    statuses,
    connection,
    waitOpen: (timeoutMs = 5_000, after = 0) =>
      waitUntil(() => statuses.find((s) => s.type === 'open' && s.at >= after), timeoutMs, 'conexión abierta'),
    waitEvent: (predicate, timeoutMs, label, fromIndex = 0) =>
      waitUntil(() => events.slice(fromIndex).find(predicate), timeoutMs, label),
  };
}

async function api(baseUrl, token, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

async function main() {
  const store = createStore();
  let server = await startServer({ port: Number(process.env.PORT ?? 0), store });
  const baseUrl = server.url;
  const port = new URL(baseUrl).port;
  console.log(`Servidor SSE de prueba en ${baseUrl} (arranque ${server.bootId})\n`);

  // 1. Sin token y con un token inválido: 401 y ningún evento.
  const noToken = await fetch(`${baseUrl}/api/eventos/stream`);
  const badToken = await fetch(`${baseUrl}/api/eventos/stream`, { headers: { Authorization: 'Bearer inventado' } });
  const badClient = createTestClient('sin-sesion', baseUrl, 'inventado');
  await badClient.connection.done;
  const unauthorizedOk = noToken.status === 401 && badToken.status === 401 && badClient.events.length === 0;
  console.log(
    `1. Sin token → HTTP ${noToken.status}; token inválido → HTTP ${badToken.status}; ` +
      `el cliente deja de reintentar (${badClient.statuses.at(-1)?.type}) y ha recibido ${badClient.events.length} eventos ${check(unauthorizedOk, 'sin token no se recibe nada')}`,
  );

  // 2. Se conectan la arrendataria (cliente B), la propietaria y un usuario que no participa.
  const ana = createTestClient('ana', baseUrl, TEST_TOKENS.ana);
  const carla = createTestClient('carla', baseUrl, TEST_TOKENS.carla);
  const intruso = createTestClient('intruso', baseUrl, TEST_TOKENS.intruso);
  await Promise.all([ana.waitOpen(), carla.waitOpen(), intruso.waitOpen()]);
  console.log(`2. Conectados por SSE: ana (arrendataria), carla (propietaria) e intruso (sesión válida, no participa) → ${server.openStreams()} streams abiertos`);

  // 3. US-05.02: el rider (cliente A) pasa la entrega de «asignada» a «recogida».
  let start = performance.now();
  const patch1 = await api(baseUrl, TEST_TOKENS.rider, 'PATCH', '/api/entregas/e1/estado', { estado: 'recogida' });
  const evt1 = await ana.waitEvent((e) => e.event === 'entrega.estado' && e.json.estado === 'recogida', ACCEPTANCE_LIMIT_MS, 'recogida');
  await carla.waitEvent((e) => e.event === 'entrega.estado' && e.json.estado === 'recogida', ACCEPTANCE_LIMIT_MS, 'recogida');
  const latencyDelivery = evt1.at - start;
  console.log(
    `3. Rider: asignada → recogida (HTTP ${patch1.status}) · ana lo ve en ${ms(latencyDelivery)} ${check(latencyDelivery < PUSH_LIMIT_MS, 'entrega por SSE < 1 s')} (carla también)`,
  );

  // 4. US-06.01: carla envía un mensaje y ana lo recibe.
  start = performance.now();
  const post1 = await api(baseUrl, TEST_TOKENS.carla, 'POST', '/api/conversaciones/c1/mensajes', { contenido: '¿A qué hora llega el rider?' });
  const evt2 = await ana.waitEvent((e) => e.event === 'mensaje.nuevo' && e.json.id === post1.body.id, ACCEPTANCE_LIMIT_MS, 'mensaje');
  const latencyChat = evt2.at - start;
  console.log(
    `4. Carla envía «${post1.body.contenido}» (HTTP ${post1.status}) · ana lo recibe en ${ms(latencyChat)} ${check(latencyChat < PUSH_LIMIT_MS, 'chat por SSE < 1 s')}`,
  );

  // 5. El rider intenta saltarse un estado: 409 y nadie recibe nada.
  const before = ana.events.length;
  const skip = await api(baseUrl, TEST_TOKENS.rider, 'PATCH', '/api/entregas/e1/estado', { estado: 'entregada' });
  await sleep(300);
  const skipOk = skip.status === 409 && ana.events.length === before;
  console.log(`5. Rider intenta recogida → entregada: HTTP ${skip.status} «${skip.body.error}» · eventos nuevos para ana: ${ana.events.length - before} ${check(skipOk, 'no se puede saltar un estado')}`);

  // 6. Ana pierde la conexión (p. ej. bloquea el móvil); mientras tanto pasan 3 cosas. Al volver, las recupera.
  const lastId = ana.connection.lastEventId;
  await ana.connection.close();
  await sleep(100);
  await api(baseUrl, TEST_TOKENS.carla, 'POST', '/api/conversaciones/c1/mensajes', { contenido: 'Te aviso cuando salga.' });
  await api(baseUrl, TEST_TOKENS.rider, 'PATCH', '/api/entregas/e1/estado', { estado: 'en_camino' });
  await api(baseUrl, TEST_TOKENS.carla, 'POST', '/api/conversaciones/c1/mensajes', { contenido: 'Ya está en camino.' });
  start = performance.now();
  const ana2 = createTestClient('ana', baseUrl, TEST_TOKENS.ana, lastId);
  await ana2.waitEvent((e) => e.json.contenido === 'Ya está en camino.', ACCEPTANCE_LIMIT_MS, 'último mensaje perdido');
  const recovered = ana2.events.map((e) => (e.event === 'entrega.estado' ? `estado=${e.json.estado}` : `«${e.json.contenido}»`));
  const recoveredOk =
    recovered.length === 3 && recovered[0] === '«Te aviso cuando salga.»' && recovered[1] === 'estado=en_camino';
  console.log(
    `6. Ana reconecta con Last-Event-ID ${lastId} → recupera ${recovered.length} eventos en orden en ${ms(ana2.events.at(-1).at - start)}: ${recovered.join(', ')} ${check(recoveredOk, 'reconexión recupera lo perdido')}`,
  );

  // 7. El servidor se reinicia (como un redespliegue de Render: SIGTERM y arranque nuevo).
  //    La «BD» (store) se mantiene; el log en memoria de eventos, no.
  let maxSeq = Math.max(...ana2.events.filter((e) => e.event === 'mensaje.nuevo').map((e) => e.json.seq), 0);
  const indexBeforeRestart = ana2.events.length;
  const restartAt = performance.now();
  await server.close();
  await sleep(1_500);
  server = await startServer({ port: Number(port), store });
  const duringRestart = await api(baseUrl, TEST_TOKENS.carla, 'POST', '/api/conversaciones/c1/mensajes', { contenido: 'Enviado justo tras el reinicio.' });
  const resync = await ana2.waitEvent((e) => e.event === 'resync', ACCEPTANCE_LIMIT_MS, 'resync', indexBeforeRestart);
  // Tras «resync», el cliente recarga por REST desde su cursor (en la app: el hook del frontend).
  const snapshot = await api(baseUrl, TEST_TOKENS.ana, 'GET', '/api/entregas/e1');
  const missed = await api(baseUrl, TEST_TOKENS.ana, 'GET', `/api/conversaciones/c1/mensajes?despues=${maxSeq}`);
  const liveAfterResync = ana2.events.slice(indexBeforeRestart).filter((e) => e.event === 'mensaje.nuevo');
  const hasRestartMessage = [...missed.body, ...liveAfterResync.map((e) => e.json)].some((m) => m.id === duringRestart.body.id);
  const recoveredAfter = performance.now() - restartAt;
  maxSeq = Math.max(maxSeq, ...missed.body.map((m) => m.seq));
  const restartOk = hasRestartMessage && snapshot.body.estado === 'en_camino';
  console.log(
    `7. Reinicio del servidor (arranque ${server.bootId}): ana reconecta sola, recibe «resync» y recarga por REST → ` +
      `estado=${snapshot.body.estado}, ${missed.body.length} mensaje(s) nuevo(s) desde el cursor ${maxSeq - missed.body.length}; ` +
      `recuperada a los ${ms(recoveredAfter)} del corte (1,5 s de servidor caído) ${check(restartOk && recoveredAfter < ACCEPTANCE_LIMIT_MS, 'recuperación tras reinicio')}`,
  );
  await Promise.all([carla.waitOpen(10_000, restartAt), intruso.waitOpen(10_000, restartAt)]);

  // 8. El intruso no ha recibido nada de una entrega ni de una conversación ajenas, ni puede leerlas.
  const intrusoGet = await api(baseUrl, TEST_TOKENS.intruso, 'GET', '/api/entregas/e1');
  const intrusoEvents = intruso.events.filter((e) => e.event !== 'resync').length;
  const intrusoOk = intrusoEvents === 0 && intrusoGet.status === 404;
  console.log(`8. Intruso: ${intrusoEvents} eventos de otros recibidos; GET /api/entregas/e1 → HTTP ${intrusoGet.status} ${check(intrusoOk, 'un usuario ajeno no recibe nada')}`);

  // 9. Comparación con polling cada 3 s (sin SSE): el rider entrega con el código correcto.
  let polls = 0;
  let pollSeenAt = null;
  let polling = true;
  const pollStart = performance.now();
  const poller = (async () => {
    while (polling) {
      polls++;
      const res = await api(baseUrl, TEST_TOKENS.ana, 'GET', '/api/entregas/e1');
      if (res.body.estado === 'entregada' && pollSeenAt === null) pollSeenAt = performance.now();
      if (pollSeenAt !== null) return;
      await sleep(POLL_INTERVAL_MS);
    }
  })();
  await sleep(1_000 + Math.random() * 1_000); // el cambio cae en un momento cualquiera entre dos consultas
  const wrongCode = await api(baseUrl, TEST_TOKENS.rider, 'PATCH', '/api/entregas/e1/estado', { estado: 'entregada', codigo: '0000' });
  const indexBeforeDelivered = ana2.events.length;
  start = performance.now();
  await api(baseUrl, TEST_TOKENS.rider, 'PATCH', '/api/entregas/e1/estado', { estado: 'entregada', codigo: '4821' });
  const evtDelivered = await ana2.waitEvent((e) => e.json.estado === 'entregada', ACCEPTANCE_LIMIT_MS, 'entregada', indexBeforeDelivered);
  await Promise.race([poller, sleep(ACCEPTANCE_LIMIT_MS)]);
  polling = false;
  const latencySse = evtDelivered.at - start;
  const latencyPoll = pollSeenAt === null ? Infinity : pollSeenAt - start;
  console.log(`9. Código incorrecto → HTTP ${wrongCode.status} «${wrongCode.body.error}»; con el correcto pasa a «entregada»:`);
  console.log(`   - SSE:     ana lo ve en ${ms(latencySse)} ${check(latencySse < PUSH_LIMIT_MS, 'SSE < 1 s')} (1 conexión abierta)`);
  console.log(
    `   - Polling: ana lo ve en ${ms(latencyPoll)} ${check(latencyPoll < ACCEPTANCE_LIMIT_MS, 'polling < 10 s')} ` +
      `(${polls} peticiones en ${ms(performance.now() - pollStart)}; con el intervalo de ${POLL_INTERVAL_MS / 1000} s la espera puede llegar a ${POLL_INTERVAL_MS / 1000} s + la petición)`,
  );

  await Promise.all([ana2.connection.close(), carla.connection.close(), intruso.connection.close()]);
  await server.close();

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nResultado: ${checks.length - failed.length}/${checks.length} comprobaciones correctas${failed.length ? ` · fallan: ${failed.map((c) => c.text).join('; ')}` : ' ✔'}`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Error del prototipo: ${error.message}`);
  process.exitCode = 1;
  process.exit();
});
