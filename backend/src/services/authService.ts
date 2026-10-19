// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 18/10/2026
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { AppError } from '../errors/appError.js';
import {
  createUser,
  findUserByEmail,
  findUserByUsername,
} from '../repositories/userRepository.js';
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

const REGISTER_EMAIL_TAKEN_MESSAGE =
  'Ya existe una cuenta con este correo electrónico.';
const REGISTER_USERNAME_TAKEN_MESSAGE =
  'Este nombre de usuario ya está en uso.';

function uniqueConstraintField(error: unknown): 'email' | 'username' | null {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return null;
  }

  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target : [target];

  if (fields.some((field) => field === 'email')) return 'email';
  if (
    fields.some(
      (field) => field === 'username' || field === 'nombre_usuario',
    )
  ) {
    return 'username';
  }
  return null;
}

function throwRegistrationConflict(field: 'email' | 'username'): never {
  if (field === 'email') {
    throw new AppError(409, REGISTER_EMAIL_TAKEN_MESSAGE, 'email');
  }
  throw new AppError(409, REGISTER_USERNAME_TAKEN_MESSAGE, 'username');
}

// Generado con asistencia de IA – revisado por Danyal, 19/10/2026
export async function register(input: {
  username: string;
  email: string;
  password: string;
}): Promise<LoginResult> {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();

  if (await findUserByEmail(email)) {
    throwRegistrationConflict('email');
  }

  if (await findUserByUsername(username)) {
    throwRegistrationConflict('username');
  }

  const passwordHash = await bcrypt.hash(input.password, env.bcryptRounds);
  let user: Awaited<ReturnType<typeof createUser>>;

  try {
    user = await createUser({ username, email, passwordHash });
  } catch (error) {
    const field = uniqueConstraintField(error);
    if (field) throwRegistrationConflict(field);
    throw error;
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
