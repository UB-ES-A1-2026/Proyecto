import { ApiError, apiRequest } from './apiClient';
import type { PublicProfile } from './userService';

// Subida de fotos de un objeto (US-02.01, #106; ADR 0002). Para el formulario de publicar (#13):
//   const photo = await uploadItemPhoto(itemId, file, token);
// Redimensiona la foto en el navegador, la sube directamente al bucket y la confirma en la API.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_WIDTH = 1600;
export const ACCEPTED_PHOTO_TYPES = 'image/jpeg,image/png,image/webp';

// Respuesta de POST /api/objetos/:id/fotos.
export type ItemPhoto = {
  id: string;
  key: string;
  order: number;
  url: string;
};

type PhotoUpload = { key: string; uploadUrl: string; expiresIn: number };

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.8));
}

// Como mucho 1600 px de ancho y en WebP (o JPG si el navegador no sabe hacer WebP). Al volver a
// dibujarla también se pierden los metadatos EXIF, como la ubicación GPS de la cámara.
export async function resizePhoto(file: File): Promise<Blob> {
  if (!ACCEPTED_PHOTO_TYPES.split(',').includes(file.type)) {
    throw new ApiError(400, 'Solo se pueden subir fotos JPG, PNG o WebP.', 'photos');
  }

  const image = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PHOTO_WIDTH / image.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  const webp = await canvasToBlob(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;

  const jpeg = await canvasToBlob(canvas, 'image/jpeg');
  if (!jpeg) throw new ApiError(400, 'No se ha podido procesar la foto.', 'photos');
  return jpeg;
}

type UploadPaths = {
  // Pide la URL temporal del bucket y, al final, confirma la foto subida.
  upload: string;
  confirm: string;
  // Campo de los errores de la foto: 'photos' en los objetos, 'photo' en el perfil.
  field: string;
};

async function uploadPhoto<T>(
  file: File,
  token: string,
  paths: UploadPaths,
  resize: (file: File) => Promise<Blob>,
): Promise<T> {
  const photo = await resize(file);
  if (photo.size > MAX_PHOTO_BYTES) {
    throw new ApiError(400, 'La foto no puede ocupar más de 5 MB.', paths.field);
  }

  // 1. La API decide dónde se guarda y da una URL temporal para subirla.
  const upload = await apiRequest<PhotoUpload>(paths.upload, {
    method: 'POST',
    token,
    body: { contentType: photo.type, size: photo.size },
  });

  // 2. La foto va directamente al bucket, sin pasar por nuestro servidor.
  let stored: Response;
  try {
    stored = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': photo.type },
      body: photo,
    });
  } catch {
    stored = new Response(null, { status: 599 });
  }
  if (!stored.ok) {
    throw new ApiError(
      stored.status,
      'No se ha podido subir la foto. Inténtalo de nuevo.',
      paths.field,
    );
  }

  // 3. La API comprueba la foto subida y la guarda.
  return apiRequest<T>(paths.confirm, { method: 'POST', token, body: { key: upload.key } });
}

export function uploadItemPhoto(
  itemId: string,
  file: File,
  token: string,
  resize: (file: File) => Promise<Blob> = resizePhoto,
): Promise<ItemPhoto> {
  return uploadPhoto<ItemPhoto>(
    file,
    token,
    {
      upload: `/objetos/${itemId}/fotos/subida`,
      confirm: `/objetos/${itemId}/fotos`,
      field: 'photos',
    },
    resize,
  );
}

// Foto de perfil (US-01.4, #300): mismo recorrido en tres pasos. Devuelve el perfil con la foto
// nueva; la anterior se borra del bucket.
export function uploadProfilePhoto(
  file: File,
  token: string,
  resize: (file: File) => Promise<Blob> = resizePhoto,
): Promise<PublicProfile> {
  return uploadPhoto<PublicProfile>(
    file,
    token,
    { upload: '/usuarios/me/foto/subida', confirm: '/usuarios/me/foto', field: 'photo' },
    resize,
  );
}
