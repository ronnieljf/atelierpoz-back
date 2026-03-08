/**
 * Servicio de adjuntos (comprobantes) para cuentas por cobrar
 */

import { query } from '../config/database.js';
import { uploadFile, getSignedDownloadUrl } from './uploadService.js';

const FOLDER = 'receivable-attachments';

function formatAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    receivableId: row.receivable_id,
    paymentId: row.payment_id,
    fileName: row.file_name,
    fileUrl: row.file_url,
    mimeType: row.mime_type,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

/**
 * Crear un adjunto (sube a R2 y guarda en BD)
 * @param {Object} params - receivableId, paymentId?, file (multer), createdBy
 */
export async function createAttachment({ receivableId, paymentId, file, createdBy }) {
  if (!file || !file.buffer) {
    throw new Error('No se recibió ningún archivo');
  }

  const { url, key } = await uploadFile(
    file.buffer,
    file.originalname || 'comprobante',
    file.mimetype || 'application/octet-stream',
    FOLDER
  );

  const result = await query(
    `INSERT INTO receivable_attachments (receivable_id, payment_id, file_name, file_url, file_key, mime_type, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, receivable_id, payment_id, file_name, file_url, mime_type, created_at, created_by`,
    [
      receivableId,
      paymentId || null,
      file.originalname || 'comprobante',
      url,
      key,
      file.mimetype || 'application/octet-stream',
      createdBy,
    ]
  );

  return formatAttachment(result.rows[0]);
}

/**
 * Listar adjuntos de una cuenta por cobrar
 */
export async function getAttachmentsByReceivableId(receivableId, storeId) {
  const result = await query(
    `SELECT ra.id, ra.receivable_id, ra.payment_id, ra.file_name, ra.file_url, ra.file_key, ra.mime_type, ra.created_at, ra.created_by
     FROM receivable_attachments ra
     JOIN receivables r ON r.id = ra.receivable_id
     WHERE ra.receivable_id = $1 AND r.store_id = $2
     ORDER BY ra.created_at DESC`,
    [receivableId, storeId]
  );
  return (result.rows || []).map(formatAttachment);
}

/**
 * Obtener un adjunto por ID (verificar que pertenece al receivable y store)
 */
export async function getAttachmentById(attachmentId, receivableId, storeId) {
  const result = await query(
    `SELECT ra.id, ra.receivable_id, ra.payment_id, ra.file_name, ra.file_url, ra.file_key, ra.mime_type
     FROM receivable_attachments ra
     JOIN receivables r ON r.id = ra.receivable_id
     WHERE ra.id = $1 AND ra.receivable_id = $2 AND r.store_id = $3`,
    [attachmentId, receivableId, storeId]
  );
  return result.rows[0] || null;
}

/**
 * Generar URL firmada para descargar un adjunto
 */
export async function getAttachmentDownloadUrl(attachmentId, receivableId, storeId) {
  const att = await getAttachmentById(attachmentId, receivableId, storeId);
  if (!att) return null;
  return getSignedDownloadUrl(att.file_key, 3600);
}
