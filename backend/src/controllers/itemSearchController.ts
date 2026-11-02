// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 01/11/2026
import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as itemSearchService from '../services/itemSearchService.js';

const MAX_TEXT_LENGTH = 100;

function readQueryValue(value: unknown): string | undefined {
  // ?q=a&q=b llega como array: nos quedamos con el primero.
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first.trim() : undefined;
}

function readPage(value: unknown): number {
  const text = readQueryValue(value);
  if (text === undefined || text === '') return 1;

  const page = Number(text);
  if (!/^\d+$/.test(text) || page < 1 || page > 10_000) {
    throw new AppError(
      400,
      'El campo "página" no es correcto, revísalo.',
      'page',
    );
  }
  return page;
}

function readText(value: unknown): string | undefined {
  const text = readQueryValue(value);
  if (!text) return undefined;
  if (text.length > MAX_TEXT_LENGTH) {
    throw new AppError(
      400,
      'El campo "búsqueda" no es correcto, revísalo.',
      'q',
    );
  }
  return text;
}

// GET /api/objetos?q=&page= (US-03.01, #114). Público. Sin texto devuelve todos los objetos
// publicados, que es lo que necesita «Limpiar filtros» de US-03.02.
export const searchItems: RequestHandler = async (request, response) => {
  const text = readText(request.query.q);
  const page = readPage(request.query.page);

  const result = await itemSearchService.searchItems({ text }, page);

  response.status(200).json(result);
};
