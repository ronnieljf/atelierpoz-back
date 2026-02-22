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
import { requirePermission, storeIdFromQueryOrBody } from '../middleware/permission.js';

const router = express.Router();

/**
 * GET /api/categories/by-store?storeId=
 */
router.get('/by-store', authenticateToken, requirePermission('categories.view', (req) => req.query.storeId), getCategoriesByStoreHandler);

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
 * Body: { name, slug?, storeId }
 */
router.post('/', authenticateToken, requirePermission('categories.create', (req) => req.body?.storeId || req.body?.store_id), createCategoryHandler);

/**
 * PUT /api/categories/:id
 * Body: { name?, slug? } — permiso se valida en controlador (storeId de la categoría)
 */
router.put('/:id', authenticateToken, updateCategoryHandler);

/**
 * DELETE /api/categories/:id
 * Permiso se valida en controlador (storeId de la categoría)
 */
router.delete('/:id', authenticateToken, deleteCategoryHandler);

export default router;
