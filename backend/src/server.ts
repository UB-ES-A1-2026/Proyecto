import { app } from './app.js';
import { env } from './config/env.js';
import { closeAll } from './services/realtimeService.js';

const server = app.listen(env.port, () => {
  console.info(`Backend escuchando en el puerto ${env.port}`);
});

// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
// Render manda SIGTERM al redesplegar y espera 30 s: se cierran los streams SSE de forma ordenada
// (los clientes reconectan y hacen resync) y luego el servidor.
const FORCE_EXIT_MS = 10_000;

function shutdown(signal: string) {
  console.info(`${signal} recibido: cerrando streams y servidor`);
  closeAll();
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), FORCE_EXIT_MS).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
