# SP-03 · Prototipo de fotos con la API de S3

Prototipo del spike [#92](https://github.com/UB-ES-A1-2026/Proyecto/issues/92). La decisión y el porqué están en [ADR 0002](../../docs/adr/0002-almacenamiento-imagenes.md). **No es código de producción**: está aislado del backend y tiene sus propias dependencias.

## Qué demuestra

1. El backend genera una **URL prefirmada de subida** (PUT, 5 min) y decide la clave del fichero.
2. El «navegador» (`fetch`) sube la foto **directamente al bucket**.
3. El backend comprueba que la foto existe (`HEAD`) y guardaría solo su clave en la BD.
4. Una **URL prefirmada de lectura** (GET, 1 h) sirve para verla; se comprueba que es idéntica a la original.
5. Se rechazan los tipos no permitidos (SVG) y las fotos de más de 5 MB.

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

## Resultado (19/10/2026, S3 local)

```
1. URL de subida generada (caduca en 5 min)
2. Foto subida: 8569 bytes (HTTP 200)
3. Confirmada en el bucket: 8569 bytes, image/png → se guarda la clave «objetos/demo-objeto/<uuid>.png»
4. Descargada con la URL de lectura (HTTP 200): idéntica a la original ✔
5. Rechazada como se esperaba → Tipo no permitido: image/svg+xml. Solo JPG, PNG o WebP.
5. Rechazada como se esperaba → La foto ocupa 5242881 bytes; el máximo es 5242880.
```

La URL de lectura abierta en el navegador muestra la imagen (64×64 px).
