import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/appError.js';

function isJsonParseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: unknown }).type === 'entity.parse.failed'
  );
}

export const errorMiddleware: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  if (error instanceof AppError) {
    response
      .status(error.status)
      .json(
        error.field
          ? { error: error.message, field: error.field }
          : { error: error.message },
      );
    return;
  }

  if (isJsonParseError(error)) {
    response
      .status(400)
      .json({ error: 'El cuerpo de la petición no es un JSON válido' });
    return;
  }

  console.error(error);
  response.status(500).json({ error: 'Error interno del servidor' });
};
