// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 18/10/2026
import bcrypt from 'bcrypt';
import { AppError } from '../errors/appError.js';
import { findUserByEmail } from '../repositories/userRepository.js';
import { createSession, revokeSession } from './sessionService.js';

// Mensajes del criterio de aceptación de US-01.2: «El campo "X" no es correcto, revísalo».
export const INVALID_EMAIL_MESSAGE =
  'El campo "correo electrónico" no es correcto, revísalo.';
export const INVALID_PASSWORD_MESSAGE =
  'El campo "contraseña" no es correcto, revísalo.';

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: { id: string; username: string; email: string; role: string };
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  const user = await findUserByEmail(email.trim().toLowerCase());

  if (!user) {
    throw new AppError(401, INVALID_EMAIL_MESSAGE, 'email');
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, INVALID_PASSWORD_MESSAGE, 'password');
  }

  if (user.status === 'blocked') {
    throw new AppError(
      403,
      'Tu cuenta está bloqueada. Contacta con el administrador.',
    );
  }

  const { token, expiresAt } = await createSession(user.id);

  return {
    token,
    expiresAt,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  };
}

export async function logout(sessionId: string): Promise<void> {
  await revokeSession(sessionId);
}
