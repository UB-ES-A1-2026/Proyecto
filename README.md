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
4. Carga los usuarios de prueba con `npm run db:seed` (también se cargan solos
   tras `npm run db:reset`): `ana@rentit.test`, `bruno@rentit.test` y
   `admin@rentit.test` (administrador), todos con la contraseña `Rentit2026`.
5. Arranca el servidor con `npm run dev`. La API de salud está en
   `http://localhost:3000/api/health`.
6. Ejecuta `npm test` desde `backend/`; Vitest usa `backend/.env.test` y prepara
   la base de datos `rentit_test` antes de los tests.
