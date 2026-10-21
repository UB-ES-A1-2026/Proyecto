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
  DeleteObjectCommand,
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

// Tipo real según los primeros bytes («magic number»); el Content-Type lo decide el cliente y se puede falsear.
function detectImageType(bytes) {
  const b = Buffer.from(bytes);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// URL de subida con el tipo y el tamaño FIRMADOS: un proveedor real rechaza un cuerpo distinto
// (S3Mock no valida firmas, por eso además se valida al confirmar).
function createUploadUrl(key, contentType, sizeBytes) {
  validatePhoto(contentType, sizeBytes);
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
    { expiresIn: UPLOAD_URL_SECONDS, signableHeaders: new Set(['content-type', 'content-length']) },
  );
}

// Confirmación en el backend (paso 4 del ADR): tamaño y tipo con HEAD + firma de los primeros bytes.
// Si algo no cuadra, borra el objeto y lanza un error (en la API sería un 400).
async function confirmUpload(key) {
  const head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  const first = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key, Range: 'bytes=0-11' }));
  const realType = detectImageType(await first.Body.transformToByteArray());
  const problems = [];
  if ((head.ContentLength ?? 0) > MAX_BYTES) problems.push(`ocupa ${head.ContentLength} bytes`);
  if (!ALLOWED_TYPES.has(head.ContentType)) problems.push(`tipo declarado ${head.ContentType}`);
  if (realType === null) problems.push('los bytes no son de un JPG, PNG ni WebP');
  else if (realType !== head.ContentType) problems.push(`declarado ${head.ContentType} pero es ${realType}`);
  if (problems.length > 0) {
    await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    throw new Error(`Foto rechazada y borrada: ${problems.join('; ')}`);
  }
  return head;
}

async function exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return true;
  } catch {
    return false;
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
  const key = `objetos/demo-objeto/${randomUUID()}.${ALLOWED_TYPES.get(contentType)}`;
  const uploadUrl = await createUploadUrl(key, contentType, photo.length);
  console.log(`1. URL de subida generada con tipo y tamaño firmados (caduca en ${UPLOAD_URL_SECONDS / 60} min)`);

  // 2. Navegador: sube la foto directamente al bucket, sin pasar por nuestro backend.
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: photo,
  });
  if (!put.ok) throw new Error(`La subida ha fallado: HTTP ${put.status}`);
  console.log(`2. Foto subida: ${photo.length} bytes (HTTP ${put.status})`);

  // 3. Backend: confirmar (tamaño, tipo y firma de los bytes) y guardar SOLO la clave en foto_objeto.clave.
  const head = await confirmUpload(key);
  console.log(`3. Confirmada (tamaño, tipo y bytes de PNG): ${head.ContentLength} bytes, ${head.ContentType} → se guarda la clave «${key}»`);

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

  // 5. Validación del BACKEND al pedir la URL (no del bucket): ni SVG ni más de 5 MB.
  let rejectedRequests = 0;
  for (const [type, bytes] of [['image/svg+xml', 1000], ['image/png', MAX_BYTES + 1]]) {
    try {
      validatePhoto(type, bytes);
      console.log(`✘ Debería haberse rechazado: ${type}, ${bytes} bytes`);
    } catch (error) {
      rejectedRequests++;
      console.log(`5. El backend no da URL → ${error.message}`);
    }
  }

  // 6. El ataque de la revisión de #149: un SVG con <script> declarado como image/png.
  const fakeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const fakeKey = `objetos/demo-objeto/${randomUUID()}.png`;
  const fakeUrl = await createUploadUrl(fakeKey, 'image/png', fakeSvg.length);
  await fetch(fakeUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: fakeSvg });
  let attackBlocked = false;
  try {
    await confirmUpload(fakeKey);
    console.log('✘ El SVG disfrazado se ha aceptado');
  } catch (error) {
    attackBlocked = !(await exists(fakeKey));
    console.log(`6. SVG disfrazado de PNG → ${error.message} · ¿sigue en el bucket? ${attackBlocked ? 'no ✔' : 'sí ✘'}`);
  }

  console.log(`\nAbre esta URL en el navegador para ver la foto (válida ${VIEW_URL_SECONDS / 60} min):\n${viewUrl}`);
  if (!same || put.status >= 300 || get.status >= 300 || rejectedRequests !== 2 || !attackBlocked) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Error del prototipo: ${error.message}`);
  process.exitCode = 1;
});
