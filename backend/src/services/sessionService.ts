// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 18/10/2026
// Única forma de crear, validar y revocar sesiones (ver AGENTS.md). El registro (#23) también la usa.
import { createHash, randomBytes } from 'node:crypto';
import {
  findSessionByTokenHash,
  insertSession,
  markSessionRevoked,
} from '../repositories/sessionRepository.js';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await insertSession({ userId, tokenHash: hashToken(token), expiresAt });

  return { token, expiresAt };
}

// Devuelve la sesión si existe, no está revocada y no ha caducado; si no, null.
export async function findValidSession(token: string) {
  const session = await findSessionByTokenHash(hashToken(token));

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  return session;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await markSessionRevoked(sessionId, new Date());
}
