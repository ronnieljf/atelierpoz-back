/**
 * Controlador para subida de archivos
 */

import { uploadFiles, isValidFileType, isValidFileSize } from '../services/uploadService.js';

/**
 * Subir archivos
 * POST /api/upload
 * Body: multipart/form-data con archivos
 * Query: folder (opcional) - carpeta donde guardar (products, posts, etc.)
 */
export async function uploadFilesHandler(req, res, next) {
  const folder = req.query.folder || '';
  console.log('[upload] POST /api/upload — inicio', { folder, hasFiles: !!req.files, filesLength: req.files?.length ?? 0 });

  try {
    const files = req.files;

    if (!files || files.length === 0) {
      console.log('[upload] Rechazado: no se recibieron archivos (req.files:', req.files === undefined ? 'undefined' : 'vacío', ')');
      return res.status(400).json({
        success: false,
        error: 'No se proporcionaron archivos',
      });
    }

    files.forEach((f, i) => {
      console.log('[upload] Archivo', i + 1, ':', f.originalname, '| mimetype:', f.mimetype, '| size:', f.size, 'bytes');
    });

    // Validar archivos
    const invalidFiles = files.filter(
      (file) => !isValidFileType(file.mimetype) || !isValidFileSize(file.size)
    );

    if (invalidFiles.length > 0) {
      console.log('[upload] Validación fallida:', invalidFiles.map((f) => ({ name: f.originalname, mimetype: f.mimetype, size: f.size })));
      return res.status(400).json({
        success: false,
        error: 'Algunos archivos no son válidos. Solo se permiten imágenes (JPEG, PNG, WebP, GIF, SVG) de máximo 10MB',
      });
    }

    // Preparar archivos para subir
    const filesToUpload = files.map((file) => ({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    }));

    console.log('[upload] Enviando', filesToUpload.length, 'archivo(s) al servicio de upload (R2 + conversión si aplica)...');
    const results = await uploadFiles(filesToUpload, folder);
    console.log('[upload] OK — subidos', results.length, 'archivo(s)');

    res.json({
      success: true,
      files: results,
      count: results.length,
    });
  } catch (error) {
    console.error('[upload] Error:', error?.message || error);
    if (error?.stack) console.error('[upload] Stack:', error.stack);
    next(error);
  }
}
