import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as authService from '../services/authService.js';

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

export const login: RequestHandler = async (request, response) => {
  const { email, password } = readLoginBody(request.body);
  const result = await authService.login(email, password);

  response.status(200).json(result);
};
