import { AppError } from '../errors/appError.js';
import { findUserById } from '../repositories/userRepository.js';

const INVALID_SESSION_MESSAGE =
  'Sesión no válida o caducada. Inicia sesión de nuevo.';

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: Date;
}

// Generado con asistencia de IA – revisado por Danyal, 19/10/2026
export async function getProfile(userId: string): Promise<UserProfile> {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(401, INVALID_SESSION_MESSAGE);
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}
