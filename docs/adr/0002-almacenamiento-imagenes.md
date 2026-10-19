# ADR 0002 · Almacenamiento de imágenes

- **Estado:** Propuesto (pendiente de validar por el equipo antes del merge)
- **Fecha:** 19/10/2026
- **Responsable:** Marc (spike SP-03, #92), a propuesta de Danyal (usar S3)
- **Relacionado:** [ADR 0001](0001-stack.md), [`docs/modelo-datos.md`](../modelo-datos.md) (`foto_objeto`, `foto_estado`), prototipo en [`spikes/sp03-imagenes/`](../../spikes/sp03-imagenes/)

> Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 19/10/2026.

## Contexto

Necesitamos guardar fotos en dos historias:

- **US-02.01 Publicar un objeto** (Sprint 1): de 1 a 5 fotos por anuncio, que ve cualquier usuario en la ficha.
- **US-09.02 Check-in / check-out con fotos** (Sprint 3): fotos que solo ven el propietario y el arrendatario, y que quedan bloqueadas al confirmar.

La pregunta del spike: **¿Supabase Storage, Cloudinary o S3? ¿Qué límites tienen los planes gratuitos? ¿Cómo redimensionamos?** Requisitos: coste cero, sin tarjeta si es posible, que encaje con el backend en Render (ADR 0001) y que las fotos no pasen por nuestro servidor gratuito (es lento y se duerme).

## Opciones

| Opción | Plan gratuito (octubre de 2026) | A favor | En contra |
|---|---|---|---|
| **AWS S3** | Desde julio de 2025 ya no hay capa gratuita de S3 para cuentas nuevas: hay un crédito inicial (100-200 $) y la cuenta gratuita se cierra al acabar el crédito o a los 6 meses. **Pide tarjeta.** | Estándar del sector; el SDK y la API S3 los conocen todos (y los agentes de IA). | Coste real después del crédito; hace falta una tarjeta; otra cuenta más que gestionar. |
| **Supabase Storage** (API compatible con S3) | 1 GB de ficheros (y la transferencia del plan gratuito); sin tarjeta. El redimensionado de imágenes es solo del plan Pro. | **Ya tenemos la cuenta** para PostgreSQL (ADR 0001). Habla **la misma API S3**: se usa con el mismo SDK de AWS. Buckets privados y URLs prefirmadas. | 1 GB es poco si se suben fotos grandes; el proyecto se pausa tras 7 días sin actividad. |
| **Cloudinary** | 25 créditos al mes (1 crédito = 1 GB de almacenamiento, 1 GB de transferencia o 1000 transformaciones). | Redimensiona y optimiza las imágenes «al vuelo» en el plan gratuito. | API propia (no S3): el código queda atado a Cloudinary; otra cuenta y otras claves. |

## Decisión

1. **Programamos contra la API de S3** con el SDK oficial (`@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`), como propuso Danyal. El proveedor se elige solo con variables de entorno (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`).
2. **Proveedor recomendado: el endpoint S3 de Supabase Storage**, porque es gratis, no pide tarjeta y ya tenemos la cuenta. Si un día se queda corto (1 GB), se cambia a AWS S3 **sin tocar el código**, cambiando solo esas variables (lo demuestra el prototipo, que corre igual contra un S3 local).
3. **Subida directa con URLs prefirmadas** (la foto no pasa por Render):
   1. El frontend pide al backend una URL de subida e indica el tipo y el tamaño de la foto.
   2. El backend comprueba la sesión y las reglas, **decide la clave** (`objetos/<idObjeto>/<uuid>.jpg`) y devuelve una URL `PUT` que caduca en **5 minutos**.
   3. El navegador sube la foto directamente al bucket.
   4. El backend confirma que la foto existe (`HEAD`) y guarda **solo la clave** en `foto_objeto.url` (o en `foto_estado.url`).
   5. Para enseñarla, el backend devuelve URLs `GET` prefirmadas que caducan en **1 hora**.
4. **Reglas de las fotos:** solo **JPG, PNG o WebP** (SVG no, porque puede llevar scripts), **5 MB como máximo** y, como mucho, 5 fotos por objeto.
5. **Redimensionado:** en el **navegador antes de subir** (el ancho máximo es de 1600 px y se reconvierte a WebP o JPG con calidad de alrededor del 0,8, con un `<canvas>` sin librerías nuevas). Así ahorramos espacio del GB gratuito y no dependemos del redimensionado del plan Pro de Supabase.
6. **Bucket privado** desde el principio. En US-09.02 es imprescindible, porque las fotos solo las deben ver las dos partes del alquiler. Las URLs de lectura las da siempre el backend, después de comprobar los permisos.

## Cómo encaja en el código (cuando se implemente US-02.01)

- `backend/src/config/`: variables `S3_*` (y en `.env.example`, sin valores reales; el repo es público).
- `backend/src/repositories/photoStorage.ts`: es el único fichero que usa el SDK de S3, y genera las URLs prefirmadas y hace `HEAD`.
- `backend/src/services/`: reglas (tipo, tamaño, número de fotos, permisos) y la clave del objeto.
- Endpoints previstos: `POST /api/objetos/:id/fotos/subida` (devuelve `{ uploadUrl, key }`) y `POST /api/objetos/:id/fotos` (confirma la clave). Los nombres finales los fija BE en su PR.
- Las claves de acceso solo van en Render (#100), **nunca** en el frontend ni en el repo.

## Consecuencias

**Positivas**
- El coste es cero y no hace falta tarjeta. El código es portable entre Supabase, AWS S3 o cualquier S3 compatible.
- Render no recibe ficheros: las subidas son rápidas aunque el servidor gratuito esté «dormido» un rato.
- Ponemos las reglas de seguridad (bucket privado, URLs que caducan, tipos permitidos) desde el principio.

**Negativas / riesgos**
- Con **1 GB** de Supabase caben unas 2000 fotos de 500 KB: es suficiente para el curso, pero hay que redimensionar antes de subir.
- **Dos dependencias nuevas** en `backend/package.json` cuando se implemente US-02.01 (las del SDK); este ADR es la propuesta para aprobarlas.
- El bucket necesita **CORS** para que el navegador pueda hacer el `PUT` desde la URL de Vercel (y desde `localhost:5173` en desarrollo); se configura con el despliegue (#96).
- Las URLs de lectura caducan: el frontend no las debe guardar, sino pedirlas cada vez que carga la ficha.

## Prototipo del spike

`spikes/sp03-imagenes/` (independiente del backend; ver su README). Lo que hace:
1. Genera una URL de subida.
2. Sube una foto PNG con `fetch`, como lo haría el navegador.
3. La confirma con `HEAD`.
4. La descarga con una URL de lectura y comprueba que es idéntica.
5. Comprueba que se rechazan un SVG y una foto de más de 5 MB.

Se ha ejecutado contra un S3 local (S3Mock en Docker) y la foto se ve en el navegador con la URL de lectura. Con las variables de Supabase o AWS en un `.env`, el mismo script funciona contra el proveedor real.

## Fuentes consultadas (19/10/2026)

- AWS Free Tier desde julio de 2025 (créditos y sin capa gratuita de S3): [freetier.co](https://freetier.co/aws-free-tier), [tech-insider.org](https://tech-insider.org/what-changed-in-the-aws-free-tier-for-2026/).
- Supabase: [precios](https://supabase.com/pricing), [S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility), [S3 authentication](https://supabase.com/docs/guides/storage/s3), [Image Transformations (solo Pro)](https://supabase.com/docs/guides/storage/serving/image-transformations).
- Cloudinary: [Billing and plans](https://cloudinary.com/documentation/billing_and_plans).
