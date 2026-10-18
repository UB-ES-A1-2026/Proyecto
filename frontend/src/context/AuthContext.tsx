import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '../services/authService';
import { AuthContext } from './authContextValue';

export const SESSION_STORAGE_KEY = 'rentit.session';

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const user = candidate.user as Record<string, unknown> | null | undefined;
  return (
    typeof candidate.token === 'string' &&
    typeof candidate.expiresAt === 'string' &&
    typeof user === 'object' &&
    user !== null &&
    typeof user.id === 'string' &&
    typeof user.username === 'string'
  );
}

// Lee la sesión de localStorage y descarta la que esté caducada o mal formada.
function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (isSession(parsed) && Date.parse(parsed.expiresAt) > Date.now()) return parsed;
  } catch {
    // JSON inválido: se trata igual que una sesión caducada.
  }
  localStorage.removeItem(SESSION_STORAGE_KEY);
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readStoredSession);

  const saveSession = useCallback((newSession: Session) => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
    setSession(newSession);
  }, []);

  // Solo borra la sesión en el navegador; la llamada a POST /api/auth/logout es #104.
  const clearSession = useCallback(() => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, saveSession, clearSession }),
    [session, saveSession, clearSession],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
