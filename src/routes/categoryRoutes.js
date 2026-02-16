/**
 * Rutas de categorías
 * GET / (sin storeId) y GET /:id son públicos.
 * GET /by-store?storeId= requiere auth y devuelve solo categorías de esa tienda.
 * POST/PUT/DELETE requieren auth.
 */

import express from 'express';
import {
  getCategories,
  getCategoriesByStoreHandler,
  getCategory,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
} from '../controllers/categoryController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/categories/by-store?storeId=
 * Solo categorías de la tienda (requiere auth y acceso a la tienda)
 */
router.get('/by-store', authenticateToken, getCategoriesByStoreHandler);

/**
 * GET /api/categories
 * Obtener todas las categorías (público, para filtros/productos)
 */
router.get('/', getCategories);

/**
 * GET /api/categories/:id
 * Obtener una categoría por ID (público)
 */
router.get('/:id', getCategory);

/**
 * POST /api/categories
 * Crear una nueva categoría (requiere autenticación)
 * Body: { name, slug }
 */
router.post('/', authenticateToken, createCategoryHandler);

/**
 * PUT /api/categories/:id
 * Actualizar una categoría (requiere autenticación)
 * Body: { name?, slug? }
 */
router.put('/:id', authenticateToken, updateCategoryHandler);

/**
 * DELETE /api/categories/:id
 * Eliminar una categoría (requiere autenticación)
 */
router.delete('/:id', authenticateToken, deleteCategoryHandler);

export default router;
