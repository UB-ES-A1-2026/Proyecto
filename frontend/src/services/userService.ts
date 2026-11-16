import { apiRequest } from './apiClient';
import type { RiderStatus } from './authService';

// Respuesta de GET /api/usuarios/me (#146). Con US-10.03 (#322) trae también si la cuenta es de
// rider y el estado de su solicitud; el motivo del rechazo llegará cuando lo mande la API (T34).
export type UserProfile = {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  isRider?: boolean;
  riderStatus?: RiderStatus | null;
  rejectionReason?: string | null;
};

export function getProfile(token: string): Promise<UserProfile> {
  return apiRequest<UserProfile>('/usuarios/me', { token });
}
