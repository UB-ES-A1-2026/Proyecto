// Fotos del estado del objeto (US-09.02, #77, tarea #454). Contrato en docs/modelo-datos.md.
// El propietario sube de 1 a 5 fotos antes de entregar el objeto y las confirma: desde entonces no
// se pueden cambiar. Las ven las dos personas de la reserva. Las fotos se suben como las de los
// objetos (ADR 0002): URL de subida → PUT al bucket → confirmar la clave.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 27/11/2026
import { Prisma, type StatePhotoPhase } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  createUploadUrl,
  createViewUrl,
  deleteStoredPhoto,
  isStorageConfigured,
  UPLOAD_URL_SECONDS,
} from '../repositories/photoStorage.js';
import {
  confirmStatePhotos,
  createStatePhoto,
  deleteUnconfirmedStatePhoto,
  findAllStatePhotos,
  findStatePhotoByKey,
  findStatePhotos,
} from '../repositories/statePhotoRepository.js';
import { loadTracking } from './deliveryTrackingService.js';
import {
  newPhotoKey,
  validatePhotoRequest,
  verifyStoredImage,
  type PhotoUpload,
} from './photoService.js';

export const MAX_STATE_PHOTOS = 5;

export const NOT_PARTICIPANT_MESSAGE =
  'Solo las personas de esta reserva pueden ver las fotos del estado.';
export const NOT_OWNER_MESSAGE =
  'Solo el propietario puede subir las fotos del estado.';
export const NOT_BEFORE_DELIVERY_MESSAGE =
  'Las fotos de la entrega se suben antes de entregar el objeto.';
export const ALREADY_CONFIRMED_MESSAGE =
  'Las fotos ya están confirmadas y no se pueden cambiar.';
export const MAX_PHOTOS_MESSAGE = `Ya hay ${MAX_STATE_PHOTOS} fotos, que es el máximo.`;
export const NO_PHOTOS_MESSAGE = 'Sube al menos una foto.';
export const PHOTO_NOT_FOUND_MESSAGE = 'No existe esa foto.';
export const UNKNOWN_PHASE_MESSAGE = 'No existe esa fase de fotos.';
export const INVALID_KEY_MESSAGE = 'La clave de la foto no es válida.';

// La fase va en la URL en español, como en la BD. US-09.03 añadirá «devolucion».
const PHASE_BY_SLUG: Record<string, StatePhotoPhase> = { entrega: 'delivery' };
const SLUG_BY_PHASE: Record<StatePhotoPhase, string> = {
  delivery: 'entrega',
  return: 'devolucion',
};

export function parsePhase(slug: string): StatePhotoPhase {
  const phase = PHASE_BY_SLUG[slug];
  if (!phase) throw new AppError(404, UNKNOWN_PHASE_MESSAGE);
  return phase;
}

export interface StatePhotoView {
  id: string;
  order: number;
  // URL de lectura (1 h), o null si el almacenamiento no está configurado.
  url: string | null;
  createdAt: Date;
}

export interface StatePhotoPhaseView {
  photos: StatePhotoView[];
  // Cuándo se pulsó «Confirmar fotos»; null mientras se pueden cambiar.
  confirmedAt: Date | null;
  // Si quien lo mira puede subir, quitar o confirmar fotos ahora mismo.
  canEdit: boolean;
}

export interface StatePhotos {
  delivery: StatePhotoPhaseView;
}

type Loaded = Awaited<ReturnType<typeof loadTracking>>;

// La reserva y quién la mira. Las fotos son de la reserva: el rider no las ve.
async function loadForPhotos(userId: string, reservationId: string) {
  const loaded = await loadTracking(userId, reservationId);
  if (loaded.viewer === 'rider') {
    throw new AppError(403, NOT_PARTICIPANT_MESSAGE);
  }
  return loaded;
}

// Las fotos de la entrega se pueden cambiar mientras el objeto no ha salido de manos del
// propietario: reserva aceptada o pagada y entrega sin recoger (pendiente o con rider asignado).
function isBeforeDelivery({ reservation, delivery }: Loaded): boolean {
  return (
    (reservation.status === 'accepted' || reservation.status === 'paid') &&
    (delivery.status === 'pending' || delivery.status === 'assigned')
  );
}

function canEditPhase(
  loaded: Loaded,
  photos: { confirmedAt: Date | null }[],
): boolean {
  return (
    loaded.viewer === 'owner' &&
    isBeforeDelivery(loaded) &&
    photos.every(({ confirmedAt }) => confirmedAt === null)
  );
}

// Comprueba que el propietario puede cambiar las fotos de la fase ahora. Devuelve las que ya hay.
async function assertCanEdit(loaded: Loaded, phase: StatePhotoPhase) {
  if (loaded.viewer !== 'owner') {
    throw new AppError(403, NOT_OWNER_MESSAGE);
  }
  const photos = await findStatePhotos(loaded.reservation.id, phase);
  if (photos.some(({ confirmedAt }) => confirmedAt !== null)) {
    throw new AppError(409, ALREADY_CONFIRMED_MESSAGE);
  }
  if (!isBeforeDelivery(loaded)) {
    throw new AppError(409, NOT_BEFORE_DELIVERY_MESSAGE);
  }
  return photos;
}

