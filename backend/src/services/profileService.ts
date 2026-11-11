// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { AppError } from '../errors/appError.js';
import {
  findPublicProfile,
  updateBio,
} from '../repositories/profileRepository.js';
import {
  createViewUrl,
  isStorageConfigured,
} from '../repositories/photoStorage.js';
import { listFirstPhotoUrls } from './photoService.js';

const USER_NOT_FOUND = 'No hemos encontrado este usuario.';

const MAX_BIO_LENGTH = 500;
const INVALID_BIO_MESSAGE = 'El campo "bio" no es correcto, revísalo.';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PublicProfile {
  id: string;
  username: string;
  bio: string | null;
  // URL de lectura de la foto, o null si no tiene o el almacenamiento no está configurado.
  photo: string | null;
  memberSince: string;
  rating: { average: number | null; count: number };
  items: {
    id: string;
    title: string;
    dailyPrice: string;
    neighborhood: string;
    photo: string | null;
  }[];
  isOwnProfile: boolean;
}

// Valoración media del usuario. De momento no hay valoraciones: T23 (#298, US-08.02)
// sustituirá esta función por la media y el recuento reales.
function getRating(_userId: string): { average: number | null; count: number } {
  return { average: null, count: 0 };
}

async function photoUrl(key: string | null): Promise<string | null> {
  return key && isStorageConfigured() ? createViewUrl(key) : null;
}

// Perfil público de un usuario. `viewerId` es quien lo mira (undefined si no tiene sesión).
export async function getPublicProfile(
  userId: string,
  viewerId?: string,
): Promise<PublicProfile> {
  const user = UUID_PATTERN.test(userId)
    ? await findPublicProfile(userId)
    : null;

  // Un usuario bloqueado se trata como si no existiera.
  if (!user || user.status === 'blocked') {
    throw new AppError(404, USER_NOT_FOUND);
  }

  const itemPhotos = await listFirstPhotoUrls(user.items.map(({ id }) => id));

  return {
    id: user.id,
    username: user.username,
    bio: user.bio,
    photo: await photoUrl(user.photoUrl),
    memberSince: user.createdAt.toISOString(),
    rating: getRating(user.id),
    items: user.items.map((item) => ({
      id: item.id,
      title: item.title,
      dailyPrice: item.dailyPrice.toFixed(2),
      neighborhood: item.neighborhood,
      photo: itemPhotos.get(item.id) ?? null,
    })),
    isOwnProfile: viewerId === user.id,
  };
}

// Edita la bio del propio usuario (solo se acepta ese campo; el resto del cuerpo se ignora).
// Se recorta; en blanco se guarda como null. El límite cuenta caracteres, como VARCHAR(500).
export async function updateOwnBio(
  userId: string,
  body: unknown,
): Promise<PublicProfile> {
  const { bio } = (body ?? {}) as Record<string, unknown>;

  if (typeof bio !== 'string' || [...bio.trim()].length > MAX_BIO_LENGTH) {
    throw new AppError(400, INVALID_BIO_MESSAGE, 'bio');
  }

  await updateBio(userId, bio.trim() || null);
  return getPublicProfile(userId, userId);
}
