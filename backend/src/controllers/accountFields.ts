// Generado con asistencia de IA – revisado por Danyal, 19/10/2026
// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
// Validación de los datos de cuenta (nombre de usuario, correo y contraseña) de US-01.1. Se
// movió aquí desde authController para que el alta de rider (US-10.03) use exactamente las mismas
// reglas y mensajes que el registro.
import { AppError } from '../errors/appError.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;

const INVALID_USERNAME_MESSAGE =
  'El campo "nombre de usuario" no está correctamente introducido, prueba a revisarlo.';
const INVALID_REGISTER_EMAIL_MESSAGE =
  'El campo "correo electrónico" no está correctamente introducido, prueba a revisarlo.';
const INVALID_REGISTER_PASSWORD_MESSAGE =
  'El campo "contraseña" no está correctamente introducido, prueba a revisarlo.';

export interface AccountFields {
  username: string;
  email: string;
  password: string;
}

// Convierte el cuerpo de la petición en un objeto del que se pueden leer campos sin `any`.
export function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

export function readAccountFields(body: unknown): AccountFields {
  const { username, email, password } = asRecord(body);
  const normalizedUsername =
    typeof username === 'string' ? username.trim() : '';

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    throw new AppError(400, INVALID_USERNAME_MESSAGE, 'username');
  }

  const normalizedEmail = typeof email === 'string' ? email.trim() : '';
  if (normalizedEmail.length > 255 || !EMAIL_PATTERN.test(normalizedEmail)) {
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
