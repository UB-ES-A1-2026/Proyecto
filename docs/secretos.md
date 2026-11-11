# Secretos y variables de entorno

Dónde va cada variable de Rentit, qué no se sube nunca y qué hacer si se filtra una clave (TR-07 · #88, tarea #100). **El repositorio es público**: todo lo que llega a GitHub lo puede leer cualquiera, también en el historial.

> Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026.
> Sección de preproducción (US-12.03): generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026.

## Reglas

1. **Nunca se sube un secreto**: claves, tokens, contraseñas reales ni URLs de base de datos con credenciales reales. Tampoco en issues, PRs, comentarios ni capturas.
2. Las variables nuevas se añaden a `backend/.env.example` o `frontend/.env.example` **con un valor de ejemplo**, nunca con el real (AGENTS.md).
3. Los `.env` reales están en `.gitignore`. La única excepción es `backend/.env.test`, que solo apunta a la BD local de tests de Docker (`rentit:rentit`).
4. En el frontend **todo es público**: las variables `VITE_*` acaban dentro del JavaScript que descarga el navegador. Ahí solo van URLs públicas, nunca claves.
5. Cada secreto se guarda en un solo sitio por entorno (ver la tabla) y lo configura la persona de DevOps del sprint.

## Dónde va cada variable

| Variable | Para qué | Local | Producción | ¿Secreto? |
|---|---|---|---|---|
| `PORT` | Puerto del backend | `backend/.env` (`3000`) | Lo pone Render | No |
| `DATABASE_URL` | Conexión de la app a PostgreSQL | `backend/.env` (Docker) | Render (pooler *transaction* de Supabase) | **Sí** |
| `DIRECT_URL` | Conexión para las migraciones | `backend/.env` (Docker) | Render (pooler *session* de Supabase) | **Sí** |
| `CORS_ORIGINS` | Orígenes del frontend permitidos | `backend/.env` (`http://localhost:5173`) | Render (URL de Vercel) | No |
| `CORS_PREVIEW_PATTERN` | Previews de Vercel permitidas (opcional) | — | Render | No |
| `BCRYPT_ROUNDS` | Coste de bcrypt | `backend/.env` (`10`) | Render | No |
| `S3_*` | Almacenamiento de fotos (ADR 0002, #106) | `backend/.env` (S3 local) | Render | **Sí** (las claves) |
| `VITE_API_URL` | URL de la API para el frontend | `frontend/.env` | Vercel (Production y Preview) | No (es pública) |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Desplegar el frontend desde Actions | — | GitHub → *Secrets and variables → Actions* | **Sí** (el token) |
| `RENDER_DEPLOY_HOOK_URL` | Lanzar el despliegue del backend | — | GitHub → *Secrets* | **Sí** |
| `API_URL` | Comprobar la API tras desplegar | — | GitHub → *Variables* | No |

### Preproducción (`staging`, US-12.03)

Preproducción tiene sus propios servicios y claves, en otras cuentas. Todo va en el **Environment `staging`** de GitHub (restringido a la rama `staging`) y con nombres **distintos** a los de producción: si un secreto de staging se llamara igual que uno de producción del repo y faltara, GitHub usaría el de producción sin avisar.

| Nombre | Tipo | Para qué |
|---|---|---|
| `STAGING_RENDER_DEPLOY_HOOK_URL` | Secreto | Lanzar el despliegue de `rentit-api-staging` |
| `STAGING_VERCEL_TOKEN`, `STAGING_VERCEL_ORG_ID`, `STAGING_VERCEL_PROJECT_ID` | Secreto (el token, sobre todo) | Desplegar el frontend de preproducción |
| `STAGING_DATABASE_URL`, `STAGING_DIRECT_URL` | Secreto | Migraciones y datos de demo en la BD de preproducción |
| `STAGING_DEMO_PASSWORD` | Secreto | Contraseña de las cuentas de demo de preproducción |
| `STAGING_API_URL`, `STAGING_WEB_URL` | Variable | URL de la API y de la web de preproducción (comprobación y smoke test) |

Las variables de `rentit-api-staging` en Render (`DATABASE_URL`, `S3_*`, `CORS_ORIGINS`…) son las de la tabla de arriba, con los valores de preproducción. Cómo se configura: [docs/despliegue.md](despliegue.md#preproducción-staging).

Cómo se configuran los de producción: [docs/despliegue.md](despliegue.md).

## gitleaks en el CI

El workflow [`.github/workflows/secretos.yml`](../.github/workflows/secretos.yml) revisa **todo el historial** con [gitleaks](https://github.com/gitleaks/gitleaks) en cada PR hacia `develop`, `staging`, `main` y las ramas `feature/`, y en cada push a `develop`, `staging` y `main`. Si encuentra algo, el check «Secretos / gitleaks» sale en rojo y el log indica el archivo, el commit y la regla (con el valor tapado).

Para revisarlo en local antes de subir (con Docker):

```bash
docker run --rm -v "$(pwd):/repo" ghcr.io/gitleaks/gitleaks:v8.21.2 git /repo --redact -v
```

En Windows con Git Bash: `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/repo" …`.

## Si se filtra un secreto

Borrarlo en un commit nuevo **no basta**: sigue en el historial y en las copias de cualquiera que haya hecho `git pull`.

1. **Invalídalo de inmediato** en su servicio: cambia la contraseña de la BD en Supabase, revoca el token en Vercel o regenera el deploy hook en Render.
2. Pon el valor nuevo solo en su sitio (tabla de arriba).
3. Avisa al equipo y quita el valor del código en un PR.
4. Si gitleaks marca algo que no es un secreto (un valor de ejemplo), se puede añadir una excepción en un `.gitleaks.toml` en la raíz, en un PR revisado y explicando por qué.