async function toView(photo: {
  id: string;
  key: string;
  order: number;
  createdAt: Date;
}): Promise<StatePhotoView> {
  return {
    id: photo.id,
    order: photo.order,
    url: isStorageConfigured() ? await createViewUrl(photo.key) : null,
    createdAt: photo.createdAt,
  };
}

// GET /api/entregas/:id/fotos: las fotos de cada fase, para la propietaria y el arrendatario.
export async function getStatePhotos(
  userId: string,
  reservationId: string,
): Promise<StatePhotos> {
  const loaded = await loadForPhotos(userId, reservationId);
  const all = await findAllStatePhotos(reservationId);
  const delivery = all.filter(({ phase }) => phase === 'delivery');

  return {
    delivery: {
      photos: await Promise.all(delivery.map(toView)),
      confirmedAt:
        delivery.find(({ confirmedAt }) => confirmedAt)?.confirmedAt ?? null,
      canEdit: canEditPhase(loaded, delivery),
    },
  };
}

// POST /api/entregas/:id/fotos/:fase/subida: URL para subir una foto al bucket.
export async function requestStatePhotoUpload(
  userId: string,
  reservationId: string,
  phase: StatePhotoPhase,
  body: unknown,
): Promise<PhotoUpload> {
  const loaded = await loadForPhotos(userId, reservationId);
  const photos = await assertCanEdit(loaded, phase);
  const { contentType, size } = validatePhotoRequest(body);
  if (photos.length >= MAX_STATE_PHOTOS) {
    throw new AppError(409, MAX_PHOTOS_MESSAGE);
  }

  // La clave la decide siempre el backend, en la carpeta de la reserva y la fase.
  const key = newPhotoKey(
    `reservas/${reservationId}/${SLUG_BY_PHASE[phase]}`,
    contentType,
  );
  const uploadUrl = await createUploadUrl(key, contentType, size);
  return { key, uploadUrl, expiresIn: UPLOAD_URL_SECONDS };
}

// POST /api/entregas/:id/fotos/:fase: comprueba el fichero subido y guarda su clave.
export async function confirmStatePhotoUpload(
  userId: string,
  reservationId: string,
  phase: StatePhotoPhase,
  body: unknown,
): Promise<StatePhotoView> {
  const loaded = await loadForPhotos(userId, reservationId);
  const photos = await assertCanEdit(loaded, phase);

  const { key } = (body ?? {}) as Record<string, unknown>;
  const keyPattern = new RegExp(
    `^reservas/${reservationId}/${SLUG_BY_PHASE[phase]}/[0-9a-f-]{36}\\.(jpg|png|webp)$`,
  );
  if (typeof key !== 'string' || !keyPattern.test(key)) {
    throw new AppError(400, INVALID_KEY_MESSAGE, 'key');
  }
  if (await findStatePhotoByKey(key)) {
    throw new AppError(409, 'Esta foto ya está guardada.', 'key');
  }
  if (photos.length >= MAX_STATE_PHOTOS) {
    // No se guardará nunca: se borra para no dejar ficheros huérfanos en el bucket.
    await deleteStoredPhoto(key);
    throw new AppError(409, MAX_PHOTOS_MESSAGE);
  }

  await verifyStoredImage(key);

  const used = new Set(photos.map(({ order }) => order));
  const order =
    Array.from({ length: MAX_STATE_PHOTOS }, (_, index) => index + 1).find(
      (candidate) => !used.has(candidate),
    ) ?? MAX_STATE_PHOTOS;

  try {
    const photo = await createStatePhoto({
      reservationId,
      uploadedById: userId,
      phase,
      key,
      order,
    });
    return toView(photo);
  } catch (error) {
    // Dos confirmaciones a la vez: el índice único (reserva, fase, orden) para a la segunda.
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

// DELETE /api/entregas/:id/fotos/:fase/:fotoId: quita una foto antes de confirmar.
export async function deleteStatePhoto(
  userId: string,
  reservationId: string,
  phase: StatePhotoPhase,
  photoId: string,
): Promise<void> {
  const loaded = await loadForPhotos(userId, reservationId);
  await assertCanEdit(loaded, phase);

  const key = /^[0-9a-f-]{36}$/i.test(photoId)
    ? await deleteUnconfirmedStatePhoto(photoId, reservationId, phase)
    : null;
  if (!key) throw new AppError(404, PHOTO_NOT_FOUND_MESSAGE);

  // Ya no está en la BD; si el bucket falla, queda un fichero huérfano pero la foto no sale.
  await deleteStoredPhoto(key).catch(() => undefined);
}

// POST /api/entregas/:id/fotos/:fase/confirmar: «Confirmar fotos». Desde aquí no se pueden cambiar.
export async function confirmStatePhotoPhase(
  userId: string,
  reservationId: string,
  phase: StatePhotoPhase,
  now = new Date(),
): Promise<StatePhotos> {
  const loaded = await loadForPhotos(userId, reservationId);
  const photos = await assertCanEdit(loaded, phase);
  if (photos.length === 0) {
    throw new AppError(400, NO_PHOTOS_MESSAGE);
  }
  if ((await confirmStatePhotos(reservationId, phase, now)) === 0) {
    throw new AppError(409, ALREADY_CONFIRMED_MESSAGE);
  }
  return getStatePhotos(userId, reservationId);
}
