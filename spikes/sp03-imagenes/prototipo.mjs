// SP-03 (#92) · Prototipo: subir y ver una foto con la API de S3 y URLs prefirmadas.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 19/10/2026
//
// Simula el flujo previsto para US-02.01 (publicar objeto) y US-09.02 (fotos de check-in/out):
//   1. El backend valida tipo y tamaño y genera una URL prefirmada de SUBIDA (PUT, 5 min).
//   2. El navegador sube la foto directamente al bucket con esa URL (aquí lo hace `fetch`).
//   3. El backend comprueba que el objeto existe (HEAD) y guarda solo su clave en la BD.
//   4. Para enseñarla, el backend genera una URL prefirmada de LECTURA (GET, 1 h).
// Funciona igual contra S3Mock (local), AWS S3 o el endpoint S3 de Supabase Storage: solo cambian las variables S3_*.
import { createHash, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Sin variables usa el S3 local (S3Mock). S3_ENDPOINT vacío («S3_ENDPOINT=») = endpoint oficial de AWS.
const config = {
  endpoint: (process.env.S3_ENDPOINT ?? 'http://localhost:9090') || undefined,
  region: process.env.S3_REGION ?? 'us-east-1',
  bucket: process.env.S3_BUCKET ?? 'rentit-fotos',
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'local',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'local',
  },
};

// Reglas propuestas en el ADR 0002 para las fotos de los objetos.
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_URL_SECONDS = 5 * 60;
const VIEW_URL_SECONDS = 60 * 60;

const s3 = new S3Client({
  endpoint: config.endpoint,
  region: config.region,
  forcePathStyle: config.forcePathStyle,
  credentials: config.credentials,
});

// Crea una imagen PNG de 64×64 en memoria (degradado) para no depender de ficheros externos.
function createSamplePng() {
  const size = 64;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8); // 8 bits por canal
  header.writeUInt8(2, 9); // RGB
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3);
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 3;
      raw[i] = 40 + x * 3;
      raw[i + 1] = 110 + y;
      raw[i + 2] = 90;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function validatePhoto(contentType, sizeBytes) {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error(`Tipo no permitido: ${contentType}. Solo JPG, PNG o WebP.`);
  }
  if (sizeBytes > MAX_BYTES) {
    throw new Error(`La foto ocupa ${sizeBytes} bytes; el máximo es ${MAX_BYTES}.`);
  }
}

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.bucket }));
  }
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function main() {
  console.log(`Proveedor S3: ${config.endpoint ?? 'AWS S3'} · bucket «${config.bucket}»`);
  await ensureBucket();

  // 1. Backend: validar y generar la URL de subida. La clave la decide el backend, nunca el cliente.
  const photo = createSamplePng();
  const contentType = 'image/png';
  validatePhoto(contentType, photo.length);
  const key = `objetos/demo-objeto/${randomUUID()}.${ALLOWED_TYPES.get(contentType)}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_SECONDS },
  );
  console.log(`1. URL de subida generada (caduca en ${UPLOAD_URL_SECONDS / 60} min)`);

  // 2. Navegador: sube la foto directamente al bucket, sin pasar por nuestro backend.
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: photo,
  });
  if (!put.ok) throw new Error(`La subida ha fallado: HTTP ${put.status}`);
  console.log(`2. Foto subida: ${photo.length} bytes (HTTP ${put.status})`);

  // 3. Backend: comprobar que la foto está y guardar SOLO la clave en foto_objeto.url.
  const head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  console.log(`3. Confirmada en el bucket: ${head.ContentLength} bytes, ${head.ContentType} → se guarda la clave «${key}»`);

  // 4. Backend: URL de lectura temporal para enseñarla en la ficha del objeto.
  const viewUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: VIEW_URL_SECONDS },
  );
  const get = await fetch(viewUrl);
  const downloaded = Buffer.from(await get.arrayBuffer());
  const same = sha256(downloaded) === sha256(photo);
  console.log(`4. Descargada con la URL de lectura (HTTP ${get.status}): ${same ? 'idéntica a la original ✔' : 'NO coincide ✘'}`);

  // Las reglas de validación también rechazan lo que no toca.
  for (const [type, bytes] of [['image/svg+xml', 1000], ['image/png', MAX_BYTES + 1]]) {
    try {
      validatePhoto(type, bytes);
      console.log(`✘ Debería haberse rechazado: ${type}, ${bytes} bytes`);
    } catch (error) {
      console.log(`5. Rechazada como se esperaba → ${error.message}`);
    }
  }

  console.log(`\nAbre esta URL en el navegador para ver la foto (válida ${VIEW_URL_SECONDS / 60} min):\n${viewUrl}`);
  if (!same || put.status >= 300 || get.status >= 300) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Error del prototipo: ${error.message}`);
  process.exitCode = 1;
});
