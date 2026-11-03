import { describe, expect, it } from 'vitest';
import { parseS3Config } from '../../src/config/env.js';
import {
  detectImageType,
  MAX_PHOTO_BYTES,
  validatePhotoRequest,
} from '../../src/services/photoService.js';

// Reglas de las fotos del ADR 0002 (#106), sin bucket ni BD.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026

const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const WEBP = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')];
const SVG = [...Buffer.from('<svg onload=')];

describe('detectImageType', () => {
  it.each([
    ['JPG', JPG, 'image/jpeg'],
    ['PNG', PNG, 'image/png'],
    ['WebP', WEBP, 'image/webp'],
    ['SVG', SVG, null],
    ['vacío', [], null],
  ])('reconoce %s por sus primeros bytes', (_name, bytes, expected) => {
    expect(detectImageType(Uint8Array.from(bytes))).toBe(expected);
  });
});

describe('validatePhotoRequest', () => {
  it('acepta JPG, PNG y WebP de hasta 5 MB', () => {
    for (const contentType of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(
        validatePhotoRequest({ contentType, size: MAX_PHOTO_BYTES }),
      ).toEqual({ contentType, size: MAX_PHOTO_BYTES });
    }
  });

  it.each([
    [{ contentType: 'image/svg+xml', size: 100 }, 'contentType'],
    [{ contentType: 'image/gif', size: 100 }, 'contentType'],
    [{ size: 100 }, 'contentType'],
    [{ contentType: 'image/png', size: MAX_PHOTO_BYTES + 1 }, 'size'],
    [{ contentType: 'image/png', size: 0 }, 'size'],
    [{ contentType: 'image/png', size: 1.5 }, 'size'],
    [{ contentType: 'image/png', size: '100' }, 'size'],
    [undefined, 'contentType'],
  ])('rechaza %j en el campo %s', (body, field) => {
    expect(() => validatePhotoRequest(body)).toThrowError(
      expect.objectContaining({ status: 400, field }),
    );
  });
});

describe('parseS3Config', () => {
  const complete = {
    S3_BUCKET: 'rentit-fotos',
    S3_REGION: 'eu-central-1',
    S3_ACCESS_KEY_ID: 'clave',
    S3_SECRET_ACCESS_KEY: 'secreto',
  };

  it('sin S3_BUCKET no hay almacenamiento y el backend arranca igual', () => {
    expect(parseS3Config({})).toBeNull();
  });

  it('lee el resto de variables cuando hay bucket', () => {
    expect(
      parseS3Config({
        ...complete,
        S3_ENDPOINT: 'https://proyecto.supabase.co/storage/v1/s3',
        S3_FORCE_PATH_STYLE: 'true',
      }),
    ).toEqual({
      endpoint: 'https://proyecto.supabase.co/storage/v1/s3',
      region: 'eu-central-1',
      bucket: 'rentit-fotos',
      accessKeyId: 'clave',
      secretAccessKey: 'secreto',
      forcePathStyle: true,
    });
  });

  it('falla al arrancar si falta una clave o el endpoint no es una URL', () => {
    expect(() =>
      parseS3Config({ ...complete, S3_SECRET_ACCESS_KEY: '' }),
    ).toThrow('S3_SECRET_ACCESS_KEY');
    expect(() =>
      parseS3Config({ ...complete, S3_ENDPOINT: 'no-es-una-url' }),
    ).toThrow('S3_ENDPOINT');
  });
});
