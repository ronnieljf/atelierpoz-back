/**
 * Rutas para subida de archivos
 */

import express from 'express';
import { uploadFilesHandler } from '../controllers/uploadController.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadMiddleware } from '../middleware/multer.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

/**
 * POST /api/upload
 * Subir uno o varios archivos a Cloudflare R2
 * 
 * Body: multipart/form-data
 *   - files: uno o varios archivos
 * 
 * Query params:
 *   - folder: (opcional) carpeta donde guardar (products, posts, etc.)
 * 
 * Response:
 *   {
 *     success: true,
 *     files: [
 *       { url: "https://...", key: "..." },
 *       ...
 *     ],
 *     count: 2
 *   }
 */
router.post('/', uploadMiddleware, uploadFilesHandler);

export default router;
