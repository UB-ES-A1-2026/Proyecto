# AGENTS.md · Instrucciones del proyecto Rentit

Instrucciones para cualquier agente de IA que trabaje en este repositorio (Copilot, Claude Code, Codex…). Se aplican a **todas** las peticiones; en cada tarea solo hace falta indicar las excepciones.

> Generado con asistencia de IA (Claude) – revisado por Kai Oliveros.

Rentit es un "Airbnb de objetos" de barrio: alquiler entre vecinos con entrega, pago con fianza y valoraciones. Antes de hacer cambios, lee:
- [docs/arquitectura.md](docs/arquitectura.md): capas, flujo de autenticación y estructura de carpetas.
- [docs/adr/0001-stack.md](docs/adr/0001-stack.md): stack elegido y por qué.
- [docs/modelo-datos.md](docs/modelo-datos.md): tablas y campos.
- [CONTRIBUTING.md](CONTRIBUTING.md): ramas, commits y PRs.

## Lenguaje y estilo
- **TypeScript en modo estricto** en `frontend/` y `backend/`. No uses `any`; si un tipo es desconocido, usa `unknown` y valídalo.
- Frontend: **React 18 + Vite + React Router**, componentes funcionales con hooks.
- Backend: **Node.js 22 + Express**, API REST en JSON bajo `/api`.
- Base de datos: **PostgreSQL con Prisma**.
- Formato con **Prettier** y lint con **ESLint** según la configuración del repo. No modifiques `.prettierrc` ni la configuración de ESLint.

## Convenciones del equipo
- Variables, funciones y archivos de código en **inglés** (`camelCase` para variables y funciones, `PascalCase` para componentes y tipos).
- Tablas y columnas de la BD **en español y `snake_case`**, exactamente como en `docs/modelo-datos.md` (`usuario`, `sesion`, `password_hash`…).
- Comentarios, textos de la interfaz y mensajes de error para el usuario **en español**.
- Ramas `tipo/<nº issue>-<descripcion>` y commits `tipo(ámbito): descripción (#issue)`, como dice `CONTRIBUTING.md`.
- Backend en capas: `routes → middlewares → controllers → services → repositories`. Cada capa solo llama a la siguiente: los controllers no usan Prisma y los services no conocen `req` ni `res`.
- El frontend llama a la API solo desde `frontend/src/services/`, nunca con `fetch` suelto dentro de los componentes.

## Restricciones permanentes
- **No añadas dependencias nuevas** a ningún `package.json` sin que la tarea lo diga explícitamente.
- **Nunca escribas secretos** (claves, contraseñas, URLs de BD con credenciales) en el código ni en archivos commiteados. Las variables nuevas se añaden a `.env.example` con un valor de ejemplo, nunca con el real.
- **Autenticación:** solo con el token de sesión opaco y la tabla `sesion` (ver `docs/arquitectura.md`). No introduzcas JWT, cookies de sesión ni librerías de auth externas.
- Contraseñas siempre con `bcrypt`. Nunca registres en logs contraseñas, tokens ni la cabecera `Authorization`.
- En React no uses `dangerouslySetInnerHTML` (el token está en `localStorage` y hay que evitar XSS).
- No hagas commits ni push directamente a `main`.

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
- Base de datos local: `docker compose up -d` desde la raíz.
- Copia `.env.example` a `.env` en `backend/` y `frontend/` antes de arrancar.
- Backend: `cd backend && npm install && npx prisma migrate dev && npm run dev`.
- Frontend: `cd frontend && npm install && npm run dev`.
- Variables de entorno: el backend las lee solo desde `backend/src/config/`; el frontend solo usa variables `VITE_*`, que son públicas.

> Los comandos son los previstos en el ADR 0001; cuando estén los esqueletos (#17, #31), se ajustan aquí si cambian.

## Áreas sensibles
Antes de modificar estas rutas, **explica qué archivos vas a tocar y por qué, y espera confirmación**:
- `backend/src/middlewares/` y todo lo relacionado con autenticación y sesiones.
- `backend/prisma/schema.prisma` y `backend/prisma/migrations/`. **Nunca edites una migración ya mergeada**: crea una nueva.
- `.github/workflows/`: el CI y el despliegue.
- `docker-compose.yml`, `.env.example` y cualquier configuración de hosting (Vercel, Render, Supabase).

## Trazabilidad del código generado con IA
- Marca la casilla de IA en la plantilla del PR. Si un bloque grande lo ha generado un agente, añade un comentario:
  `// Generado con asistencia de IA – revisado por <nombre>, <fecha>`
- Una persona del equipo (no el agente) revisa siempre el diff antes del merge.

---
Este archivo se revisa en cada **Retrospectiva**. Cualquier miembro puede proponer cambios por PR; se discuten en equipo. Mejor corto y al día que largo y olvidado.
