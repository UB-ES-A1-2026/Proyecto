# ADR 0004 · Actualizaciones en tiempo real (seguimiento de la entrega y chat)

- **Estado:** Propuesto (25/10/2026), pendiente de revisión del equipo
- **Fecha:** 25/10/2026
- **Responsable:** Marc (spike SP-04, #93)
- **Relacionado:** [ADR 0001](0001-stack.md), [`docs/arquitectura.md`](../arquitectura.md), [`docs/modelo-datos.md`](../modelo-datos.md) (`entrega`, `conversacion`, `mensaje`, `notificacion`), prototipo en [`spikes/sp04-tiempo-real/`](../../spikes/sp04-tiempo-real/)

> Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026.

## Contexto

Varias historias necesitan que un cambio que hace una persona le llegue a otra **sin que tenga que recargar**:

| Historia | Sprint | Qué tiene que llegar | Criterio |
|---|---|---|---|
| **US-05.02** Seguimiento del estado de la entrega (#67) | S2 | El rider avanza `asignada → recogida → en_camino → entregada`; lo ven el arrendatario y el propietario. | «Cada cambio se refleja […] sin recargar (o en menos de 10 s)». Sin GPS en tiempo real. |
| **US-10.01** Rider acepta entregas disponibles (#78) | S2 | Una entrega aceptada desaparece de la lista de los demás riders. | El segundo rider que acepta recibe «ya asignada» (eso lo resuelve el endpoint, no el tiempo real). |
| **US-06.01 / US-06.02** Enviar y consultar mensajes (#69, #70) | S3 | Un mensaje nuevo aparece en la conversación del otro usuario. | Solo lo pueden ver los dos participantes. |
| **US-06.03** Notificaciones in-app y por email (#71) | S3 | El contador de la campana sube cuando hay una notificación nueva. | — |

La pregunta del spike: **¿WebSockets, el Realtime del BaaS (Supabase) o polling? ¿Qué impacto tiene en la arquitectura y en el hosting?** Lo que condiciona la respuesta (ADR 0001):

- El **frontend es estático en Vercel**; el tiempo real lo tiene que servir el **backend en Render** (plan gratuito: **una sola instancia**, se duerme tras 15 min sin tráfico y tarda alrededor de 1 minuto en despertar).
- **Supabase se usa solo como base de datos**, por Prisma y a través del *pooler*. No usamos la API ni la Auth de Supabase.
- La autenticación es un **token de sesión opaco** en `Authorization: Bearer`, validado contra la tabla `sesion`; **no hay JWT** (y AGENTS.md prohíbe introducirlos).
- **Coste cero**, repo público (sin secretos) y 6 estudiantes con dos sprints para hacerlo.

## Opciones

| Opción | Cómo funciona | A favor | En contra |
|---|---|---|---|
| **Polling corto** | El cliente pide el estado cada N segundos (`GET /api/entregas/:id`). | Lo más sencillo: son los endpoints REST de siempre, con `requireAuth`. Funciona en cualquier sitio y se prueba con Supertest. Con N = 3-5 s cumple el «menos de 10 s». | Latencia de hasta N segundos. Una petición (y una consulta a la BD) cada N s por pantalla abierta, aunque no cambie nada. Para un chat se nota el retraso. |
| **Long polling** | La petición se queda abierta hasta que hay un cambio (o un tiempo máximo) y el cliente vuelve a pedir. | Latencia baja con HTTP normal. | Tiene la misma complejidad que SSE en el servidor (esperas, *timeouts*, reconexión), pero sin las ventajas del formato estándar. No aporta nada frente a SSE. |
| **Server-Sent Events (SSE) desde Express** | Una respuesta HTTP que no se cierra (`Content-Type: text/event-stream`) por la que el servidor escribe eventos. Solo va del servidor al cliente. | Es **HTTP normal**: pasa por `corsMiddleware` y `requireAuth` como cualquier ruta y no necesita ninguna dependencia (`res.write`). El formato estándar trae `id`, `retry` y la reconexión con `Last-Event-ID`. Encaja con que **las escrituras sigan siendo REST**. Latencia de milisegundos (prototipo). | El `EventSource` del navegador **no permite cabeceras**, así que no puede mandar el token Bearer: hay que usar un cliente con `fetch` (ver la decisión 3). Hay que mandar un *heartbeat* para que los proxies no corten la conexión. En Render, los streams se cierran al redesplegar. |
| **WebSockets** (`ws` o Socket.IO) en Render | Conexión bidireccional persistente. | Render los admite, también en el plan gratuito, y no les pone una duración máxima. Bidireccional (útil para «escribiendo…» o GPS en directo, que **no** están en el backlog). | La API `WebSocket` del navegador **tampoco permite cabeceras**: hay que autenticar con un primer mensaje o un *ticket*, una segunda forma de autenticar. Las escrituras irían por otro canal que no es REST: se duplican la validación, los permisos y los tests. `ws` obliga a hacer a mano el *ping/pong* y la reconexión; Socket.IO añade dependencias en el back y en el front y, con varias instancias, pide *sticky sessions* y un adaptador (Redis, Postgres…). |
| **Supabase Realtime** (Broadcast o Postgres Changes) | El navegador se conecta por WebSocket a Supabase con la clave pública del proyecto y un JWT del usuario; la autorización la deciden políticas RLS. | No hay servidor de tiempo real propio. Plan gratuito: 200 conexiones simultáneas, 100 mensajes/s y 2 millones de mensajes al mes, suficiente para nosotros. | **Choca con nuestra autenticación.** Los canales privados y Postgres Changes se autorizan con un **JWT que Supabase sepa verificar** (Supabase Auth o un JWT firmado con una clave que el proyecto acepte) y con **políticas RLS** (`auth.uid()`). Tendríamos que emitir JWT desde el backend (AGENTS.md lo prohíbe y sería una segunda forma de sesión), activar RLS en `entrega`, `mensaje`… y **duplicar en SQL los permisos** que ya están en los services. Además, el frontend tendría la clave pública: si la Data API está activa, una tabla expuesta sin RLS **la puede leer y escribir cualquiera** con permisos sobre ella. Supabase pide activar RLS en todas las tablas expuestas y no la activa sola en las tablas nuevas, y Prisma las crea sin RLS (incluidas `usuario` y `sesion`). Un canal público sería peor: lo escucha cualquiera que sepa el nombre del tema. Al revocar el acceso, Supabase sigue enviando mensajes hasta que caduca el JWT. Y nos ata a Supabase más allá de la BD. |

## Decisión

1. **Las escrituras siguen siendo REST**, como hasta ahora: el rider avanza el estado con `PATCH /api/entregas/:id/estado` y un mensaje se envía con `POST /api/conversaciones/:id/mensajes`. Validación, permisos y tests, en el sitio de siempre. El tiempo real **solo avisa** del servidor al cliente.
2. **Usamos Server-Sent Events servidos por nuestro backend Express en Render**, con un único canal por pestaña: `GET /api/eventos/stream`. Por él viajan todos los tipos de evento del usuario: `entrega.estado` (S2), `mensaje.nuevo` y `notificacion.nueva` (S3). Es **el mismo mecanismo para el seguimiento de la entrega y para el chat**: los dos van solo del servidor al cliente y no compensa tener dos.
3. **Autenticación con la cabecera de siempre, nunca con el token en la URL.** El frontend **no usa `EventSource`** (no deja poner cabeceras), sino un cliente pequeño con `fetch` y `ReadableStream` (unas 80 líneas, sin dependencias; está en el prototipo, `cliente-sse.mjs`) que manda `Authorization: Bearer <token>` y `Last-Event-ID`. Así la ruta usa **`requireAuth` sin cambios** y el token no acaba en los logs, en el historial ni en los proxies. Si el stream da 401, el cliente no reintenta y manda al login.
4. **Los permisos se aplican en el servidor, al publicar.** El service que guarda el cambio decide quién lo recibe: en una entrega, el arrendatario, el propietario y el rider; en una conversación, `usuario_a` y `usuario_b`. Cada stream solo recibe los eventos de su usuario. El evento lleva solo lo que ese usuario ya puede ver por REST (nunca el `codigo_entrega`).
5. **El bus de eventos está en memoria** (un `EventEmitter` dentro del backend). Sirve porque Render gratuito tiene **una sola instancia**. Si algún día hubiera varias, se cambiaría por `LISTEN/NOTIFY` de PostgreSQL por el *session pooler* (puerto 5432; el *transaction pooler* no lo admite) o por Redis, sin cambiar la API.
6. **La base de datos es la fuente de verdad; los eventos son avisos.** Cada evento lleva un id `<arranque>-<secuencia>` y el servidor guarda los últimos (unos 500) en memoria:
   - Si el cliente se reconecta con un `Last-Event-ID` del mismo arranque, recibe lo que se perdió, en orden.
   - Si el servidor se ha reiniciado (redespliegue o despertar de Render) o el id es demasiado viejo, recibe un evento `resync` y **recarga por REST**: `GET /api/entregas/:id` y `GET /api/conversaciones/:id/mensajes?despues=<cursor>`. El cursor de los mensajes es (`enviado_en`, `id`).
   - Al abrir la pantalla, siempre se carga primero por REST y después se escucha el canal.
7. **Polling como red de seguridad.** Si el stream no se puede abrir tras 3 intentos (p. ej., mientras Render despierta), el cliente consulta los mismos endpoints REST cada 5 s hasta que el stream vuelve. Así se cumple el «menos de 10 s» de US-05.02 aunque falle SSE.
8. **Detalles del canal** (todos están en el prototipo): `retry: 1000`; reconexión con *backoff* exponencial hasta 30 s; un comentario `: ping` cada 15 s; cabeceras `Cache-Control: no-cache, no-transform` y `X-Accel-Buffering: no`; nada de compresión en esta ruta; y, con el `SIGTERM` de Render, se cierran los streams de forma ordenada para que los clientes reconecten.
9. **La sesión se revisa también con el stream abierto** (no está en el prototipo): al hacer logout (`revokeSession`) se cierran los streams de esa sesión, y cada 60 s se comprueba con `findValidSession` que no haya caducado. Si no es válida, se cierra el stream.
10. **Descartados:** Supabase Realtime (por la autenticación y la RLS; ver la tabla) y WebSockets (no necesitamos ir del cliente al servidor por ese canal y añadirían una segunda forma de autenticar). Para la lista de entregas disponibles del rider (US-10.01) basta con recargar la lista al volver a la pantalla, o con un evento `entrega.asignada` por el mismo canal si sobra tiempo. La concurrencia la resuelve el endpoint de aceptar con el 409 «ya asignada».

## Cómo encaja en el código (cuando se implemente US-05.02)

- `backend/src/services/realtimeService.ts`: el bus en memoria. `publish(userIds, type, data)`, `subscribe(userId, sessionId, listener)`, el registro de los últimos eventos y el id de arranque. No conoce `req` ni `res`, así que se prueba con Vitest.
- Los services de dominio (`deliveryService`, `messageService` y `notificationService`) llaman a `publish` **después** de que el repository haya guardado el cambio.
- `backend/src/controllers/eventController.ts`: pone las cabeceras SSE (`res.flushHeaders()`), lee `Last-Event-ID`, escribe los eventos, manda el *heartbeat* y limpia todo con `req.on('close')`.
- `backend/src/routes/eventRoutes.ts`: `GET /api/eventos/stream` con `requireAuth`. El nombre final lo fija BE en su PR.
- `backend/src/server.ts`: gestionar `SIGTERM` para cerrar los streams y luego el servidor.
- **CORS:** el paquete `cors`, sin `allowedHeaders`, acepta las cabeceras que pide el navegador en el *preflight*, así que `Authorization` y `Last-Event-ID` ya pasan. Si alguien fija `allowedHeaders` en `corsMiddleware`, tiene que incluir las dos.
- `frontend/src/services/realtimeService.ts`: el cliente SSE con `fetch` del prototipo, pasado a TypeScript. Un `RealtimeProvider` (contexto) abre **una sola conexión por pestaña** y un hook `useRealtimeEvent(tipo, handler)` la reparte entre las pantallas (seguimiento, chat y campana). El indicador «Reconectando…» sale del estado de la conexión.
- **Tests:** Vitest para `realtimeService` (filtrado por usuario, reenvío con `Last-Event-ID` y `resync`) y para el parser del cliente. Para la API, un test que levanta la app en un puerto y lee el stream con `fetch`: 401 sin token, y un `PATCH` hace llegar el evento solo a los participantes. Para el e2e con Playwright, dos contextos de navegador (rider y arrendatario) con `expect(...).toHaveText('En camino', { timeout: 10_000 })`, sin recargar.

### Estimación de tareas (S2 y S3)

Las tareas ya previstas en los issues encajan así (horas orientativas):

| Sprint | Rol | Tarea | Horas |
|---|---|---|---|
| S2 | DevOps+BE (US-05.02) | `realtimeService` + `GET /api/eventos/stream` + *heartbeat* + `SIGTERM` + cierre al hacer logout + tests | 5-6 |
| S2 | BE (US-05.02) | Publicar `entrega.estado` desde la máquina de estados (dentro de su tarea) | 1 |
| S2 | FE (US-05.02) | Cliente SSE con `fetch`, `RealtimeProvider`, reconexión, `resync` y polling de respaldo, con tests | 4 |
| S2 | FE (US-05.02) | Usarlo en la vista de seguimiento | 1 |
| S2 | QA (US-05.02) | e2e con dos contextos: el cambio llega en menos de 10 s sin recargar | 2-3 |
| S2 | DevOps | Comprobar en Render: stream abierto más de 15 min, redespliegue y despertar (ver «Pendiente de comprobar») | 1-2 |
| S3 | BE (US-06.01, US-06.03) | Publicar `mensaje.nuevo` y `notificacion.nueva`, y `GET …/mensajes?despues=` | 2 |
| S3 | FE (US-06.01, US-06.03) | Chat y campana suscritos al hook | 2 |
| S3 | QA (US-06.01) | e2e del chat entre dos usuarios (incluido que un tercero no lo ve) | 2-3 |

En total son unas **20-24 horas** repartidas entre dos sprints, la mayor parte en S2. En S3 se reutiliza el canal.

## Consecuencias

**Positivas**
- **Coste cero, sin dependencias nuevas y sin cuentas nuevas**: solo Express y `fetch`. Funciona igual en local, en el CI y en Render.
- **Una sola forma de autenticar** (`requireAuth` con el token Bearer) y **un solo sitio para los permisos** (los services). No hay RLS ni JWT.
- Las escrituras siguen siendo REST, así que los tests de API y los e2e de siempre siguen valiendo.
- Latencia de milisegundos en el prototipo (frente a lo que tarde el siguiente polling), y con el polling de respaldo se cumple el «menos de 10 s» aunque falle el stream.

**Negativas / riesgos**
- **Render gratuito se duerme.** Si nadie lo usa, la primera conexión tarda alrededor de 1 minuto: el cliente mostrará «Conectando…» y pasará al polling hasta que despierte. Las demos siguen necesitando abrir la URL un minuto antes (ADR 0001).
- **No está claro si un stream abierto cuenta como actividad para Render.** La documentación dice que cuentan las peticiones HTTP y los mensajes de WebSocket *entrantes*. El *heartbeat* de SSE va del servidor al cliente, y en un hilo de la comunidad Render dice que una conexión ya abierta no cuenta. Si sí contara, un stream abierto mantendría despierto el servicio y gastaría horas: 750 h al mes por *workspace*, y un servicio despierto todo el mes gasta 744 h. Hay que comprobarlo y no dejar otros servicios gratuitos encendidos en el mismo *workspace*.
- **Cada redespliegue cierra los streams** (Render manda `SIGTERM` y espera 30 s). Los clientes reconectan y hacen `resync`, como en el paso 7 del prototipo.
- **El bus en memoria solo vale con una instancia.** Si se escala, hay que pasar a `LISTEN/NOTIFY` por el *session pooler* o a Redis (decisión 5).
- **Cada stream abierto es una conexión HTTP que ocupa memoria en el backend.** Con nuestro volumen no debería notarse, pero **no se ha medido**.
- **El cliente con `fetch` es código nuestro** en lugar de `EventSource`, así que necesita tests. La alternativa sería `@microsoft/fetch-event-source`, una dependencia nueva que no proponemos.
- Navegador: con HTTP/1.1 hay un límite de unas 6 conexiones por origen. Por eso hay **un solo stream por pestaña** con todos los tipos de evento. El borde de Render habla HTTP/2 con el navegador según la comunidad (no lo hemos comprobado).
- **Cambios propuestos a otros documentos** (no se han editado en este spike):
  - `docs/arquitectura.md`: añadir al diagrama la flecha «Backend → navegador: SSE `GET /api/eventos/stream` (Authorization: Bearer)» y la ruta en la tabla de endpoints cuando exista.
  - `docs/modelo-datos.md`: añadir `entrega.actualizado_en` (fecha y hora; hace falta para saber cuándo cambió el estado y para recargar tras un `resync`) y un índice en `mensaje (conversacion_id, enviado_en, id)` para el cursor `?despues=`. No hace falta ninguna tabla nueva.
  - `corsMiddleware`: no hay que cambiarlo mientras no se fije `allowedHeaders` (ver «Cómo encaja en el código»).
- **Pendiente de comprobar en Render** (tarea de DevOps de S2): si un stream abierto se corta antes de tiempo (en la comunidad hay un caso de cortes a los 60 s sin confirmar, y una respuesta del personal de Render habla de un límite de 100 min por petición; no está en la documentación oficial), qué pasa con los streams cuando el servicio se duerme, y cuánto tarda el cliente en recuperarse tras un redespliegue real.

## Prototipo del spike

`spikes/sp04-tiempo-real/` (independiente del backend y sin dependencias; ver su README). Lo que hace:
1. Comprueba que sin token o con un token inválido el stream da 401 y no llega nada.
2. Conecta por SSE a la arrendataria, a la propietaria y a un usuario que no participa.
3. El rider avanza la entrega con un `PATCH` y la arrendataria lo ve en **6 ms**; un mensaje de la propietaria le llega en **2 ms**.
4. Comprueba que no se puede saltar un estado (409) y que, en ese caso, no se publica nada.
5. **Reconexión:** la arrendataria se desconecta, pasan tres cosas y, al volver con `Last-Event-ID`, las recupera en orden.
6. **Reinicio del servidor:** reconecta sola, recibe `resync` y recarga por REST (unos 3 s en total, con 1,5 s de servidor caído).
7. Comprueba que el usuario ajeno no recibe ningún evento ni puede leer la entrega (404).
8. **Comparación con polling cada 3 s:** el mismo cambio llega por SSE en **1 ms** y por polling en **1021 ms** (como máximo, 3 s más la petición).

Todo corre en local (sin red), así que en producción hay que sumar el viaje de ida y vuelta a Render. Se ha probado también con `demo.html` en dos pestañas del navegador: el cambio de estado aparece en la otra pestaña sin recargar.

## Fuentes consultadas (25/10/2026)

- Render: [Free instances](https://render.com/docs/free) (se duerme tras 15 min; cuentan las peticiones HTTP y los mensajes de WebSocket entrantes; 750 h al mes; una sola instancia) y [WebSockets on Render](https://render.com/docs/websocket) (sin duración máxima, se cierran al redesplegar, `SIGTERM` con 30 s y balanceo a una instancia aleatoria).
- Comunidad de Render (no son documentación oficial): [SSE que se cierra al minuto](https://community.render.com/t/server-sent-events-connection-closes-after-one-minute/4597), [límite de tiempo de las peticiones](https://community.render.com/t/need-to-increase-requests-timeout-of-5-minutes/4001), [WebSocket en el plan gratuito y actividad](https://community.render.com/t/render-free-node-js-websocket-disconnects-for-no-reason/21750) y [HTTP/2 entre el navegador y el proxy](https://feedback.render.com/features/p/connection-between-render-proxy-and-user-service-supports-http2).
- Supabase: [Realtime limits](https://supabase.com/docs/guides/realtime/limits), [precios](https://supabase.com/pricing) (200 conexiones simultáneas y 2 millones de mensajes al mes en el plan gratuito; pausa tras 1 semana sin actividad), [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [JWT](https://supabase.com/docs/guides/auth/jwts), [Third-party auth](https://supabase.com/docs/guides/auth/third-party/overview), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Securing your data](https://supabase.com/docs/guides/database/secure-data) y [modos del pooler](https://supabase.com/docs/guides/self-hosting/accessing-postgres) (`LISTEN/NOTIFY` solo en *session mode*; la guía es de *self-hosting*).
- MDN: [`EventSource()`](https://developer.mozilla.org/en-US/docs/Web/API/EventSource/EventSource) (sin opción de cabeceras; solo `withCredentials`) y [Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).
- Socket.IO: [Using multiple nodes](https://socket.io/docs/v4/using-multiple-nodes/) (*sticky sessions* y adaptador).
- Vercel: [WebSockets en Vercel Functions](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections) (en beta y con duración máxima por función). No nos afecta, porque nuestro frontend es estático y el tiempo real lo sirve Render.
