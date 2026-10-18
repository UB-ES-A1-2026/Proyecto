# Rentit · Frontend

React 19 + Vite + React Router + TypeScript (ver `docs/adr/0001-stack.md`).

## Arrancar en local

Requisitos: Node.js 22.

```bash
cd frontend
cp .env.example .env   # VITE_API_URL apunta al backend local (http://localhost:3000/api)
npm install
npm run dev            # http://localhost:5173
```

Con el backend arrancado (`backend/`, `npm run dev`) y el seed cargado, puedes iniciar sesión en `/login` con `ana@rentit.test` / `Rentit2026`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run lint` | ESLint |
| `npm test` | Tests con Vitest + Testing Library (`tests/`) |
| `npm run build` | Comprobación de tipos y build de producción en `dist/` |
| `npm run format` | Formatea con Prettier |

## Estructura

```text
src/
├── pages/       # Una página por pantalla (HomePage, NotFoundPage…)
├── components/  # Componentes reutilizables (Layout…)
├── services/    # Llamadas a la API: apiClient.ts es la única que usa fetch
├── context/     # Estado global (AuthContext llegará con el login, #27)
├── routes/      # routes.tsx: definición de todas las rutas
└── main.tsx
tests/           # Tests (renderRoute.tsx renderiza la app en una URL)
```

- Para añadir una pantalla: crea `src/pages/MiPagina.tsx` y añádela a `src/routes/routes.tsx`.
- Para llamar a la API: crea una función en `src/services/` que use `apiRequest`. Los errores llegan como `ApiError` con `status`, `message` y `field` (formato `{ error, field }` del backend).
