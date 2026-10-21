import { apiRequest } from './apiClient';

// Respuesta de GET /api/usuarios/me (#146).
export type UserProfile = {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
};

export function getProfile(token: string): Promise<UserProfile> {
  return apiRequest<UserProfile>('/usuarios/me', { token });
}
