import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as authService from '../services/authService.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;

const INVALID_USERNAME_MESSAGE =
  'El campo "nombre de usuario" no está correctamente introducido, prueba a revisarlo.';
const INVALID_REGISTER_EMAIL_MESSAGE =
  'El campo "correo electrónico" no está correctamente introducido, prueba a revisarlo.';
const INVALID_REGISTER_PASSWORD_MESSAGE =
  'El campo "contraseña" no está correctamente introducido, prueba a revisarlo.';

// Generado con asistencia de IA – revisado por Danyal, 19/10/2026
function readRegisterBody(
  body: unknown,
): { username: string; email: string; password: string } {
  const fields =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const { username, email, password } = fields;
  const normalizedUsername =
    typeof username === 'string' ? username.trim() : '';

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    throw new AppError(400, INVALID_USERNAME_MESSAGE, 'username');
  }

  const normalizedEmail = typeof email === 'string' ? email.trim() : '';
  if (
    normalizedEmail.length > 255 ||
    !EMAIL_PATTERN.test(normalizedEmail)
  ) {
    throw new AppError(400, INVALID_REGISTER_EMAIL_MESSAGE, 'email');
  }

  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new AppError(400, INVALID_REGISTER_PASSWORD_MESSAGE, 'password');
  }

  return {
    username: normalizedUsername,
    email: normalizedEmail.toLowerCase(),
    password,
  };
}

function readLoginBody(body: unknown): { email: string; password: string } {
  const { email, password } = (body ?? {}) as Record<string, unknown>;

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    throw new AppError(400, authService.INVALID_EMAIL_MESSAGE, 'email');
  }

  if (typeof password !== 'string' || password.length === 0) {
    throw new AppError(400, authService.INVALID_PASSWORD_MESSAGE, 'password');
  }

  return { email, password };
}

export const register: RequestHandler = async (request, response) => {
  const input = readRegisterBody(request.body);
  const result = await authService.register(input);

  response.status(201).json(result);
};

export const login: RequestHandler = async (request, response) => {
  const { email, password } = readLoginBody(request.body);
  const result = await authService.login(email, password);

  response.status(200).json(result);
};

export const logout: RequestHandler = async (request, response) => {
  // requireAuth garantiza que request.auth existe.
  await authService.logout(request.auth!.sessionId);

  response.status(204).end();
};
