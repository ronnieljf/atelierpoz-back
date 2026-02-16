/**
 * Rutas para posts
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getPostsHandler,
  getPostByIdHandler,
  createPostHandler,
  updatePostHandler,
  deletePostHandler,
} from '../controllers/postController.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

/**
 * GET /api/posts
 * Obtener todos los posts del usuario autenticado
 * Query params opcionales:
 * - storeId: Filtrar por tienda específica
 */
router.get('/', getPostsHandler);

/**
 * GET /api/posts/:id
 * Obtener un post por ID
 */
router.get('/:id', getPostByIdHandler);

/**
 * POST /api/posts
 * Crear un nuevo post
 */
router.post('/', createPostHandler);

/**
 * PUT /api/posts/:id
 * Actualizar un post
 */
router.put('/:id', updatePostHandler);

/**
 * DELETE /api/posts/:id
 * Eliminar un post
 */
router.delete('/:id', deletePostHandler);

export default router;
