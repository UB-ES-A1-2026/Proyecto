# SP-03 · Prototipo de fotos con la API de S3

Prototipo del spike [#92](https://github.com/UB-ES-A1-2026/Proyecto/issues/92). La decisión y el porqué están en [ADR 0002](../../docs/adr/0002-almacenamiento-imagenes.md). **No es código de producción**: está aislado del backend y tiene sus propias dependencias.

## Qué demuestra

1. El backend genera una **URL prefirmada de subida** (PUT, 5 min) con el **tipo y el tamaño firmados** (`X-Amz-SignedHeaders = content-length;content-type;host`) y decide la clave del fichero.
2. El «navegador» (`fetch`) sube la foto **directamente al bucket**.
3. El backend **confirma** la subida: tamaño y tipo con `HEAD`, y los primeros bytes (firma de PNG). Guardaría solo la clave en `foto_objeto.clave`.
4. Una **URL prefirmada de lectura** (GET, 1 h) sirve para verla; se comprueba que es idéntica a la original.
5. La **validación del backend** (no la del bucket) no da URL para un SVG ni para una foto de más de 5 MB.
6. El ataque de la revisión de #149: un SVG con `<script>` subido como `image/png`. La confirmación ve que los bytes no son de una imagen, **lo borra** y comprueba que ya no está.

> **Ojo:** S3Mock **no valida las firmas**, así que aquí no se ve que el bucket rechace un cuerpo distinto del firmado. Lo frena la confirmación del paso 3/6. Hay que repetir la prueba contra el bucket real de Supabase (#96 o US-02.01).

## Cómo ejecutarlo

Requisitos: Node 22 y Docker.

```bash
cd spikes/sp03-imagenes
npm install
npm run s3:up        # S3 local (S3Mock) en http://localhost:9090
npm run prototipo    # imprime los pasos y una URL para ver la foto
npm run s3:down
```

Para probarlo contra **Supabase Storage** o **AWS S3**, copia `.env.example` a `.env` y rellena las variables (el `.env` no se sube: el repo es público).

## Resultado (21/10/2026, S3 local)

```
1. URL de subida generada con tipo y tamaño firmados (caduca en 5 min)
2. Foto subida: 8569 bytes (HTTP 200)
3. Confirmada (tamaño, tipo y bytes de PNG): 8569 bytes, image/png → se guarda la clave «objetos/demo-objeto/<uuid>.png»
4. Descargada con la URL de lectura (HTTP 200): idéntica a la original ✔
5. El backend no da URL → Tipo no permitido: image/svg+xml. Solo JPG, PNG o WebP.
5. El backend no da URL → La foto ocupa 5242881 bytes; el máximo es 5242880.
6. SVG disfrazado de PNG → Foto rechazada y borrada: los bytes no son de un JPG, PNG ni WebP · ¿sigue en el bucket? no ✔
```

La URL de lectura abierta en el navegador muestra la imagen (64×64 px).
