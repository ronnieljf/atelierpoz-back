/**
 * Servicio para subir archivos a Cloudflare R2 (S3-compatible)
 * Para imágenes que superen el límite de tamaño, se redimensionan y comprimen a WebP antes de subir.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { extname, basename } from 'node:path';

/** Sharp se carga bajo demanda; en servidores con CPU antiguo puede no estar disponible */
let sharpModule = undefined; // undefined = no intentado, null = no disponible, else = módulo
let sharpUnavailableLogged = false;
function getSharp() {
  if (sharpModule !== undefined) return sharpModule;
  try {
    sharpModule = require('sharp');
    return sharpModule;
  } catch (e) {
    sharpModule = null;
    if (!sharpUnavailableLogged) {
      sharpUnavailableLogged = true;
      console.warn('sharp no disponible (CPU/plataforma no soportada). Las imágenes se subirán sin redimensionar.');
    }
    return null;
  }
}

/** Imágenes por encima de este tamaño (bytes) se redimensionan y comprimen */
const MAX_IMAGE_SIZE_BYTES = 600 * 1024; // 600 KB
/** Lado máximo en px al redimensionar (se mantiene ratio) */
const MAX_IMAGE_LONGEST_SIDE = 1200;
/** Calidad WebP al comprimir (1–100) */
const WEBP_QUALITY = 82;

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

// Configurar cliente S3 para Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || 'https://054bdc8d8d0adab1c53fc077061dac39.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'atelierpoz';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || null; // Si es null, se usarán signed URLs
const USE_SIGNED_URLS = !PUBLIC_URL; // Usar signed URLs si no hay public URL configurado

/**
 * Generar nombre único para el archivo
 * @param {string} originalName - Nombre original del archivo
 * @param {string} folder - Carpeta donde se guardará (opcional)
 * @returns {string} Nombre único del archivo
 */
function generateFileName(originalName, folder = '') {
  const ext = extname(originalName);
  const uniqueId = randomUUID();
  const timestamp = Date.now();
  const fileName = `${timestamp}-${uniqueId}${ext}`;
  
  if (folder) {
    return `${folder}/${fileName}`;
  }
  
  return fileName;
}

/**
 * Generar URL para un archivo (pública o signed)
 * @param {string} fileName - Nombre del archivo
 * @returns {Promise<string>} URL del archivo
 */
async function generateFileUrl(fileName) {
  if (!USE_SIGNED_URLS && PUBLIC_URL) {
    // Usar URL pública si está configurada (URLs que nunca expiran)
    const publicUrl = `${PUBLIC_URL.replace(/\/$/, '')}/${fileName}`;
    return publicUrl;
  }

  // Generar signed URL (solo si R2_PUBLIC_URL no está configurado)
  // NOTA: AWS S3/R2 tiene un límite máximo de 7 días (604800 segundos) para presigned URLs
  // ⚠️ Si quieres URLs que no expiren, configura R2_PUBLIC_URL en tu .env
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
  });

  // Máximo permitido: 7 días (604800 segundos)
  const MAX_EXPIRES_IN = 604800; // 7 días
  const defaultExpiresIn = 604800; // 7 días por defecto
  
  let expiresIn = parseInt(process.env.R2_SIGNED_URL_EXPIRES_IN || defaultExpiresIn.toString());
  
  if (expiresIn > MAX_EXPIRES_IN) {
    expiresIn = MAX_EXPIRES_IN;
  }

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });

  return signedUrl;
}

/**
 * Generar URL firmada para descargar un archivo por su key (para attachments, etc.)
 * @param {string} fileKey - Key del archivo en R2
 * @param {number} [expiresIn=3600] - Segundos hasta expiración (default 1 hora)
 * @returns {Promise<string>} URL firmada
 */
