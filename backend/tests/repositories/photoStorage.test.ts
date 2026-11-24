// URLs de lectura de las fotos: la misma foto tiene la misma URL durante una hora, para que el
// navegador la reutilice en lugar de volver a descargarla en cada página (bug #441).
// Generado con asistencia de IA (Claude), pendiente de revisión.
import { afterEach, describe, expect, it, vi } from 'vitest';

// Un bucket de mentira: firmar una URL no habla con el proveedor, así que no hace falta ninguno.
vi.mock('../../src/config/env.js', () => ({
  env: {
    s3: {
      bucket: 'rentit-fotos-test',
      region: 'eu-central-1',
      endpoint: 'https://s3.test',
      accessKeyId: 'clave-de-prueba',
      secretAccessKey: 'secreto-de-prueba',
      forcePathStyle: true,
    },
  },
}));

const { createViewUrl, VIEW_URL_SECONDS } =
  await import('../../src/repositories/photoStorage.js');

const KEY = 'objetos/taladro/foto.jpg';

async function viewUrlAt(isoDate: string, key = KEY): Promise<URL> {
  vi.setSystemTime(new Date(isoDate));
  return new URL(await createViewUrl(key));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createViewUrl', () => {
  it('da la misma URL para la misma foto durante la misma hora', async () => {
    vi.useFakeTimers();

    const first = await viewUrlAt('2026-11-24T18:00:05.000Z');
    const later = await viewUrlAt('2026-11-24T18:47:31.000Z');

    expect(later.href).toBe(first.href);
  });

  it('cambia de URL al empezar la hora siguiente', async () => {
    vi.useFakeTimers();

    const before = await viewUrlAt('2026-11-24T18:59:59.000Z');
    const after = await viewUrlAt('2026-11-24T19:00:00.000Z');

    expect(after.href).not.toBe(before.href);
  });

  it('se firma con la hora en punto y siempre le queda al menos una hora de vida', async () => {
    vi.useFakeTimers();

    const url = await viewUrlAt('2026-11-24T18:59:59.000Z');

    expect(url.searchParams.get('X-Amz-Date')).toBe('20261124T180000Z');
    // Firmada a las 18:00 y válida 2 horas: a las 18:59:59 aún le queda más de una hora.
    expect(Number(url.searchParams.get('X-Amz-Expires'))).toBe(
      2 * VIEW_URL_SECONDS,
    );
  });

  it('fotos distintas tienen URLs distintas', async () => {
    vi.useFakeTimers();

    const one = await viewUrlAt('2026-11-24T18:10:00.000Z');
    const other = await viewUrlAt(
      '2026-11-24T18:10:00.000Z',
      'objetos/taladro/otra.jpg',
    );

    expect(other.pathname).not.toBe(one.pathname);
  });
});
