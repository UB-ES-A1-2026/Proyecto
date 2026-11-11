// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026
import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import { isKnownNeighborhood } from '../services/neighborhoods.js';
import { parseAddress } from '../services/itemDelivery.js';
import * as itemEditService from '../services/itemEditService.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Importe con hasta 2 decimales y que quepa en DECIMAL(10, 2), como al publicar (#14).
const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

function invalid(field: string, label: string): never {
  throw new AppError(
    400,
    `El campo "${label}" no es correcto, revísalo.`,
    field,
  );
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

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Los modos de entrega y la dirección son opcionales al editar (US-05.01, #281): lo que no se envía
// no cambia. El service valida el resultado completo.
function readOptionalFlag(
  value: unknown,
  field: string,
  label: string,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') invalid(field, label);
  return value;
}

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// El barrio es opcional al editar, pero si se envía tiene que ser de la lista, como al publicar.
function readOptionalNeighborhood(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const neighborhood = readText(value, 'neighborhood', 'barrio', 100);
  if (!isKnownNeighborhood(neighborhood)) invalid('neighborhood', 'barrio');
  return neighborhood;
}

function readChanges(body: unknown): itemEditService.ItemChanges {
  const fields =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};

  return {
    homeDelivery: readOptionalFlag(
      fields.homeDelivery,
      'homeDelivery',
      'entrega a domicilio',
    ),
    riderDelivery: readOptionalFlag(
      fields.riderDelivery,
      'riderDelivery',
      'entrega con rider',
    ),
    pickupPointDelivery: readOptionalFlag(
      fields.pickupPointDelivery,
      'pickupPointDelivery',
      'punto de recogida',
    ),
    // undefined no cambia la dirección; vacía, con solo espacios o null la borra.
    address:
      fields.address === undefined ? undefined : parseAddress(fields.address),
    neighborhood: readOptionalNeighborhood(fields.neighborhood),
    title: readText(fields.title, 'title', 'nombre', 100),
    description: readText(
      fields.description,
      'description',
      'descripción',
      2000,
    ),
    dailyPrice: readAmount(fields.dailyPrice, 'dailyPrice', 'precio', {
      allowZero: false,
    }),
    deposit: readAmount(fields.deposit, 'deposit', 'fianza', {
      allowZero: true,
    }),
  };
}

// GET /api/usuarios/me/objetos (US-02.02, #108). requireAuth garantiza que request.auth existe.
export const getMyItems: RequestHandler = async (request, response) => {
  const items = await itemEditService.getMyItems(request.auth!.userId);

  response.status(200).json(items);
};

// PATCH /api/objetos/:id (US-02.02, #108).
export const updateItem: RequestHandler = async (request, response) => {
  const id = String(request.params.id);

  // Un id que no es un UUID no puede existir: 404 igual que un objeto que no existe.
  if (!UUID_PATTERN.test(id)) {
    throw new AppError(404, itemEditService.ITEM_NOT_FOUND_MESSAGE);
  }

  const item = await itemEditService.updateItem(
    id,
    request.auth!.userId,
    readChanges(request.body),
  );

  response.status(200).json(item);
};