export async function getSignedDownloadUrl(fileKey, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Redimensiona y comprime una imagen a WebP si supera el límite de tamaño.
 * No aplica a SVG. Devuelve { buffer, mimeType, originalName } listos para subir.
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} mimeType
 * @returns {Promise<{buffer: Buffer, mimeType: string, originalName: string}>}
 */
async function maybeResizeImage(buffer, originalName, mimeType) {
  const sizeKb = (buffer.length / 1024).toFixed(1);
  console.log('[upload:resize] maybeResizeImage —', originalName, '| mimetype:', mimeType, '| size:', sizeKb, 'KB');

  if (!IMAGE_MIMES.has(mimeType) || mimeType === 'image/svg+xml') {
    console.log('[upload:resize] Sin conversión (tipo no procesable o SVG), se sube original');
    return { buffer, mimeType, originalName };
  }
  if (buffer.length <= MAX_IMAGE_SIZE_BYTES) {
    console.log('[upload:resize] Sin conversión (<=', MAX_IMAGE_SIZE_BYTES / 1024, 'KB), se sube original');
    return { buffer, mimeType, originalName };
  }

  const sharp = getSharp();
  if (!sharp) {
    console.log('[upload:resize] Sharp no disponible, se sube original');
    return { buffer, mimeType, originalName };
  }

  const ext = extname(originalName);
  const base = basename(originalName, ext);
  const outName = `${base}.webp`;
  console.log('[upload:resize] Redimensionando y convirtiendo a WebP (max lado', MAX_IMAGE_LONGEST_SIDE, 'px, calidad', WEBP_QUALITY, ')...');

  try {
    const out = await sharp(buffer)
      .resize(MAX_IMAGE_LONGEST_SIDE, MAX_IMAGE_LONGEST_SIDE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    console.log('[upload:resize] OK — resultado:', (out.length / 1024).toFixed(1), 'KB WebP');
    return {
      buffer: out,
      mimeType: 'image/webp',
      originalName: outName,
    };
  } catch (err) {
    console.error('[upload:resize] Error en sharp, se sube original:', err?.message || err);
    if (err?.stack) console.error('[upload:resize] Stack:', err.stack);
    return { buffer, mimeType, originalName };
  }
}

/**
 * Subir un buffer directamente a R2 (sin redimensionar ni cambiar formato).
 * Útil para imágenes ya procesadas (ej. formato Instagram).
 *
 * @param {Buffer} buffer - Buffer del archivo
 * @param {string} mimeType - Tipo MIME (ej. 'image/jpeg')
 * @param {string} folder - Carpeta donde guardar (opcional)
 * @param {string} extension - Extensión del archivo (ej. '.jpg')
 * @returns {Promise<{url: string, key: string}>}
 */
export async function uploadBuffer(buffer, mimeType, folder = '', extension = '.jpg') {
  const fileName = generateFileName(`instagram${extension}`, folder);
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: buffer,
    ContentType: mimeType,
  });
  await s3Client.send(command);
  const fileUrl = await generateFileUrl(fileName);
  return { url: fileUrl, key: fileName };
}

/**
 * Descarga una imagen desde una URL, la ajusta al formato 4:5 de Instagram (1080x1350)
 * con padding blanco para que no se recorte, y la sube a R2.
 * Evita que Instagram recorte la imagen por no cumplir relación de aspecto.
 *
 * @param {string} imageUrl - URL pública de la imagen
 * @returns {Promise<string>} URL pública de la imagen procesada en R2
 */
