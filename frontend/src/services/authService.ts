import { apiRequest } from './apiClient';

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  role: string;
};

// Respuesta de POST /api/auth/login (#136); es también la sesión que se guarda en el navegador.
export type Session = {
  token: string;
  expiresAt: string;
  user: AuthUser;
};

export function login(email: string, password: string): Promise<Session> {
  return apiRequest<Session>('/auth/login', {
    method: 'POST',
    body: { email: email.trim(), password },
  });
}
