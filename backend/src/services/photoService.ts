// Fotos de los objetos (US-02.01, #106), según el ADR 0002:
//   1. El propietario pide una URL de subida diciendo el tipo y el tamaño de la foto.
//   2. El navegador sube la foto directamente al bucket con esa URL (5 min).
//   3. El propietario confirma la clave: el backend comprueba el fichero subido y guarda solo la clave.
//   4. Para enseñarlas, el backend da URLs de lectura que caducan en 1 hora.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  createItemPhoto,
  findItemForPhotos,
  findItemPhotos,
  findPhotoByKey,
} from '../repositories/itemPhotoRepository.js';
import {
  createUploadUrl,
  createViewUrl,
  deleteStoredPhoto,
  findStoredPhoto,
  isStorageConfigured,
  readFirstBytes,
  UPLOAD_URL_SECONDS,
} from '../repositories/photoStorage.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS_PER_ITEM = 5;

// Tipos permitidos y su extensión. SVG no, porque puede llevar scripts (ADR 0002, regla 4).
const EXTENSION_BY_TYPE = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ITEM_NOT_FOUND = 'No existe ese objeto.';
const MAX_PHOTOS_MESSAGE = `Este objeto ya tiene ${MAX_PHOTOS_PER_ITEM} fotos, que es el máximo.`;
const INVALID_PHOTO_MESSAGE =
  'La foto no es válida: tiene que ser un JPG, PNG o WebP de 5 MB como máximo.';

export interface PhotoUpload {
  key: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface ItemPhotoView {
  id: string;
  key: string;
  order: number;
  url: string;
}

// Tipo real según los primeros bytes. El Content-Type lo pone el cliente y se puede falsear.
export function detectImageType(bytes: Uint8Array): string | null {
  const startsWith = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.slice(from, to));

  if (startsWith([0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

// Valida lo que el cliente declara al pedir la URL de subida.
export function validatePhotoRequest(body: unknown): {
  contentType: string;
  size: number;
} {
  const { contentType, size } = (body ?? {}) as Record<string, unknown>;

  if (typeof contentType !== 'string' || !EXTENSION_BY_TYPE.has(contentType)) {
    throw new AppError(
      400,
      'Solo se pueden subir fotos JPG, PNG o WebP.',
      'contentType',
    );
  }
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
    throw new AppError(400, 'El tamaño de la foto no es válido.', 'size');
  }
  if (size > MAX_PHOTO_BYTES) {
    throw new AppError(400, 'La foto no puede ocupar más de 5 MB.', 'size');
  }

  return { contentType, size };
}

async function findOwnedItem(userId: string, itemId: string) {
  const item = UUID_PATTERN.test(itemId)
    ? await findItemForPhotos(itemId)
    : null;

  if (!item) {
    throw new AppError(404, ITEM_NOT_FOUND);
  }
  if (item.ownerId !== userId) {
    throw new AppError(
      403,
      'Solo el propietario puede añadir fotos a este objeto.',
    );
  }
  if (item.status === 'withdrawn') {
    throw new AppError(409, 'No se pueden añadir fotos a un objeto retirado.');
  }

  return item;
}

export async function requestPhotoUpload(
  userId: string,
  itemId: string,
  body: unknown,
): Promise<PhotoUpload> {
  await findOwnedItem(userId, itemId);
  const { contentType, size } = validatePhotoRequest(body);

  if ((await findItemPhotos(itemId)).length >= MAX_PHOTOS_PER_ITEM) {
    throw new AppError(409, MAX_PHOTOS_MESSAGE);
  }

  // La clave la decide siempre el backend, nunca el cliente.
  const key = `objetos/${itemId}/${randomUUID()}.${EXTENSION_BY_TYPE.get(contentType)}`;
  const uploadUrl = await createUploadUrl(key, contentType, size);

  return { key, uploadUrl, expiresIn: UPLOAD_URL_SECONDS };
}

// Comprueba el fichero ya subido (tamaño, tipo y bytes) y guarda su clave. Si no es válido, lo borra.
export async function confirmPhotoUpload(
  userId: string,
  itemId: string,
  body: unknown,
): Promise<ItemPhotoView> {
  await findOwnedItem(userId, itemId);

  const { key } = (body ?? {}) as Record<string, unknown>;
  const keyPattern = new RegExp(
    `^objetos/${itemId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`,
  );
  if (typeof key !== 'string' || !keyPattern.test(key)) {
    throw new AppError(400, 'La clave de la foto no es válida.', 'key');
  }

  if (await findPhotoByKey(key)) {
    throw new AppError(409, 'Esta foto ya está guardada.', 'key');
  }

  const photos = await findItemPhotos(itemId);
  if (photos.length >= MAX_PHOTOS_PER_ITEM) {
    // No se guardará nunca: se borra para no dejar ficheros huérfanos en el bucket.
    await deleteStoredPhoto(key);
    throw new AppError(409, MAX_PHOTOS_MESSAGE);
  }

  const stored = await findStoredPhoto(key);
  if (!stored) {
    throw new AppError(
      400,
      'No se ha subido ninguna foto con esa clave.',
      'key',
    );
  }

  const expectedType = [...EXTENSION_BY_TYPE].find(([, extension]) =>
    key.endsWith(`.${extension}`),
  )?.[0];
  const realType = detectImageType(await readFirstBytes(key, 12));
  if (
    stored.size > MAX_PHOTO_BYTES ||
    stored.contentType !== expectedType ||
    realType !== expectedType
  ) {
    await deleteStoredPhoto(key);
    throw new AppError(400, INVALID_PHOTO_MESSAGE, 'key');
  }

  const usedOrders = new Set(photos.map(({ order }) => order));
  const order =
    Array.from({ length: MAX_PHOTOS_PER_ITEM }, (_, index) => index + 1).find(
      (candidate) => !usedOrders.has(candidate),
    ) ?? MAX_PHOTOS_PER_ITEM;

  try {
    const photo = await createItemPhoto({ itemId, key, order });
    return { id: photo.id, key, order, url: await createViewUrl(key) };
  } catch (error) {
    // Dos confirmaciones a la vez: el índice único (objeto, orden) o (clave) para a la segunda.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new AppError(
        409,
        'Se ha guardado otra foto a la vez. Vuelve a intentarlo.',
      );
    }
    throw error;
  }
}

// Fotos de un objeto con su URL de lectura, para la ficha, la búsqueda y «Mis objetos».
// Si el almacenamiento no está configurado devuelve [] en lugar de fallar.
export async function listItemPhotos(itemId: string): Promise<ItemPhotoView[]> {
  if (!isStorageConfigured()) {
    return [];
  }

  const photos = await findItemPhotos(itemId);
  return Promise.all(
    photos.map(async ({ id, key, order }) => ({
      id,
      key,
      order,
      url: await createViewUrl(key),
    })),
  );
}
