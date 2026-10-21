import { apiRequest } from './apiClient';

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  role: string;
};

// Respuesta de POST /api/auth/login (#136) y /api/auth/register (#145); es también la sesión
// que se guarda en el navegador.
export type Session = {
  token: string;
  expiresAt: string;
  user: AuthUser;
};

export function register(username: string, email: string, password: string): Promise<Session> {
  return apiRequest<Session>('/auth/register', {
    method: 'POST',
    body: { username: username.trim(), email: email.trim(), password },
  });
}

export function login(email: string, password: string): Promise<Session> {
  return apiRequest<Session>('/auth/login', {
    method: 'POST',
    body: { email: email.trim(), password },
  });
}

// Invalida la sesión en el backend (rellena revocada_en). Responde 204.
export function logout(token: string): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST', token });
}
