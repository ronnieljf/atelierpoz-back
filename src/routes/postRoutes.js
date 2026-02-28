/**
 * Rutas para posts (publicaciones Instagram)
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission, requirePermissionOptional, storeIdFromQueryOrBody } from '../middleware/permission.js';
import {
  getPostsHandler,
  getPostByIdHandler,
  createPostHandler,
  updatePostHandler,
  deletePostHandler,
  publishPostHandler,
} from '../controllers/postController.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

/**
 * GET /api/posts
 * Obtener todos los posts del usuario autenticado
 * Query params opcionales:
 * - storeId: Filtrar por tienda específica (requiere posts.view)
 */
router.get('/', requirePermissionOptional('posts.view', (req) => req.query.storeId), getPostsHandler);

/**
 * GET /api/posts/:id
 * Obtener un post por ID (permiso validado en controlador)
 */
router.get('/:id', getPostByIdHandler);

/**
 * POST /api/posts
 * Crear un nuevo post (requiere posts.create cuando storeId en body)
 */
router.post('/', requirePermissionOptional('posts.create', storeIdFromQueryOrBody), createPostHandler);

/**
 * POST /api/posts/:id/publish
 * Publicar el post en Instagram (permiso validado en controlador)
 */
router.post('/:id/publish', publishPostHandler);

/**
 * PUT /api/posts/:id
 * Actualizar un post (permiso validado en controlador)
 */
router.put('/:id', updatePostHandler);

/**
 * DELETE /api/posts/:id
 * Eliminar un post (permiso validado en controlador)
 */
router.delete('/:id', deletePostHandler);

export default router;
