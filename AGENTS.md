# AGENTS.md · Instrucciones del proyecto Rentit

Instrucciones para cualquier agente de IA que trabaje en este repositorio (Copilot, Claude Code, Codex…). Se aplican a **todas** las peticiones; en cada tarea solo hace falta indicar las excepciones.

> Generado con asistencia de IA (Claude) – revisado por Kai Oliveros. Convenciones de backend y GitFlow añadidas en el Sprint 0 (#17, #20) – revisado por Danyal.

Rentit es un "Airbnb de objetos" de barrio: alquiler entre vecinos con entrega, pago con fianza y valoraciones. Antes de hacer cambios, lee:
- [docs/arquitectura.md](docs/arquitectura.md): capas, flujo de autenticación y estructura de carpetas.
- [docs/adr/0001-stack.md](docs/adr/0001-stack.md): stack elegido y por qué.
- [docs/modelo-datos.md](docs/modelo-datos.md): tablas y campos.
- [CONTRIBUTING.md](CONTRIBUTING.md): GitFlow, ramas, commits y PRs.

## Lenguaje y estilo
- **TypeScript en modo estricto** en `frontend/` y `backend/`. No uses `any`; si un tipo es desconocido, usa `unknown` y valídalo.
- Frontend: **React 19 + Vite + React Router**, componentes funcionales con hooks.
- Backend: **Node.js 22 + Express**, API REST en JSON bajo `/api`.
- Base de datos: **PostgreSQL con Prisma 6**.
- Formato con **Prettier** y lint con **ESLint** según la configuración del repo. No modifiques `.prettierrc` ni la configuración de ESLint.

## Convenciones del equipo
- Variables, funciones y archivos de código en **inglés** (`camelCase` para variables y funciones, `PascalCase` para componentes y tipos).
- Tablas y columnas de la BD **en español y `snake_case`**, exactamente como en `docs/modelo-datos.md` (`usuario`, `sesion`, `password_hash`…).
- Comentarios, textos de la interfaz y mensajes de error para el usuario **en español**.
- Usamos **GitFlow** (ver `CONTRIBUTING.md`): cada historia va en `feature/US-XX.YY-<descripcion>` (un spike, `feature/SP-NN-<descripcion>`), que sale de `develop`; cada tarea va en `task/US-XX.YY-<nº tarea>-<descripcion>`, que sale de la rama de su historia y vuelve a ella por PR. La historia completa entra en `develop` tras un *rebase* y los tests. Todo se integra con *merge commit*, **nunca con squash**. Commits con el formato `tipo(ámbito): US-XX.YY descripción (#nº tarea)`; como no hay squash, cada commit tiene que compilar. El check «Metodología» del CI rechaza lo que no cumpla.
- **Solo se crean ramas para historias o spikes.** Nunca una rama para una pieza suelta (tabla, migración, estilos, datos de ejemplo): es una tarea de la primera historia que la usa. Si te piden algo que no encaja en ninguna historia o tarea del sprint, **para y pregúntalo** antes de crear nada. Antes de crear una rama `feature/`, comprueba que no existe ya: una sola por historia.
- Backend en capas: `routes → middlewares → controllers → services → repositories`. Cada capa solo llama a la siguiente: los controllers no usan Prisma y los services no conocen `req` ni `res`.
- El frontend llama a la API solo desde `frontend/src/services/`, nunca con `fetch` suelto dentro de los componentes.

## Backend: convenciones acordadas en el Sprint 0
- **Prisma:** modelos en inglés y `PascalCase`, campos en `camelCase`, mapeados con `@map` / `@@map` a las tablas y columnas en español de `docs/modelo-datos.md`. Ejemplo: `User.passwordHash` → `usuario.password_hash`.
- **IDs:** UUID (`@id @default(uuid()) @db.Uuid`).
- **API:** JSON en `camelCase` y en inglés. Errores siempre con la forma `{ "error": "<mensaje en español>", "field": "<campo>" }` (`field` solo si el error es de un campo concreto).
- **Sesiones:** solo a través de `src/services/sessionService.ts` (`createSession`, `findValidSession`, `revokeSession`, `hashToken`). Token: 32 bytes aleatorios de `node:crypto`; en la BD solo su hash SHA-256; caduca a los 7 días. Si alguna de estas funciones ya existe, reutilízala: nunca crees una segunda forma de generar o validar tokens.
- **Rutas privadas:** middleware `requireAuth`, que deja `req.auth = { userId, sessionId }`.
- **Contraseñas:** `bcrypt`, con el coste definido en `src/config/` (`BCRYPT_ROUNDS`).
- **Tests con BD:** siempre contra `rentit_test` (`backend/.env.test`), nunca contra `rentit`. Llama a `resetDb()` de `tests/helpers/db.ts` antes de cada test.

## Frontend: wireframe antes de programar (#162)
Norma del profesor desde el Sprint 1. Detalle, plantilla y piezas en [docs/wireframes/README.md](docs/wireframes/README.md).
- **Antes de crear o cambiar una pantalla** de una historia, comprueba si existe `docs/wireframes/US-XX.YY-<nombre>/`. Si no existe, **lo primero que haces es el wireframe**, no los componentes: copia `docs/wireframes/_plantilla/`, rellénalo con los textos reales de los criterios de aceptación y genera los PNG con `cd e2e && npm run wireframes -- US-XX.YY-<nombre>`.
- El flujo empieza en la pantalla **desde la que llega el usuario** y acaba en **a dónde va al terminar**, con los estados de error, vacío y carga que pidan los criterios.
- **Abre los PNG y revísalos** (nada cortado ni solapado). Después **para y enseña `flujo.png` a la persona** para que lo valide antes de programar. Si la historia no tiene criterios suficientes para dibujar el flujo (por ejemplo, no dice desde dónde se llega), pregunta en lugar de inventarlo.
- Usa solo las clases de `docs/wireframes/wireframe.css`. Nada de estilos de la marca ni librerías nuevas.
- Si la implementación cambia la pantalla, actualiza el wireframe y vuelve a generar los PNG en el mismo PR.
- **Norma fija para todas las demos:** ninguna historia con pantalla llega a la demo sin su wireframe. Las de los Sprints 2 y 3 ya tienen uno propuesto en `docs/wireframes/`: al empezar cada historia, repásalo con la persona y actualízalo antes de programar.

## Historias de usuario
Cuando redactes o revises una historia (issue o Trello), usa la plantilla `.github/ISSUE_TEMPLATE/historia-de-usuario.md`. Además del «Como… quiero… para…», tiene que decir **desde qué pantalla y con qué acción llega el usuario**, el flujo paso a paso, a dónde va al terminar y criterios de aceptación comprobables, incluidos los errores.

**Norma fija para todas las demos (tarjetas de Trello):** antes de cada demo, cada tarjeta de historia del sprint tiene en la descripción «Cómo llega el usuario», «Flujo», «Al terminar», los errores y el wireframe, además de la lista «Acceptance criteria». Solo va a «Done Sprint N» lo que ya está en `develop`, con sus criterios marcados y sin marcar los que aún no se cumplan. La tarjeta US-01.1 se deja como está a propósito, para mostrar cómo han mejorado las tarjetas.

## Sprint 2 (10/11 → 24/11): lo que hay que saber
Demo prevista el **25/11**. Todo tiene que estar en `develop` el **20/11**, para probarlo y estudiarlo.

**Antes de empezar una tarea**, lee su issue y el de su historia (`gh issue view <nº>`). La historia es la fuente de verdad: cómo llega el usuario, flujo, errores y criterios de aceptación. Programa exactamente eso. Si algo no está claro, pregunta a la persona; no lo inventes.

| Orden | Historia | Issue | Tareas (issue · persona) |
|---|---|---|---|
| 1 | US-12.01 Métricas de tests | #274 | T1 #272 Marc (PR #302 en revisión) |
| 1 | US-12.02 Ramas y commits con su historia | #275 | T2 #277 Marc |
| 1 | US-12.03 Preproducción (`staging`) | #276 | T3 #278 Max · T4 #279 Max · T5 #280 Danyal |
| 1 | US-05.01 Modo y hora de entrega | #66 | T6 #281 Alex · T7 #282 Marc · T27 #307 Marc · T8 #283 Danyal |
| 1 | US-07.01 Registrar un pago | #72 | T9 #284 Francesc · T10 #285 Max · T11 #286 Kai · T12 #287 Danyal |
| 1 | US-10.03 Solicitar ser rider | #304 | T34 #314 Max · T35 #315 Marc · T36 #316 Danyal |
| 1 | US-11.03 El admin acepta o rechaza riders | #305 | T37 #317 Alex · T38 #318 Kai · T39 #319 Danyal |
| 1 | SP-05 Armario del barrio con QR | #94 | Max |
| 2 | US-05.02 Seguimiento por estados | #67 | T13 #288 Francesc · T14 #289 Max · T15 #290 Marc · T16 #291 Danyal |
| 2 | US-10.01 Trabajos del rider | #78 | T17 #292 Alex · T18 #293 Kai · T19 #294 Danyal |
| 2 | US-04.05 Cancelar una reserva con penalización | #64 | T28 #308 Alex · T29 #309 Kai · T30 #310 Danyal |
| 2 | US-04.07 Demanda de fechas en el calendario | #303 | T31 #311 Francesc · T32 #312 Marc · T33 #313 Danyal |
| 3 | US-08.01 Valorar un alquiler | #74 | T20 #295 Francesc · T21 #296 Kai · T22 #297 Danyal |
| 3 | US-08.02 Valorar un usuario | #75 | T23 #298 Francesc · T24 #299 Marc |
| 3 | US-01.4 Perfil público | #48 | T25 #300 Alex · T26 #301 Kai |

El orden sigue las dependencias: la ola 2 necesita las tablas de entrega y pago de la ola 1, y la 3 necesita que el alquiler llegue a «Finalizada» (US-05.02). Cada persona hace sus tareas en ese orden. Las historias de la ola 2 que no dependen de nada (US-04.07) se pueden adelantar.

**Cómo se trabaja una historia este sprint:**
- La primera persona que empieza una tarea de la historia crea `feature/US-XX.YY-<desc>` desde `develop` y la sube; las demás sacan su `task/` de ahí.
- Las tablas nuevas van en la tarea de backend de la historia que las usa primero:
  - `pago`: US-07.01 (T9).
  - `punto_recogida`, `entrega` y los modos por objeto: US-05.01 (T6).
  - Estados de la reserva y la entrega: US-05.02 (T13).
  - Datos de la cuenta de rider: US-10.03 (T34).
  - Revisión del admin: US-11.03 (T37).
  - Cancelación y penalización: US-04.05 (T28).
  - `valoracion`: US-08.01 (T20).
- Frontend: primero el wireframe (ver arriba). Los de las historias nuevas no existen, y los de pago, entrega, seguimiento, rider y cancelar hay que rehacerlos con lo decidido.
- **Cada historia añade sus datos de demo** al seed en su tarea de backend: cuenta de admin, rider aprobado, alquiler finalizado, varias solicitudes pendientes en las mismas fechas… Sin ellos no se puede enseñar en la demo.
- Una historia no entra en `develop` sin sus e2e.
- Stripe: solo claves de prueba (`sk_test_…`, `pk_test_…`), en variables de entorno, nunca en el código. En `.env.example`, un valor de ejemplo.

**Decisiones del equipo** (planning del 10/11 y reunión del 11/11):
1. **Pagos** con Stripe en modo de prueba y sus tarjetas de prueba (`4242 4242 4242 4242` se acepta; `4000 0000 0000 0002` se rechaza). La fianza se retiene sin cobrarla. Sustituye a la pasarela simulada de SP-01: el ADR se actualiza en T10.
2. **Rider:** cuenta aparte, creada desde «Hazte rider» (visible sin sesión) con un cuestionario. Queda pendiente hasta que un admin la acepta. Una cuenta de rider no puede solicitar ni publicar objetos.
3. **Entrega:** el propietario puede ofrecer a la vez recogida en su domicilio, rider y punto de recogida; el arrendatario elige uno.
4. **Calendario de la solicitud:** cada día lleva un degradado según cuántas solicitudes pendientes de otras personas lo incluyen (0 libre, 1–2 poca, 3–5 media, 6+ mucha), con leyenda. Nunca se dice de quién son.
5. **Cancelar una reserva:** pueden las dos partes. La penalización es un % del precio del alquiler y la cobra la otra persona:
   - Menos de 3 días para el inicio: 100 %.
   - De 3 a 7 días: 35 %.
   - 8 días o más: nada.

   Al solicitar con menos de 3 días de margen se avisa.
6. **Seguimiento:** solo una máquina de estados, sin mapa. El alquiler llega a «Finalizada» cuando el arrendatario marca «He devuelto el objeto», y entonces se puede valorar.
7. **Trabajos del rider:** todos los riders ven todos los trabajos (objeto, inicio, destino, fecha y lo que cobran) y aceptan varios a la vez; si otro se adelanta en uno, ese avisa «Ya asignado a otro rider».
8. **Sin rider a 24 h del inicio:** es del Sprint 3 (US-05.04, #306). No se hace ahora.

**Pendiente de decidir** (si te afecta, pregunta antes de programarlo):
- Si los e2e de alguna historia los hace quien hace su frontend: Danyal tiene 10 tareas.
- Si la penalización cuando cancela el propietario solo se registra o se cobra.
- Cómo se retiene la fianza en Stripe cuando el alquiler empieza dentro de más de 7 días.

## Restricciones permanentes
- **No añadas dependencias nuevas** a ningún `package.json` sin que la tarea lo diga explícitamente.
- **Nunca escribas secretos** (claves, contraseñas, URLs de BD con credenciales reales) en el código ni en archivos commiteados. Las variables nuevas se añaden a `.env.example` con un valor de ejemplo, nunca con el real. Excepción: `backend/.env.test`, que solo contiene la URL de la BD local de tests.
- **Autenticación:** solo con el token de sesión opaco y la tabla `sesion` (ver `docs/arquitectura.md`). No introduzcas JWT, cookies de sesión ni librerías de auth externas.
- Contraseñas siempre con `bcrypt`. Nunca registres en logs contraseñas, tokens ni la cabecera `Authorization`.
- En React no uses `dangerouslySetInnerHTML` (el token está en `localStorage` y hay que evitar XSS).
- **No hagas commits ni push** a `main` ni a `develop`, y no hagas merges entre ramas: eso lo hace siempre una persona del equipo.

## Tests y calidad
- Unitarios con **Vitest** (front y back), API con **Supertest**, e2e con **Playwright** en `e2e/`.
- Cada función de service, endpoint o componente nuevo tiene **al menos un test**. Cada bug arreglado tiene un test que lo reproduce.
- Antes de dar una tarea por terminada, ejecuta en la carpeta que hayas tocado (en `e2e/`, `npx playwright test`):
  ```bash
  npm run lint
  npm run test:coverage   # los tests con cobertura; falla si baja del mínimo
  npm run build
  ```
- Si un test falla, arregla el código, no el test, salvo que la tarea diga que el comportamiento cambia.

## Métricas de tests: cobertura y bugs encontrados por tests (#272)
El profesor pidió métricas de los tests. Salen solas si se cumple esto; detalle en [docs/testing.md](docs/testing.md#5-métricas-de-tests).
- **Cobertura.** El CI la mide en cada PR y comenta el resultado. Si `npm run test:coverage` falla por cobertura, **añade tests** del código nuevo. **Nunca bajes los mínimos** (`thresholds` de `vitest.config.ts`) ni excluyas archivos para pasar el corte.
- **Qué es un bug.** Un fallo en código **ya integrado** (rama de historia, `develop` o `main`). Lo que falla mientras haces tu propia tarea, antes de integrarla, no lo es: arréglalo y sigue.
- **Si un test (en local o en el CI) o tú encontráis un bug, no lo arregles de paso.** Para, avisa a la persona y créalo primero con la plantilla «Bug». Desde la terminal, con exactamente estas secciones:
  ```bash
  gh issue create --label bug --title "bug: <qué falla>" --body "### Qué pasa
  <...>

  ### Cómo reproducirlo
  1. <...>

  ### Qué debería pasar
  <...>

  ### Historia afectada
  US-XX.YY <nombre> (#<nº>)

  ### ¿Cómo se ha encontrado?

  Un test automático en local (unitario, de API o e2e)

  ### Test que lo detectó
  <archivo › nombre del test>"
  ```
  La respuesta de «¿Cómo se ha encontrado?» tiene que ser **literalmente** una de estas: `Un test automático en local (unitario, de API o e2e)`, `El CI de un PR`, `Revisión de código`, `Probando a mano`, `En producción o en la demo`. El workflow `bugs.yml` la convierte en una etiqueta `hallado-*` y de ahí sale la métrica.
- **Arreglo de un bug:** rama `bugfix/<nº del bug>-<desc>` (`hotfix/` si está en `main`), con **el test que lo reproduce** (falla sin el arreglo y pasa con él) y `Closes #<nº del bug>` en la descripción. El check «Test del arreglo» falla si falta alguna de las dos cosas. La etiqueta `bug-sin-test` solo la pone una persona, explicando en el PR por qué no se puede probar.

## Build y ejecución
- Base de datos local: `docker compose up -d` desde la raíz (crea las BD `rentit` y `rentit_test`).
- Copia `.env.example` a `.env` en `backend/` y `frontend/` antes de arrancar.
- Backend: `cd backend && npm install && npm run db:migrate && npm run dev`.
- Frontend: `cd frontend && npm install && npm run dev`.
- Variables de entorno: el backend las lee solo desde `backend/src/config/`; el frontend solo usa variables `VITE_*`, que son públicas.

## Áreas sensibles
Antes de modificar estas rutas, **explica qué archivos vas a tocar y por qué, y espera confirmación**:
- `backend/src/middlewares/` y todo lo relacionado con autenticación y sesiones.
- `backend/prisma/schema.prisma` y `backend/prisma/migrations/`. **Nunca edites una migración ya mergeada**: crea una nueva.
- `.github/workflows/`: el CI y el despliegue.
- `docker-compose.yml`, `docker/`, `.env.example`, `backend/.env.test` y cualquier configuración de hosting (Vercel, Render, Supabase).
- `vitest.config.ts` (los mínimos de cobertura) y `.github/scripts/`.
- `AGENTS.md`, `CONTRIBUTING.md` y `.github/pull_request_template.md`: son acuerdos del equipo; no los cambies salvo que la tarea lo pida.

## Trazabilidad del código generado con IA
- Marca la casilla de IA en la plantilla del PR. Si un bloque grande lo ha generado un agente, añade un comentario:
  `// Generado con asistencia de IA – revisado por <nombre>, <fecha>`
- Una persona del equipo (no el agente) revisa siempre el diff antes del merge.

---
Este archivo se revisa en cada **Retrospectiva**. Cualquier miembro puede proponer cambios por PR; se discuten en equipo. Mejor corto y al día que largo y olvidado.