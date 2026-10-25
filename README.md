# Rentit

[![CI](https://github.com/UB-ES-A1-2026/Proyecto/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/UB-ES-A1-2026/Proyecto/actions/workflows/ci.yml)

Aplicación web para **alquilar objetos de uso puntual** que no compensa comprar para usarlos una sola vez. Los propietarios publican sus objetos y otros usuarios los solicitan por unos días, con modos de entrega, pago con fianza, valoraciones y chat.

> Proyecto de la asignatura **Ingeniería del Software**.

- **Demo / producción:** pendiente (se despliega a partir del Sprint 1; cómo está montado en [docs/despliegue.md](docs/despliegue.md)).
- **Tablero kanban:** https://github.com/orgs/UB-ES-A1-2026/projects/4/views/1
- **Backlog (épicas y user stories):** Trello del equipo (pide acceso a cualquier miembro).

---

## Índice

1. [Equipo y roles](#equipo-y-roles)
2. [Metodología de trabajo](#metodología-de-trabajo)
3. [Planificación de sprints](#planificación-de-sprints)
4. [Stack tecnológico](#stack-tecnológico)
5. [Estructura del repositorio](#estructura-del-repositorio)
6. [Puesta en marcha en local](#puesta-en-marcha-en-local)
7. [Variables de entorno](#variables-de-entorno)
8. [API: endpoints](#api-endpoints)
9. [Tests](#tests)
10. [Ramas, commits y PR](#ramas-commits-y-pr)
11. [Integración continua y despliegue](#integración-continua-y-despliegue)
12. [Documentación de diseño](#documentación-de-diseño)

---

## Equipo y roles

| Miembro | Rol en S0 | Rol en S1 | Rol en S2 | Rol en S3 |
|---|---|---|---|---|
| Danyal | BE |   |   |   |
| Marc | BE |   |   |   |
| Max | FE |   |   |   |
| Alex | FE |   |   |   |
| Kai | DevOps |   |   |   |
| Francesc | QA |   |   |   |

---

## Metodología de trabajo

Trabajamos con **Scrumban** (Scrum + Kanban):

- Sprints de 2 semanas, con planificación al inicio, demo y retrospectiva al final.
- Tablero **Kanban en GitHub Projects** con las columnas `Backlog → In Progress → Ready → Test → Result → Done`.
- Las **decisiones de diseño** se tratan como user stories o como tareas dentro de una user story.
- Diseño *just enough*: la arquitectura emerge a lo largo de los sprints.
- Las tareas siguen el formato `T<n> - <descripción> (<FE|BE|QA|DevOps>)`, por ejemplo: `T4 - Implementación de la pantalla home (FE)`.
- Cada user story tiene criterios de aceptación en el backlog.

---

## Planificación de sprints

| Sprint | Fechas | Objetivo |
|---|---|---|
| S0 | 6/10 → 20/10 | Esqueleto del proyecto (FE, BE, BD); registro, login, logout y perfil |
| S1 | 20/10 → 10/11 | Pendiente de la planificación del sprint |
| S2 | 10/11 → 24/11 | Pendiente |
| S3 | 24/11 → 15/12 | Pendiente |

Exposición final: 22/12.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite 8 + React Router 8 (TypeScript) |
| Backend | Node.js 22 + Express 5 (TypeScript), API REST bajo `/api` |
| Base de datos | PostgreSQL 16 con Prisma 6 (Docker en local, Supabase en producción) |
| Autenticación | Token de sesión opaco en `Authorization: Bearer`, guardado como hash en la tabla `sesion`; contraseñas con bcrypt |
| Tests | Vitest (FE y BE), Supertest (API), Playwright (e2e) |
| Calidad | ESLint + Prettier |
| CI/CD | GitHub Actions (Sprint 1) |
| Despliegue | Vercel (frontend) y Render (backend) (Sprint 1) |

La justificación está en el ADR [docs/adr/0001-stack.md](docs/adr/0001-stack.md).

---

## Estructura del repositorio

```text
.
├── backend/                 # API REST (Express + Prisma)
│   ├── prisma/              # schema.prisma, migraciones y seed
│   ├── src/
│   │   ├── config/          # Lectura y validación de variables de entorno
│   │   ├── routes/          # Definición de rutas
│   │   ├── middlewares/     # requireAuth, CORS, errores, 404
│   │   ├── controllers/     # Validan la petición y llaman a los services
│   │   ├── services/        # Lógica de negocio (auth, sesiones, usuarios)
│   │   └── repositories/    # Acceso a datos con Prisma
│   └── tests/               # Tests de API y de services (Vitest + Supertest)
├── frontend/                # Aplicación web (React + Vite)
│   ├── src/
│   │   ├── pages/           # Home, Login, Registro, Perfil, 404
│   │   ├── components/      # Layout, PrivateRoute, LogoutButton…
│   │   ├── context/         # AuthContext (sesión del usuario)
│   │   ├── services/        # Únicas llamadas a la API
│   │   └── routes/          # Rutas de React Router
│   └── tests/               # Tests de componentes y servicios (Vitest)
├── e2e/                     # Tests end-to-end (Playwright)
│   └── tests/
├── docker/                  # Script que crea la BD de tests
├── docker-compose.yml       # PostgreSQL local
├── docs/                    # Arquitectura, ADRs, modelo de datos y testing
├── .github/                 # Plantilla de PR
├── AGENTS.md                # Instrucciones para agentes de IA
└── CONTRIBUTING.md          # GitFlow, commits y PRs
```

---

## Puesta en marcha en local

### Requisitos previos

- Node.js 22 (con npm)
- Docker Desktop (o Docker con Docker Compose)
- Git

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/UB-ES-A1-2026/Proyecto.git
cd Proyecto

# 2. Arrancar PostgreSQL (crea las BD rentit y rentit_test)
docker compose up -d
```

```bash
# 3. Backend (terminal 1, desde la raíz del repositorio)
cd backend
cp .env.example .env
npm install
npm run db:migrate     # aplica las migraciones
npm run db:seed        # carga los usuarios de prueba
npm run dev            # http://localhost:3000
```

```bash
# 4. Frontend (terminal 2, desde la raíz del repositorio)
cd frontend
cp .env.example .env
npm install
npm run dev            # http://localhost:5173
```

En Windows (PowerShell) usa `Copy-Item .env.example .env` en lugar de `cp`.

**Comprobación rápida:** `http://localhost:3000/api/health` debe responder `{ "status": "ok" }`, y `http://localhost:5173` debe mostrar la página de inicio.

### Usuarios de prueba

Los crea `npm run db:seed` (y también `npm run db:reset`). Todos tienen la contraseña `Rentit2026`.

| Correo | Rol |
|---|---|
| `ana@rentit.test` | usuario |
| `bruno@rentit.test` | usuario |
| `admin@rentit.test` | administrador |

### Otros comandos útiles (en `backend/`)

| Comando | Para qué |
|---|---|
| `npm run db:reset` | Borra la BD, vuelve a aplicar las migraciones y carga el seed |
| `npm run db:studio` | Abre Prisma Studio para ver los datos |

---

## Variables de entorno

Cada carpeta tiene su `.env.example`; cópialo a `.env` (que nunca se sube al repositorio). Los secretos de producción se guardan en los paneles de Render y Vercel y en GitHub Secrets.

**Backend** (`backend/.env`)

| Variable | Descripción | Ejemplo en local |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `DATABASE_URL` | URL de PostgreSQL que usa la aplicación | `postgresql://rentit:rentit@localhost:5432/rentit` |
| `DIRECT_URL` | URL de PostgreSQL para las migraciones (en producción, el *session pooler* de Supabase) | igual que `DATABASE_URL` |
| `CORS_ORIGINS` | Orígenes permitidos, separados por comas | `http://localhost:5173` |
| `BCRYPT_ROUNDS` | Coste de bcrypt (entre 4 y 31) | `10` |

Los tests del backend usan `backend/.env.test`, que apunta a la BD `rentit_test`.

**Frontend** (`frontend/.env`)

| Variable | Descripción | Ejemplo en local |
|---|---|---|
| `VITE_API_URL` | URL base de la API. Es pública: no pongas secretos en variables `VITE_*` | `http://localhost:3000/api` |

---

## API: endpoints

URL base en local: `http://localhost:3000/api`. Todas las peticiones y respuestas son JSON.

**Autenticación:** las rutas marcadas como privadas necesitan la cabecera `Authorization: Bearer <token>`, con el token que devuelven el registro o el login. La sesión caduca a los 7 días o al hacer logout.

**Errores:** todos tienen la forma `{ "error": "<mensaje>", "field": "<campo>" }`. `field` solo aparece si el error es de un campo concreto. Además de los errores de cada endpoint:

| Código | Cuándo |
|---|---|
| `400` | El cuerpo no es un JSON válido |
| `404` | La ruta no existe (`Ruta no encontrada`) |
| `500` | Error interno del servidor |

### Resumen

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/health` | Público | Comprueba que la API está en marcha |
| `POST` | `/auth/register` | Público | Crea una cuenta e inicia sesión |
| `POST` | `/auth/login` | Público | Inicia sesión |
| `POST` | `/auth/logout` | Privado | Cierra la sesión actual |
| `GET` | `/usuarios/me` | Privado | Devuelve el perfil del usuario |

### `GET /health`

Respuesta `200`:

```json
{ "status": "ok" }
```

### `POST /auth/register`

Cuerpo:

```json
{ "username": "ana", "email": "ana@ejemplo.com", "password": "contraseña123" }
```

| Campo | Reglas |
|---|---|
| `username` | De 3 a 30 caracteres: letras, números, `.`, `_` o `-` |
| `email` | Correo válido, máximo 255 caracteres (se guarda en minúsculas) |
| `password` | Mínimo 8 caracteres y máximo 72 bytes |

Respuesta `201`: igual que la del login (el usuario queda con la sesión iniciada).

| Código | Cuándo | `field` |
|---|---|---|
| `400` | Algún campo no cumple las reglas | `username`, `email` o `password` |
| `409` | Ya existe una cuenta con ese correo | `email` |
| `409` | El nombre de usuario ya está en uso | `username` |

### `POST /auth/login`

Cuerpo:

```json
{ "email": "ana@rentit.test", "password": "Rentit2026" }
```

Respuesta `200`:

```json
{
  "token": "<token de sesión>",
  "expiresAt": "2026-10-27T10:00:00.000Z",
  "user": {
    "id": "8b0e…",
    "username": "ana",
    "email": "ana@rentit.test",
    "role": "user"
  }
}
```

`role` puede ser `user` o `admin`.

| Código | Cuándo | `field` |
|---|---|---|
| `400` | Correo con formato incorrecto o contraseña vacía | `email` o `password` |
| `401` | No existe ninguna cuenta con ese correo | `email` |
| `401` | La contraseña no es correcta | `password` |
| `403` | La cuenta está bloqueada | — |

### `POST /auth/logout` (privado)

Revoca la sesión del token enviado; a partir de ese momento el token deja de funcionar.

Respuesta `204` sin cuerpo. `401` si el token falta, no es válido o ha caducado.

### `GET /usuarios/me` (privado)

Respuesta `200`:

```json
{
  "id": "8b0e…",
  "username": "ana",
  "email": "ana@rentit.test",
  "role": "user",
  "createdAt": "2026-10-18T09:00:00.000Z"
}
```

`401` si el token falta, no es válido o ha caducado.

### Probarlo desde la terminal

```bash
# Login: copia el token de la respuesta
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ana@rentit.test","password":"Rentit2026"}'

# Perfil
curl http://localhost:3000/api/usuarios/me -H "Authorization: Bearer <token>"
```

---

## Tests

Hay tres tipos de tests y cada uno se ejecuta **desde su propia carpeta**. En todas, el comando es `npm test`, pero hace cosas distintas según la carpeta en la que estés:

| Tipo | Carpeta | Qué prueba | Qué necesita en marcha |
|---|---|---|---|
| Backend | `backend/` | Endpoints de la API (Supertest) y services, por separado | PostgreSQL (`docker compose up -d`) |
| Frontend | `frontend/` | Páginas, componentes y servicios, por separado | Nada: las llamadas a la API se simulan |
| End-to-end | `e2e/` | La aplicación completa en un navegador real, como un usuario | PostgreSQL con el seed, backend y frontend |

### Tests del backend

```bash
cd backend
npm test
```

Usan siempre la BD `rentit_test`, que se vacía antes de cada test, así que nunca tocan los datos de `rentit`.

### Tests del frontend

```bash
cd frontend
npm test
```

### Tests end-to-end (Playwright)

Están en `e2e/tests/`, un archivo por user story. Antes de ejecutarlos, arranca la BD, el backend y el frontend como se explica en [Puesta en marcha en local](#puesta-en-marcha-en-local).

La primera vez, instala Playwright y Chromium (es el único navegador que usamos):

```bash
cd e2e
npm install
npx playwright install chromium
```

Después, desde `e2e/`:

```bash
npx playwright test                       # todos los tests (Chromium, uno a uno)
npx playwright test login.spec.ts         # solo un archivo
npx playwright test --headed              # abre el navegador para ver los tests
npx playwright test --ui                  # modo interactivo, paso a paso
npx playwright show-report                # abre el informe de la última ejecución
```

Los tests se ejecutan **uno a uno** (`workers: 1` en `playwright.config.ts`): van contra los servidores de desarrollo y, con varios navegadores a la vez, la API tarda demasiado en responder y fallan por timeout.

`npm test` dentro de `e2e/` es un atajo de `npx playwright test`. `npm run test:smoke` ejecuta solo el smoke test (`smoke.spec.ts`: la API responde, la home carga y un usuario nuevo puede registrarse e iniciar sesión).

La estrategia de pruebas, las convenciones para escribir tests e2e y los casos de prueba de aceptación de cada user story están en [docs/testing.md](docs/testing.md).

### Tests en el CI (GitHub Actions)

El workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (#19) se ejecuta en cada PR hacia `develop`, `main` y las ramas `feature/`, y en cada push a `develop` y `main`. Tiene tres jobs:

| Job | Qué hace |
|---|---|
| **Backend** | `npm ci`, `prisma generate`, lint, tests (con un PostgreSQL temporal) y build |
| **Frontend** | `npm ci`, lint, tests y build |
| **E2E** | Si los dos anteriores pasan: BD temporal con migraciones y seed, backend compilado, build del frontend y todos los tests de Playwright en Chromium |

Si el PR está en rojo, abre el job que falla en la pestaña *Checks* del PR. Si fallan los e2e, el informe de Playwright queda como artefacto (`informe-playwright`) en la ejecución.

- Por defecto apuntan al frontend en `http://localhost:5173` y a la API en `http://localhost:3000/api`. Para otro entorno: `BASE_URL=<url del frontend> API_URL=<url de la API> npx playwright test`.
- El test de registro con datos válidos crea un usuario nuevo en cada ejecución; para dejar la BD limpia, usa `npm run db:reset` en `backend/`.

### Antes de abrir un PR

En cada carpeta que hayas modificado (`backend/` o `frontend/`) ejecuta estos tres comandos; los tres tienen que terminar sin errores:

```bash
npm run lint    # ESLint: revisa el estilo y errores típicos del código, sin ejecutarlo
npm test        # ejecuta los tests de esa carpeta
npm run build   # compila el proyecto: comprueba que no hay errores de TypeScript
```

Si has tocado algo que se ve en la interfaz o cambia un flujo de usuario, ejecuta también los tests end-to-end.

### Cobertura actual

| Funcionalidad | Backend | Frontend | E2E |
|---|---|---|---|
| Health / smoke (la app arranca, registro + login) | ✅ | — | ✅ |
| Registro (válido, correo/usuario duplicado, datos inválidos) | ✅ | ✅ | ✅ |
| Login (credenciales correctas e incorrectas) | ✅ | ✅ | ✅ |
| Logout y bloqueo de páginas privadas | ✅ | ✅ | ✅ |
| Perfil | ✅ | ✅ | Pendiente |

---

## Ramas, commits y PR

Usamos **GitFlow**: cada historia de usuario va en una rama `feature/<nº historia>-<descripcion>` que sale de `develop`, y cada una de sus tareas en una rama `task/<nº tarea>-<descripcion>` que vuelve a la rama de la historia mediante un PR revisado por otra persona. Cuando la historia está completa, se hace *rebase* sobre `develop`, se pasan los tests y entra en `develop` con un *merge commit* (nunca con *squash*). Así `develop` solo tiene historias completas y siempre compila. `main` solo recibe la versión de cada demo. Las reglas completas, el formato de los commits y la **Definition of Done** están en [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Integración continua y despliegue

Planificado para el Sprint 1 (#19, #96, #100):

- **CI:** GitHub Actions ejecutará lint, tests y build en cada PR, con un servicio PostgreSQL para los tests.
- **Despliegue:** frontend en Vercel (con preview por PR), backend en Render y base de datos en Supabase, al hacer merge a `main`.

Más detalle en [docs/arquitectura.md](docs/arquitectura.md#4-despliegue).

---

## Documentación de diseño

| Documento | Contenido |
|---|---|
| [docs/adr/0001-stack.md](docs/adr/0001-stack.md) | Elección del stack y configuración que hay que respetar |
| [docs/arquitectura.md](docs/arquitectura.md) | Capas, flujo de autenticación, estructura de carpetas y despliegue |
| [docs/modelo-datos.md](docs/modelo-datos.md) | Tablas y campos de la base de datos |
| [docs/testing.md](docs/testing.md) | Estrategia de pruebas, convenciones e2e y casos de prueba de aceptación |
| [CONTRIBUTING.md](CONTRIBUTING.md) | GitFlow, commits, PRs y Definition of Done |
| [AGENTS.md](AGENTS.md) | Normas para trabajar con agentes de IA |
