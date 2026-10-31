# SP-04 · Prototipo de tiempo real con Server-Sent Events

Prototipo del spike [#93](https://github.com/UB-ES-A1-2026/Proyecto/issues/93). La decisión y el porqué están en [ADR 0004](../../docs/adr/0004-tiempo-real.md). **No es código de producción**: está aislado del backend, guarda los datos en memoria y **no tiene dependencias** (solo Node 22).

> Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026.

## Qué hay

| Fichero | Qué es |
|---|---|
| `servidor.mjs` | Servidor con `node:http`: endpoints REST de escritura (`PATCH /api/entregas/:id/estado`, `POST /api/conversaciones/:id/mensajes`), de lectura (`GET /api/entregas/:id`, `GET /api/conversaciones/:id/mensajes?despues=<cursor>`) y el canal SSE `GET /api/eventos/stream`. Todo pide `Authorization: Bearer <token>`. |
| `cliente-sse.mjs` | Cliente SSE con `fetch` (el mismo código sirve en Node y en el navegador): manda la cabecera `Authorization`, reconecta solo y usa `Last-Event-ID`. |
| `prototipo.mjs` | Simula varios clientes, mide las latencias e imprime los pasos. Sale con código 1 si algo falla. |
| `demo.html` | Opcional: página para verlo con dos pestañas (`npm run demo`). |

## Qué demuestra

1. **Sin token o con un token inválido no se recibe nada** (401) y el cliente deja de reintentar.
2. Tres clientes abren su canal SSE: ana (arrendataria), carla (propietaria) e intruso (sesión válida, pero no participa).
3. **US-05.02:** el rider (cliente A) avanza la entrega `asignada → recogida` con un `PATCH` normal y ana (cliente B) lo ve **en milisegundos**.
4. **US-06.01:** carla envía un mensaje con un `POST` normal y ana lo recibe por el canal.
5. El rider no puede saltarse un estado (409) y entonces no se publica nada.
6. **Reconexión:** ana pierde la conexión, pasan tres cosas y, al volver con `Last-Event-ID`, el servidor le reenvía las tres en orden.
7. **Reinicio del servidor** (como un redespliegue o un «despertar» de Render): los eventos en memoria se pierden, pero ana reconecta sola, recibe `resync` y recarga por REST desde su cursor. Recupera el mensaje enviado mientras estaba desconectada.
8. **El intruso no recibe nada** de una entrega ni de una conversación ajenas (el filtro se hace en el servidor) y tampoco puede leerlas (404).
9. **Comparación con polling cada 3 s:** el mismo cambio (`en_camino → entregada`, con el código de entrega; con un código incorrecto da 400) llega por SSE en milisegundos y por polling en lo que falte hasta la siguiente consulta (como mucho, 3 s más la petición).

## Cómo ejecutarlo

Requisitos: Node 22 o superior. No hace falta `npm install`.

```bash
cd spikes/sp04-tiempo-real
npm run prototipo    # usa un puerto libre que elige el sistema
```

Demo con dos pestañas (opcional):

```bash
npm run demo         # http://127.0.0.1:49393 (otro puerto: PORT=51093 npm run demo)
```

Abre `http://127.0.0.1:49393/?usuario=rider` en una pestaña y `?usuario=ana` (o `?usuario=carla`) en otra. Al pulsar «Avanzar al siguiente estado» como rider, el estado cambia en la otra pestaña sin recargar; el chat funciona igual entre ana y carla. Con `?usuario=intruso` no se ve nada. Los tokens son de prueba y solo existen en este prototipo.

## Resultado (25/10/2026, Windows 11, Node 24.15.0, todo en `127.0.0.1`)

```
Servidor SSE de prueba en http://127.0.0.1:62225 (arranque da5b1aad)

1. Sin token → HTTP 401; token inválido → HTTP 401; el cliente deja de reintentar (unauthorized) y ha recibido 0 eventos ✔
2. Conectados por SSE: ana (arrendataria), carla (propietaria) e intruso (sesión válida, no participa) → 3 streams abiertos
3. Rider: asignada → recogida (HTTP 200) · ana lo ve en 6 ms ✔ (carla también)
4. Carla envía «¿A qué hora llega el rider?» (HTTP 201) · ana lo recibe en 2 ms ✔
5. Rider intenta recogida → entregada: HTTP 409 «El siguiente estado es «en_camino».» · eventos nuevos para ana: 0 ✔
6. Ana reconecta con Last-Event-ID da5b1aad-2 → recupera 3 eventos en orden en 1 ms: «Te aviso cuando salga.», estado=en_camino, «Ya está en camino.» ✔
7. Reinicio del servidor (arranque 4802541c): ana reconecta sola, recibe «resync» y recarga por REST → estado=en_camino, 1 mensaje(s) nuevo(s) desde el cursor 3; recuperada a los 3035 ms del corte (1,5 s de servidor caído) ✔
8. Intruso: 0 eventos de otros recibidos; GET /api/entregas/e1 → HTTP 404 ✔
9. Código incorrecto → HTTP 400 «El código de entrega no es correcto.»; con el correcto pasa a «entregada»:
   - SSE:     ana lo ve en 1 ms ✔ (1 conexión abierta)
   - Polling: ana lo ve en 1021 ms ✔ (2 peticiones en 3014 ms; con el intervalo de 3 s la espera puede llegar a 3 s + la petición)

Resultado: 9/9 comprobaciones correctas ✔
```

La demo también se ha probado en el navegador del escritorio (Chromium): al avanzar el estado en la pestaña del rider, la pestaña de ana pasa de «asignada» a «recogida» sin recargar.

**Cómo leer los tiempos:** todo corre en la misma máquina, así que no hay red. En producción hay que sumar el viaje Vercel → Render → navegador (decenas o pocos cientos de ms); sigue estando muy por debajo de 1 s con SSE y de 10 s con polling cada 3-5 s. Los 3 s del paso 7 son los 1,5 s que el servidor está caído más la espera de reconexión (1 s y luego 2 s de *backoff*); en Render un despertar tarda alrededor de 1 minuto (ver ADR 0004).

> **Ojo, no comprobado aquí:** se ha ejecutado con Node 24.15.0 (es lo que hay instalado); las APIs que usa (`fetch`, `TextDecoderStream`, `server.closeAllConnections()`) existen en Node 22, pero no se ha probado con esa versión. Tampoco se ha desplegado en Render: lo que pasa con un stream abierto cuando el servicio gratuito se duerme o se redespliega hay que comprobarlo allí (tarea de DevOps de US-05.02).
