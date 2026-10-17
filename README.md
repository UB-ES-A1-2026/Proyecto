# Proyecto

## Backend en local

Requisitos: Node.js 22 y Docker con Docker Compose.

1. Inicia PostgreSQL desde la raíz del repositorio: `docker compose up -d`.
2. Copia `backend/.env.example` a `backend/.env`.
3. Instala las dependencias y aplica las migraciones desde `backend/`:
   ```bash
   cd backend
   npm install
   npm run db:migrate
   ```
4. Arranca el servidor con `npm run dev`. La API de salud está en
   `http://localhost:3000/api/health`.
5. Ejecuta `npm test` desde `backend/`; Vitest usa `backend/.env.test` y prepara
   la base de datos `rentit_test` antes de los tests.
