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

// Perfil público de un usuario (US-01.4, #300): lo devuelven GET /api/usuarios/:id, PATCH
// /api/usuarios/me y la confirmación de la foto. Nunca lleva el correo ni el rol.
export type PublicProfile = {
  id: string;
  username: string;
  bio: string | null;
  photo: string | null;
  memberSince: string;
  // La media la calcula el backend con las valoraciones recibidas (US-08.01); sin ninguna, es null.
  rating: { average: number | null; count: number };
  // Solo los objetos publicados, del más nuevo al más antiguo.
  items: {
    id: string;
    title: string;
    dailyPrice: string;
    neighborhood: string;
    photo: string | null;
  }[];
  // Solo es true si lo mira el propio usuario.
  isOwnProfile: boolean;
};

// Pública: con sesión, el backend sabe si es tu propio perfil.
export function getPublicProfile(id: string, token?: string): Promise<PublicProfile> {
  return apiRequest<PublicProfile>(`/usuarios/${encodeURIComponent(id)}`, { token });
}

// Para borrar la bio hay que mandar "": con null la API responde 400.
export function updateBio(token: string, bio: string): Promise<PublicProfile> {
  return apiRequest<PublicProfile>('/usuarios/me', { method: 'PATCH', token, body: { bio } });
}

export function deleteProfilePhoto(token: string): Promise<void> {
  return apiRequest<void>('/usuarios/me/foto', { method: 'DELETE', token });
}