export async function fitAndUploadForInstagram(imageUrl) {
  const sharp = getSharp();
  if (!sharp) {
    console.warn('[instagram:fit] Sharp no disponible, se usará la URL original');
    return imageUrl;
  }

  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`No se pudo descargar la imagen: ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());

  const TARGET_W = 1080;
  const TARGET_H = 1350; // 4:5

  const resized = await sharp(buffer)
    .resize(TARGET_W, TARGET_H, { fit: 'contain' })
    .toBuffer();
  const meta = await sharp(resized).metadata();
  const w = meta.width || TARGET_W;
  const h = meta.height || TARGET_H;
  const padTop = Math.floor((TARGET_H - h) / 2);
  const padBottom = TARGET_H - h - padTop;
  const padLeft = Math.floor((TARGET_W - w) / 2);
  const padRight = TARGET_W - w - padLeft;

  const padded = await sharp(resized)
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  const { url } = await uploadBuffer(padded, 'image/jpeg', 'instagram', '.jpg');
  return url;
}

/**
 * Subir un archivo a R2.
 * Si es una imagen y supera MAX_IMAGE_SIZE_BYTES, se redimensiona y comprime a WebP antes de subir.
 *
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {string} originalName - Nombre original del archivo
 * @param {string} mimeType - Tipo MIME del archivo
 * @param {string} folder - Carpeta donde guardar (opcional, ej: 'products', 'posts')
 * @returns {Promise<{url: string, key: string}>} URL pública/signed y clave del archivo
 */
export async function uploadFile(fileBuffer, originalName, mimeType, folder = '') {
  console.log('[upload:file] uploadFile —', originalName, '| mimetype:', mimeType, '| buffer:', fileBuffer?.length ?? 0, 'bytes');
  try {
    const { buffer, mimeType: finalMime, originalName: finalName } = await maybeResizeImage(
      fileBuffer,
      originalName,
      mimeType
    );
    console.log('[upload:file] Tras maybeResizeImage — buffer:', buffer?.length ?? 0, 'bytes | finalMime:', finalMime);

    const fileName = generateFileName(finalName, folder);
    console.log('[upload:file] Subiendo a R2 — key:', fileName);

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: finalMime,
    });

    await s3Client.send(command);
    console.log('[upload:file] R2 PutObject OK');

    const fileUrl = await generateFileUrl(fileName);
    console.log('[upload:file] OK — url generada para', originalName);

    return {
      url: fileUrl,
      key: fileName,
    };
  } catch (error) {
    console.error('[upload:file] Error subiendo archivo a R2:', error?.message || error);
    if (error?.stack) console.error('[upload:file] Stack:', error.stack);
    throw new Error(`Error al subir archivo: ${error.message}`);
  }
}

/**
 * Subir múltiples archivos a R2
 * @param {Array<{buffer: Buffer, originalName: string, mimeType: string}>} files - Array de archivos
 * @param {string} folder - Carpeta donde guardar (opcional)
 * @returns {Promise<Array<{url: string, key: string}>>} Array de URLs y claves
 */
export async function uploadFiles(files, folder = '') {
  console.log('[upload] uploadFiles —', files.length, 'archivo(s), folder:', folder || '(raíz)');
  try {
    const uploadPromises = files.map((file, index) =>
      uploadFile(file.buffer, file.originalName, file.mimeType, folder).then((result) => {
        console.log('[upload] Archivo', index + 1, '/', files.length, 'OK:', file.originalName);
        return result;
      })
    );

    const results = await Promise.all(uploadPromises);
    console.log('[upload] uploadFiles — todos los archivos subidos correctamente');
    return results;
  } catch (error) {
    console.error('[upload] Error en uploadFiles:', error?.message || error);
    throw error;
  }
}

/**
 * Validar tipo de archivo
 * @param {string} mimeType - Tipo MIME del archivo
 * @returns {boolean} true si es un tipo válido
 */
export function isValidFileType(mimeType) {
  const validTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/avif',
  ];
  return validTypes.includes(mimeType);
}

/**
 * Validar tamaño de archivo
 * @param {number} size - Tamaño en bytes
 * @param {number} maxSize - Tamaño máximo en bytes (default: 10MB)
 * @returns {boolean} true si el tamaño es válido
 */
export function isValidFileSize(size, maxSize = 10 * 1024 * 1024) {
  return size <= maxSize;
}
