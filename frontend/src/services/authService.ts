import { apiRequest } from './apiClient';

// Estado de la solicitud de una cuenta de rider (US-10.03); null si la cuenta no es de rider.
export type RiderStatus = 'pending' | 'approved' | 'rejected';

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  role: string;
  // US-10.03 (#322): las cuentas de rider no alquilan ni publican. Opcionales para las sesiones
  // guardadas antes de esta historia.
  isRider?: boolean;
  riderStatus?: RiderStatus | null;
  // Motivo del rechazo del admin (US-11.03). Aún no lo manda la API: se ha pedido a T34.
  rejectionReason?: string | null;
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
