# ADR 0002 · Almacenamiento de imágenes

- **Estado:** Aceptado (21/10/2026), tras la revisión de Kai en #149
- **Fecha:** 19/10/2026 · actualizado el 21/10/2026 con la revisión de Kai (validación en servidor)
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
   2. El backend comprueba la sesión y las reglas, **decide la clave** (`objetos/<idObjeto>/<uuid>.jpg`) y devuelve una URL `PUT` que caduca en **5 minutos**, con el tipo y el tamaño **firmados** (ver la regla 4).
   3. El navegador sube la foto directamente al bucket.
   4. El backend **confirma** la subida: comprueba que la foto existe y que cumple las reglas (regla 4) y guarda **solo la clave** en `foto_objeto.clave` (o en `foto_estado.clave`). Si no cumple, **borra el objeto y devuelve un error**.
   5. Para enseñarla, el backend devuelve URLs `GET` prefirmadas que caducan en **1 hora**.
4. **Reglas de las fotos:** solo **JPG, PNG o WebP** (SVG no, porque puede llevar scripts), **5 MB como máximo** y, como mucho, 5 fotos por objeto. Lo que el cliente **declara** al pedir la URL no basta: con una URL prefirmada `PUT`, el proveedor no limita el tamaño si no se firma y el `Content-Type` lo pone el cliente. Kai lo comprobó subiendo 6 MB y un SVG con `<script>` declarado como `image/png` con una URL pedida para una foto pequeña, y ambos se aceptaron. Por eso, las reglas se aplican **tres veces**:
   1. **Al firmar la URL:** se incluyen `ContentType` y `ContentLength` en el `PutObjectCommand` y se fuerzan como cabeceras firmadas (`getSignedUrl(…, { signableHeaders: new Set(['content-type', 'content-length']) })`), para que el proveedor rechace un cuerpo de otro tamaño o de otro tipo.
   2. **Al confirmar (`HEAD`):** se vuelve a comprobar `ContentLength ≤ 5 MB` y que el `ContentType` sea uno de los permitidos.
   3. **Mirando el contenido:** se leen los primeros bytes del fichero (`GetObject` con `Range: bytes=0-11`) y se comprueba su «firma» o *magic number*: JPG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF····WEBP`. El tipo declarado se puede falsear; el contenido, no.

   Si cualquiera de las comprobaciones de la confirmación falla, se borra el objeto (`DeleteObject`) y se responde con un 400.
5. **Redimensionado:** en el **navegador antes de subir** (el ancho máximo es de 1600 px y se reconvierte a WebP o JPG con calidad de alrededor del 0,8, con un `<canvas>` sin librerías nuevas). Así ahorramos espacio del GB gratuito y no dependemos del redimensionado del plan Pro de Supabase.
6. **Bucket privado** desde el principio. En US-09.02 es imprescindible, porque las fotos solo las deben ver las dos partes del alquiler. Las URLs de lectura las da siempre el backend, después de comprobar los permisos.

## Cómo encaja en el código (cuando se implemente US-02.01)

- `backend/src/config/`: variables `S3_*` (y en `.env.example`, sin valores reales; el repo es público).
- `backend/src/repositories/photoStorage.ts`: es el único fichero que usa el SDK de S3. Genera las URLs prefirmadas, hace `HEAD`, lee los primeros bytes y borra objetos.
- `backend/src/services/`: reglas (tipo, tamaño, firma de los bytes, número de fotos, permisos) y la clave del objeto. Las reglas se prueban con tests unitarios, sin depender del bucket.
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
- Las URLs de lectura caducan: el frontend no las debe guardar, sino pedirlas cada vez que carga la ficha. Por eso en la BD se guarda la **clave** (`foto_objeto.clave`, `foto_estado.clave`; ver `docs/modelo-datos.md`).
- **Pendiente de comprobar con el proveedor real:** S3Mock **no valida las firmas** (Kai lo probó: acepta otro `Content-Type` y un cuerpo de 6 MB con un `ContentLength` firmado de 1000 bytes). El prototipo demuestra el flujo y la validación en servidor, pero no que el bucket rechace una subida que no coincide con lo firmado. Hay que repetir esa prueba contra el bucket de Supabase cuando se configure (#96 o al empezar US-02.01).

## Prototipo del spike

`spikes/sp03-imagenes/` (independiente del backend; ver su README). Lo que hace:
1. Genera una URL de subida con el tipo y el tamaño firmados.
2. Sube una foto PNG con `fetch`, como lo haría el navegador.
3. La confirma: `HEAD` (tamaño y tipo) y lectura de los primeros bytes (firma PNG).
4. La descarga con una URL de lectura y comprueba que es idéntica.
5. Comprueba que la **validación del backend** (`validatePhoto`) rechaza pedir una URL para un SVG o para una foto de más de 5 MB. Esto lo hace nuestro código, no el bucket.
6. Simula el ataque de la revisión: sube un SVG con `<script>` **declarado como `image/png`**. La confirmación detecta que los bytes no son de una imagen permitida, **borra el objeto** y comprueba que ya no existe.

Se ha ejecutado contra un S3 local (S3Mock en Docker) y la foto se ve en el navegador con la URL de lectura. Con las variables de Supabase o AWS en un `.env`, el mismo script funciona contra el proveedor real; allí, además, el bucket debería rechazar por su cuenta una subida que no coincida con lo firmado (pendiente de comprobar, ver «Consecuencias»).

## Fuentes consultadas (19/10/2026)

- AWS Free Tier desde julio de 2025 (créditos y sin capa gratuita de S3): [freetier.co](https://freetier.co/aws-free-tier), [tech-insider.org](https://tech-insider.org/what-changed-in-the-aws-free-tier-for-2026/).
- Supabase: [precios](https://supabase.com/pricing), [S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility), [S3 authentication](https://supabase.com/docs/guides/storage/s3), [Image Transformations (solo Pro)](https://supabase.com/docs/guides/storage/serving/image-transformations).
- Cloudinary: [Billing and plans](https://cloudinary.com/documentation/billing_and_plans).
