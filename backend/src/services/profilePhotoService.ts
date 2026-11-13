// Foto del perfil (US-01.4, #300), con el mismo flujo en dos pasos que las fotos de los
// objetos (ADR 0002): pedir URL de subida → el navegador sube al bucket → confirmar la clave.
// Reutiliza photoService y photoStorage; las claves van bajo `usuarios/<idUsuario>/`.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { AppError } from '../errors/appError.js';
import {
  createUploadUrl,
  deleteStoredPhoto,
  UPLOAD_URL_SECONDS,
} from '../repositories/photoStorage.js';
import {
  findPhotoKey,
  updatePhotoKey,
} from '../repositories/profileRepository.js';
import {
  newPhotoKey,
  validatePhotoRequest,
  verifyStoredImage,
  type PhotoUpload,
} from './photoService.js';
import { getPublicProfile, type PublicProfile } from './profileService.js';

export async function requestProfilePhotoUpload(
  userId: string,
  body: unknown,
): Promise<PhotoUpload> {
  const { contentType, size } = validatePhotoRequest(body);

  // La clave la decide siempre el backend, nunca el cliente.
  const key = newPhotoKey(`usuarios/${userId}`, contentType);
  const uploadUrl = await createUploadUrl(key, contentType, size);

  return { key, uploadUrl, expiresIn: UPLOAD_URL_SECONDS };
}

// Borra un fichero que ya no se usa. Si falla no se interrumpe nada: solo queda un huérfano
// en el bucket. No se registra nada, para no volcar claves ni errores del proveedor en el log.
async function deleteQuietly(key: string | null): Promise<void> {
  if (!key) {
    return;
  }
  try {
    await deleteStoredPhoto(key);
  } catch {
    // Mejor un fichero huérfano que perder el cambio del usuario.
  }
}

// Comprueba el fichero subido y lo guarda como foto del perfil. Borra la foto anterior.
export async function confirmProfilePhoto(
  userId: string,
  body: unknown,
): Promise<PublicProfile> {
  const { key } = (body ?? {}) as Record<string, unknown>;
  const keyPattern = new RegExp(
    `^usuarios/${userId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`,
  );
  if (typeof key !== 'string' || !keyPattern.test(key)) {
    throw new AppError(400, 'La clave de la foto no es válida.', 'key');
  }

  const previousKey = await findPhotoKey(userId);
  if (previousKey !== key) {
    await verifyStoredImage(key);
    await updatePhotoKey(userId, key);
    await deleteQuietly(previousKey);
  }

  return getPublicProfile(userId, userId);
}

export async function removeProfilePhoto(userId: string): Promise<void> {
  const previousKey = await findPhotoKey(userId);

  await updatePhotoKey(userId, null);
  await deleteQuietly(previousKey);
}
