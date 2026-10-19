# ADR 0001 · Stack tecnológico de Rentit

- **Estado:** Aceptado (16/10/2026). Los esqueletos del backend (#134) y del frontend (#138) se han creado con este stack.
- **Fecha:** 16/10/2026 · actualizado con las revisiones de Alex en los PRs #130 y #137
- **Responsable:** Kai (DevOps) · tarea #95, parte de TR-02 (#83)
- **Relacionado:** `docs/modelo-datos.md` (#98), `CONTRIBUTING.md` (#20), `docs/arquitectura.md` (#129)

> Generado con asistencia de IA (Claude) – revisado por Kai Oliveros.

## Contexto

Rentit es una aplicación web (un "Airbnb de objetos" de barrio) que tiene que estar **desplegada con URL pública a partir de la demo del Sprint 1** y crecer sprint a sprint hasta el 15/12. Lo que condiciona la elección:

- **Equipo de 6 personas** con roles FE, BE, QA y DevOps que rotan; necesitamos un stack que todos puedan leer y que tenga mucha documentación.
- **Coste cero**: todo tiene que funcionar con planes gratuitos o de estudiante.
- **Modelo de datos relacional** (usuarios, objetos, reservas, pagos, entregas…; ver `docs/modelo-datos.md`).
- **El cierre de sesión debe invalidar la sesión de verdad** (US-01.3), por eso el modelo ya incluye la tabla `sesion`.
- La asignatura pide **CI/CD con GitHub Actions**, tests e2e y trabajo con agentes de IA (cuanto más conocido es el stack, mejor funcionan los agentes).
- Decisiones aún abiertas que resolverán los spikes: pagos (SP-01), mapas (SP-02), imágenes (SP-03), tiempo real (SP-04) y armario QR (SP-05).

## Decisión

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | **TypeScript** en front y back | Un solo lenguaje para todo el equipo; los tipos evitan errores entre la API y el cliente. |
| Frontend | **React 19 + Vite + React Router** | El framework más usado y documentado; Vite arranca y compila rápido. React 19 es la versión que instala la plantilla `react-ts` de Vite, así el esqueleto (#31) y este ADR coinciden. |
| Backend | **Node.js 22 LTS + Express** en capas (`routes → controllers → services → repositories`) | API REST sencilla y conocida; las capas separan HTTP, lógica de negocio y acceso a datos. |
| Base de datos | **PostgreSQL** (local con Docker Compose) | Relacional, encaja con el diagrama ER. |
| Proveedor de PostgreSQL en producción | **Supabase** (plan gratuito) | Postgres gestionado gratis y sin fecha de caducidad; panel para consultar los datos en las demos; en la misma cuenta tiene Storage, candidato para las fotos (SP-03). Solo se usa como base de datos: el backend se conecta con Prisma, no con la API de Supabase, y a través del *pooler* (ver [Configuración](#configuración-que-hay-que-respetar)). |
| Acceso a datos | **Prisma ORM** | Migraciones versionadas y `seed` de desarrollo (#98, #97) con un esquema tipado. |
| Autenticación | **Token de sesión opaco** (aleatorio) en la cabecera `Authorization: Bearer`, guardado como hash en la tabla `sesion`; contraseñas con **bcrypt** | El logout revoca la sesión en la BD (`revocada_en`), cosa que un JWT sin estado no permite. Al ser cabecera y no cookie, funciona aunque front y back estén en dominios distintos. |
| Tests | **Vitest** (unitarios FE y BE), **Supertest** (API), **Playwright** (e2e, #99) | Vitest comparte configuración con Vite; Playwright corre en CI sin configuración extra. |
| Calidad | **ESLint + Prettier** | Lint en cada PR (TR-03). |
| Hosting FE | **Vercel** | Despliegue automático en cada merge a `main` y **preview por PR** (criterio de TR-04). |
| Hosting BE | **Render** (Web Service gratuito) | Despliegue automático desde GitHub para Node; variables de entorno y secretos en su panel. |
| CI/CD | **GitHub Actions**, con un servicio PostgreSQL para los tests | Integrado con el repo; es lo que se ve en teoría (tema 6). |
| Repositorio | **Mono-repo** con `frontend/` y `backend/` | Un solo sitio para issues, PRs, CI y documentación; somos un solo equipo y un solo producto. |

## Configuración que hay que respetar

Detalles que salieron en la revisión del ADR y que afectan a los esqueletos (#17, #31), al CI (#19), al despliegue (#96) y a los secretos (#100).

### 1. Conexión Render → Supabase a través del pooler

La conexión directa de Supabase solo funciona por **IPv6**, y Render no puede conectarse por IPv6. Por eso el backend se conecta al **pooler de Supabase (Supavisor)**, que sí acepta IPv4. Prisma usa dos URLs:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL") // transaction pooler: puerto 6543, con ?pgbouncer=true
  directUrl = env("DIRECT_URL")   // session pooler: puerto 5432, lo usa prisma migrate deploy
}
```

- `DATABASE_URL`: la usa la aplicación en cada consulta.
- `DIRECT_URL`: solo para las migraciones, que no funcionan con el modo *transaction*.
- Las dos van a `.env.example` (sin valores reales) y a los secretos de Render (#100). En local, las dos apuntan al PostgreSQL de Docker.

### 2. PostgreSQL en el CI

Los tests de API (Supertest) y los e2e (Playwright) necesitan una base de datos real. El workflow de CI (#19) levanta PostgreSQL como servicio y aplica las migraciones antes de los tests:

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: rentit
      POSTGRES_PASSWORD: rentit
      POSTGRES_DB: rentit_test
    ports: ["5432:5432"]
    options: >-
      --health-cmd "pg_isready -U rentit -d rentit_test"
      --health-interval 5s --health-retries 10
# ...y en backend/, antes de los tests:
#   - run: npx prisma migrate deploy
```

El usuario, la contraseña y la base de datos son **los mismos que en `backend/.env.test`** (`postgresql://rentit:rentit@localhost:5432/rentit_test`), así los tests se conectan igual en local que en el CI. En el job, `DATABASE_URL` y `DIRECT_URL` apuntan a esa misma URL para que `prisma migrate deploy` cree las tablas en `rentit_test`.

Es una base de datos temporal que se borra al acabar el job; la contraseña `rentit` solo vale para la BD local y la del CI, y no es un secreto.

### 3. CORS para la URL de producción y las previews de Vercel

El backend acepta peticiones de dos tipos de origen, configurados en **dos variables de entorno distintas**:

| Variable | Contiene | Ejemplo |
|---|---|---|
| `CORS_ORIGINS` | Orígenes **exactos**, separados por comas: la URL de producción de Vercel (y `http://localhost:5173` en local). Es lo que ya valida `backend/src/config/env.ts`, que rechaza cualquier `*`. | `https://rentit.vercel.app` |
| `CORS_PREVIEW_PATTERN` | Una **expresión regular** para las URLs de preview de nuestro proyecto (`https://<proyecto>-<hash>-<equipo>.vercel.app` y `https://<proyecto>-git-<rama>-<equipo>.vercel.app`), anclada con `^…$` e incluyendo el nombre del proyecto y del equipo. Opcional: si no está definida, no se acepta ninguna preview. | `^https://rentit-[a-z0-9-]+-<equipo>\.vercel\.app$` |

- **No se mete nunca una expresión regular ni un `*` en `CORS_ORIGINS`**: `env.ts` la rechaza y el backend no arranca.
- **No se acepta cualquier `*.vercel.app`**: cualquiera puede desplegar en ese dominio, así que abrirlo entero sería lo mismo que no tener CORS.
- Leer `CORS_PREVIEW_PATTERN` en `env.ts` y comprobarla en `corsMiddleware` se hace en la tarea de despliegue continuo (**#96**), cuando existan las previews. Hasta entonces el backend solo acepta `CORS_ORIGINS`.

### 4. Las previews usan el backend y la base de datos de producción

Solo tenemos un backend (Render) y una base de datos (Supabase), así que **lo que se haga en una preview queda guardado en la base de datos real**. Lo aceptamos para no duplicar infraestructura, con estas normas:
- En las previews se prueba con **cuentas de prueba**, nunca con datos de la demo.
- Los tests e2e del CI van contra la base de datos temporal del punto 2, **nunca contra producción**.
- Si una migración puede romper datos, no se prueba en una preview: primero en local.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Vue / Angular | Válidos, pero React tiene más ejemplos y el equipo y los agentes lo conocen mejor. |
| Next.js (full-stack) | Mezcla front y back en el mismo proyecto y diluye los roles FE/BE que evalúa la asignatura. |
| Django / FastAPI / Spring Boot | Obligan a usar un segundo lenguaje además de TypeScript en el front. |
| Firebase o Supabase como BaaS completo (sin backend propio) | Dejaría sin trabajo real al rol de backend y esconde la lógica de negocio (reservas, fianza, incidencias). |
| MongoDB | El dominio es muy relacional (reservas ↔ objetos ↔ usuarios ↔ pagos). |
| Neon (Postgres gestionado) | También gratuito, pero solo da la base de datos; Supabase además ofrece Storage y panel de datos en la misma cuenta. |
| PostgreSQL de Render | La base de datos gratuita caduca a los 30 días, y el proyecto dura hasta diciembre. |
| JWT sin estado | No se puede invalidar en el logout sin una lista de revocación, que es justo lo que ya es la tabla `sesion`. |
| Netlify (FE) | Equivalente a Vercel; elegimos Vercel por las previews de PR y la integración directa con Vite. |
| Railway / Heroku (BE) | Ya no tienen plan gratuito. |
| Azure App Service (ejemplo de teoría) | Posible con créditos de estudiante, pero exige más configuración (registro de contenedores, identidades) que Render para el mismo resultado. |
| Multi-repo (front y back separados) | Duplica CI, issues y plantillas sin que lo necesitemos. |

## Consecuencias

**Positivas**
- Todo el equipo trabaja en un solo lenguaje y con herramientas gratuitas.
- Vercel y Render despliegan solos al hacer merge a `main`; GitHub Actions solo tiene que hacer lint, tests y build.
- Prisma deja las migraciones versionadas en el repo, así la BD de producción se reconstruye igual que la local.

**Negativas / riesgos**
- **Render gratuito se "duerme"** tras 15 min sin tráfico (el primer acceso tarda unos 50 s). En las demos hay que abrir la URL un minuto antes.
- **Supabase gratuito pausa el proyecto** tras una semana sin actividad; hay que reactivarlo desde el panel si pasa.
- Front y back en dominios distintos: el backend tiene que configurar **CORS** con la URL de Vercel y la de las previews (punto 3 de [Configuración](#configuración-que-hay-que-respetar)).
- Las **previews de Vercel escriben en la base de datos de producción** (punto 4).
- La conexión a Supabase depende del **pooler**; si alguien usa la conexión directa, funcionará en local pero fallará en Render (punto 1).
- El token se guarda en el cliente (`localStorage`), por lo que hay que evitar XSS (React escapa por defecto; no usar `dangerouslySetInnerHTML`).

## Cómo se mantiene este ADR

El equipo validó el stack en la revisión del PR #130 y los esqueletos de FE (#31) y BE (#17) se crearon con él. A partir de aquí, este ADR solo se corrige para aclarar detalles. Si en el futuro cambia una decisión, se escribe un ADR nuevo que **sustituye** al anterior, y en este se cambia el estado a «Sustituido por ADR 000X». Las decisiones que salgan de los spikes (SP-01…SP-05) se registran como ADR nuevos (`0002-…`, `0003-…`) en esta carpeta.
