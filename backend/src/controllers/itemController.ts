// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 01/11/2026
import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as itemService from '../services/itemService.js';
import { parseAddress } from '../services/itemDelivery.js';
import { invalidFieldMessage } from '../services/itemService.js';
import { isKnownNeighborhood } from '../services/neighborhoods.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Importe con hasta 2 decimales y que quepa en DECIMAL(10, 2).
const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

function invalid(field: string, label: string): never {
  throw new AppError(400, invalidFieldMessage(label), field);
}

function readText(
  value: unknown,
  field: string,
  label: string,
  maxLength: number,
): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0 || text.length > maxLength) invalid(field, label);
  return text;
}

// Acepta número (5, 7.5) o texto ("7.50"). Devuelve el importe como texto para no perder
// precisión al guardarlo en DECIMAL.
function readAmount(
  value: unknown,
  field: string,
  label: string,
  { allowZero }: { allowZero: boolean },
): string {
  const text =
    typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  if (!AMOUNT_PATTERN.test(text)) invalid(field, label);
  if (!allowZero && Number(text) === 0) invalid(field, label);
  return text;
}

function readFlag(value: unknown, field: string, label: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') invalid(field, label);
  return value;
}

function readPublishBody(body: unknown): itemService.PublishItemInput {
  const fields =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const title = readText(fields.title, 'title', 'nombre', 100);
  const description = readText(
    fields.description,
    'description',
    'descripción',
    2000,
  );

  const { categoryId } = fields;
  if (typeof categoryId !== 'string' || !UUID_PATTERN.test(categoryId)) {
    invalid('categoryId', 'categoría');
  }

  const dailyPrice = readAmount(fields.dailyPrice, 'dailyPrice', 'precio', {
    allowZero: false,
  });
  const deposit =
    fields.deposit === undefined
      ? '0'
      : readAmount(fields.deposit, 'deposit', 'fianza', { allowZero: true });
  const neighborhood = readText(
    fields.neighborhood,
    'neighborhood',
    'barrio',
    100,
  );

  // Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
  // El barrio se elige de la lista fija de barrios (US-05.01, #281).
  if (!isKnownNeighborhood(neighborhood)) {
    invalid('neighborhood', 'barrio');
  }

  // Opcional: solo es obligatoria con entrega en casa o por rider, y eso lo comprueba el service.
  // Vacía o con solo espacios cuenta como sin dirección.
  const address = parseAddress(fields.address);

  const homeDelivery = readFlag(
    fields.homeDelivery,
    'homeDelivery',
    'entrega a domicilio',
  );
  const riderDelivery = readFlag(
    fields.riderDelivery,
    'riderDelivery',
    'entrega con rider',
  );
  const pickupPointDelivery = readFlag(
    fields.pickupPointDelivery,
    'pickupPointDelivery',
    'punto de recogida',
  );

  // «Disponibilidad» del criterio 1: publicado ya o pausado (contrato de #14).
  const status = fields.status ?? 'published';
  if (status !== 'published' && status !== 'paused') {
    invalid('status', 'disponibilidad');
  }

  return {
    title,
    description,
    categoryId,
    dailyPrice,
    deposit,
    neighborhood,
    address,
    homeDelivery,
    riderDelivery,
    pickupPointDelivery,
    status,
  };
}

export const publishItem: RequestHandler = async (request, response) => {
  const input = readPublishBody(request.body);
  const item = await itemService.publishItem(request.auth!.userId, input);

  response.status(201).json(item);
};
