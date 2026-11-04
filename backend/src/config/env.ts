function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value;
}

function parseDatabaseUrl(name: string): string {
  const value = requireEnv(name);

  try {
    const url = new URL(value);
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      throw new Error();
    }
  } catch {
    throw new Error(
      `La variable de entorno ${name} debe ser una URL de PostgreSQL`,
    );
  }

  return value;
}

function parsePort(): number {
  const value = requireEnv('PORT');
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'La variable de entorno PORT debe ser un número entre 1 y 65535',
    );
  }

  return port;
}

function parseCorsOrigins(): string[] {
  const value = process.env.CORS_ORIGINS;

  if (value === undefined) {
    throw new Error('Falta la variable de entorno CORS_ORIGINS');
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      let parsedOrigin: URL;

      try {
        parsedOrigin = new URL(origin);
      } catch {
        throw new Error(
          'La variable CORS_ORIGINS debe contener orígenes HTTP o HTTPS válidos',
        );
      }

      if (
        (parsedOrigin.protocol !== 'http:' &&
          parsedOrigin.protocol !== 'https:') ||
        parsedOrigin.origin !== origin ||
        origin.includes('*')
      ) {
        throw new Error(
          'La variable CORS_ORIGINS debe contener solo orígenes HTTP o HTTPS',
        );
      }

      return origin;
    });
}

// URLs de preview de Vercel (ADR 0001, «CORS para la URL de producción y las previews de Vercel», #96).
// Opcional: sin ella no se acepta ninguna preview. Tiene que estar anclada (^https://…$) y no puede
// aceptar cualquier *.vercel.app, porque cualquiera puede desplegar en ese dominio.
export function parseCorsPreviewPattern(
  value: string | undefined,
): RegExp | null {
  const pattern = value?.trim();

  if (!pattern) {
    return null;
  }

  if (!pattern.startsWith('^https://') || !pattern.endsWith('$')) {
    throw new Error(
      'La variable CORS_PREVIEW_PATTERN debe empezar por ^https:// y acabar en $',
    );
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    throw new Error(
      'La variable CORS_PREVIEW_PATTERN no es una expresión regular válida',
    );
  }

  if (
    regex.test('https://otro-proyecto.vercel.app') ||
    regex.test('https://ejemplo.com')
  ) {
    throw new Error(
      'La variable CORS_PREVIEW_PATTERN es demasiado amplia: debe incluir el nombre del proyecto y del equipo',
    );
  }

  return regex;
}

export interface S3Config {
  endpoint: string | undefined;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

// Almacenamiento de las fotos (ADR 0002, #106): cualquier proveedor con API de S3 (Supabase Storage
// en producción). Opcional: sin S3_BUCKET el backend arranca igual y las rutas de fotos responden 503.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026
export function parseS3Config(
  variables: NodeJS.ProcessEnv = process.env,
): S3Config | null {
  const bucket = variables.S3_BUCKET?.trim();

  if (!bucket) {
    return null;
  }

  const read = (name: string): string => {
    const value = variables[name]?.trim();
    if (!value) {
      throw new Error(
        `Falta la variable de entorno ${name} (necesaria porque S3_BUCKET está definida)`,
      );
    }
    return value;
  };

  const endpoint = variables.S3_ENDPOINT?.trim() || undefined;
  if (endpoint) {
    try {
      const url = new URL(endpoint);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error();
      }
    } catch {
      throw new Error('La variable S3_ENDPOINT debe ser una URL HTTP o HTTPS');
    }
  }

  return {
    endpoint,
    region: read('S3_REGION'),
    bucket,
    accessKeyId: read('S3_ACCESS_KEY_ID'),
    secretAccessKey: read('S3_SECRET_ACCESS_KEY'),
    forcePathStyle: variables.S3_FORCE_PATH_STYLE?.trim() === 'true',
  };
}

function parseBcryptRounds(): number {
  const value = process.env.BCRYPT_ROUNDS?.trim() || '10';
  const rounds = Number(value);

  if (!Number.isInteger(rounds) || rounds < 4 || rounds > 31) {
    throw new Error(
      'La variable de entorno BCRYPT_ROUNDS debe ser un número entre 4 y 31',
    );
  }

  return rounds;
}

export const env = Object.freeze({
  port: parsePort(),
  databaseUrl: parseDatabaseUrl('DATABASE_URL'),
  directUrl: parseDatabaseUrl('DIRECT_URL'),
  corsOrigins: parseCorsOrigins(),
  corsPreviewPattern: parseCorsPreviewPattern(process.env.CORS_PREVIEW_PATTERN),
  bcryptRounds: parseBcryptRounds(),
  s3: parseS3Config(),
});
