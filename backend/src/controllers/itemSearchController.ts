// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 01/11/2026
import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as itemSearchService from '../services/itemSearchService.js';

const MAX_TEXT_LENGTH = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Mismo formato que el precio al publicar (#14): hasta 8 cifras y 2 decimales.
const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

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

// Filtros de US-03.02 (#117) – revisado por Maxim Nicolau, 02/11/2026
function readCategoryId(value: unknown): string | undefined {
  const text = readQueryValue(value);
  if (!text) return undefined;
  if (!UUID_PATTERN.test(text)) {
    throw new AppError(
      400,
      'El campo "categoría" no es correcto, revísalo.',
      'categoryId',
    );
  }
  return text;
}

function readMaxPrice(value: unknown): string | undefined {
  const text = readQueryValue(value);
  if (!text) return undefined;
  if (!AMOUNT_PATTERN.test(text) || Number(text) <= 0) {
    throw new AppError(
      400,
      'El campo "precio máximo" no es correcto, revísalo.',
      'maxPrice',
    );
  }
  return text;
}

function readNeighborhood(value: unknown): string | undefined {
  const text = readQueryValue(value);
  if (!text) return undefined;
  if (text.length > MAX_TEXT_LENGTH) {
    throw new AppError(
      400,
      'El campo "barrio" no es correcto, revísalo.',
      'neighborhood',
    );
  }
  return text;
}

// GET /api/objetos?q=&categoryId=&maxPrice=&neighborhood=&page= (US-03.01 #114, US-03.02 #117).
// Público. Los criterios se combinan con AND. Sin ninguno devuelve todos los objetos
// publicados, que es lo que necesita «Limpiar filtros».
export const searchItems: RequestHandler = async (request, response) => {
  const criteria = {
    text: readText(request.query.q),
    categoryId: readCategoryId(request.query.categoryId),
    maxPrice: readMaxPrice(request.query.maxPrice),
    neighborhood: readNeighborhood(request.query.neighborhood),
  };
  const page = readPage(request.query.page);

  const result = await itemSearchService.searchItems(criteria, page);

  response.status(200).json(result);
};
