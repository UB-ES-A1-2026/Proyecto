import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/services/apiClient';
import { MAX_PHOTO_BYTES, resizePhoto, uploadItemPhoto } from '../src/services/photoService';

// Subida de fotos (#106): orden de las tres peticiones y errores. El redimensionado con <canvas>
// no se puede probar en jsdom, así que aquí se sustituye por una función que devuelve la foto.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026

const file = new File(['foto'], 'foto.jpg', { type: 'image/jpeg' });
const resized = new Blob([new Uint8Array(1234)], { type: 'image/webp' });
const resize = () => Promise.resolve(resized);

describe('uploadItemPhoto', () => {
  it('pide la URL, sube la foto al bucket y la confirma en la API', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json(
          { key: 'objetos/obj-1/abc.webp', uploadUrl: 'https://bucket.test/subir', expiresIn: 300 },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json(
          { id: 'f1', key: 'objetos/obj-1/abc.webp', order: 1, url: 'https://bucket.test/ver' },
          { status: 201 },
        ),
      );

    const photo = await uploadItemPhoto('obj-1', file, 'tok', resize);

    expect(photo).toEqual({
      id: 'f1',
      key: 'objetos/obj-1/abc.webp',
      order: 1,
      url: 'https://bucket.test/ver',
    });
    const [request, put, confirm] = fetchMock.mock.calls;
    expect(request[0]).toBe('http://localhost:3000/api/objetos/obj-1/fotos/subida');
    expect(request[1]?.body).toBe('{"contentType":"image/webp","size":1234}');
    expect(put[0]).toBe('https://bucket.test/subir');
    expect(put[1]).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'image/webp' },
      body: resized,
    });
    expect(put[1]?.headers).not.toHaveProperty('Authorization');
    expect(confirm[0]).toBe('http://localhost:3000/api/objetos/obj-1/fotos');
    expect(confirm[1]?.body).toBe('{"key":"objetos/obj-1/abc.webp"}');
  });

  it('no llama a la API si la foto sigue ocupando más de 5 MB', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const huge = new Blob([new Uint8Array(MAX_PHOTO_BYTES + 1)], { type: 'image/jpeg' });

    await expect(
      uploadItemPhoto('obj-1', file, 'tok', () => Promise.resolve(huge)),
    ).rejects.toMatchObject({ status: 400, field: 'photos' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('avisa si falla la subida al bucket y no confirma nada', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ key: 'k', uploadUrl: 'https://bucket.test/subir', expiresIn: 300 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }));

    const error = await uploadItemPhoto('obj-1', file, 'tok', resize).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: 'No se ha podido subir la foto. Inténtalo de nuevo.',
      field: 'photos',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('devuelve el error de la API tal cual (por ejemplo, el máximo de 5 fotos)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({ error: 'Este objeto ya tiene 5 fotos, que es el máximo.' }, { status: 409 }),
    );

    await expect(uploadItemPhoto('obj-1', file, 'tok', resize)).rejects.toMatchObject({
      status: 409,
      message: 'Este objeto ya tiene 5 fotos, que es el máximo.',
    });
  });
});

describe('resizePhoto', () => {
  it('rechaza los tipos que no son JPG, PNG o WebP antes de procesarlos', async () => {
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });

    await expect(resizePhoto(svg)).rejects.toMatchObject({
      status: 400,
      message: 'Solo se pueden subir fotos JPG, PNG o WebP.',
    });
  });
});
