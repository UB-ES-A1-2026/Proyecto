// Único fichero que habla con el bucket de las fotos (ADR 0002, #106), con la API de S3.
// Funciona igual con Supabase Storage, AWS S3 o un S3 local: solo cambian las variables S3_*.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, type S3Config } from '../config/env.js';
import { AppError } from '../errors/appError.js';

export const UPLOAD_URL_SECONDS = 5 * 60;
export const VIEW_URL_SECONDS = 60 * 60;

let client: { s3: S3Client; config: S3Config } | null = null;

export function isStorageConfigured(): boolean {
  return env.s3 !== null;
}

function storage(): { s3: S3Client; config: S3Config } {
  if (!env.s3) {
    throw new AppError(
      503,
      'La subida de fotos no está disponible en este momento.',
    );
  }

  client ??= {
    config: env.s3,
    s3: new S3Client({
      endpoint: env.s3.endpoint,
      region: env.s3.region,
      forcePathStyle: env.s3.forcePathStyle,
      credentials: {
        accessKeyId: env.s3.accessKeyId,
        secretAccessKey: env.s3.secretAccessKey,
      },
    }),
  };

  return client;
}

// URL PUT con el tipo y el tamaño firmados: el proveedor rechaza un cuerpo distinto (ADR 0002, regla 4.1).
export function createUploadUrl(
  key: string,
  contentType: string,
  size: number,
): Promise<string> {
  const { s3, config } = storage();

  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    {
      expiresIn: UPLOAD_URL_SECONDS,
      signableHeaders: new Set(['content-type', 'content-length']),
    },
  );
}

export function createViewUrl(key: string): Promise<string> {
  const { s3, config } = storage();

  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: VIEW_URL_SECONDS },
  );
}

// Tamaño y tipo declarados del fichero subido, o null si no existe.
export async function findStoredPhoto(
  key: string,
): Promise<{ size: number; contentType: string | undefined } | null> {
  const { s3, config } = storage();

  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return { size: head.ContentLength ?? 0, contentType: head.ContentType };
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      error.$metadata.httpStatusCode === 404
    ) {
      return null;
    }
    throw error;
  }
}

// Primeros bytes del fichero, para comprobar su firma (magic number).
export async function readFirstBytes(
  key: string,
  count: number,
): Promise<Uint8Array> {
  const { s3, config } = storage();
  const object = await s3.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Range: `bytes=0-${count - 1}`,
    }),
  );

  return object.Body ? object.Body.transformToByteArray() : new Uint8Array();
}

export async function deleteStoredPhoto(key: string): Promise<void> {
  const { s3, config } = storage();
  await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}
