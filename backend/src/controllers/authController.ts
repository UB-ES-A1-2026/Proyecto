import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as authService from '../services/authService.js';
// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
// La validación de registro se movió a accountFields.ts para compartirla con el alta de rider.
import { readAccountFields } from './accountFields.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const input = readAccountFields(request.body);
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
