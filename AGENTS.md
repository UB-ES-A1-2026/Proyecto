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
- Usamos **GitFlow** (ver `CONTRIBUTING.md`): el trabajo de cada tarea va en `feature/<nº issue>-<descripcion>`, que sale de `develop` y vuelve a `develop` por PR. Commits con el formato `tipo(ámbito): descripción (#issue)`.
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
- Antes de dar una tarea por terminada, ejecuta en la carpeta que hayas tocado:
  ```bash
  npm run lint
  npm test
  npm run build
  ```
- Si un test falla, arregla el código, no el test, salvo que la tarea diga que el comportamiento cambia.

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
- `AGENTS.md`, `CONTRIBUTING.md` y `.github/pull_request_template.md`: son acuerdos del equipo; no los cambies salvo que la tarea lo pida.

## Trazabilidad del código generado con IA
- Marca la casilla de IA en la plantilla del PR. Si un bloque grande lo ha generado un agente, añade un comentario:
  `// Generado con asistencia de IA – revisado por <nombre>, <fecha>`
- Una persona del equipo (no el agente) revisa siempre el diff antes del merge.

---
Este archivo se revisa en cada **Retrospectiva**. Cualquier miembro puede proponer cambios por PR; se discuten en equipo. Mejor corto y al día que largo y olvidado.