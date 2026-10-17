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
    throw new Error(`La variable de entorno ${name} debe ser una URL de PostgreSQL`);
  }

  return value;
}

function parsePort(): number {
  const value = requireEnv('PORT');
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('La variable de entorno PORT debe ser un número entre 1 y 65535');
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
        throw new Error('La variable CORS_ORIGINS debe contener orígenes HTTP o HTTPS válidos');
      }

      if (
        (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') ||
        parsedOrigin.origin !== origin ||
        origin.includes('*')
      ) {
        throw new Error('La variable CORS_ORIGINS debe contener solo orígenes HTTP o HTTPS');
      }

      return origin;
    });
}

function parseBcryptRounds(): number {
  const value = process.env.BCRYPT_ROUNDS?.trim() || '10';
  const rounds = Number(value);

  if (!Number.isInteger(rounds) || rounds < 4 || rounds > 31) {
    throw new Error('La variable de entorno BCRYPT_ROUNDS debe ser un número entre 4 y 31');
  }

  return rounds;
}

export const env = Object.freeze({
  port: parsePort(),
  databaseUrl: parseDatabaseUrl('DATABASE_URL'),
  directUrl: parseDatabaseUrl('DIRECT_URL'),
  corsOrigins: parseCorsOrigins(),
  bcryptRounds: parseBcryptRounds(),
});
