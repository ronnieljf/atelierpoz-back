/**
 * Rutas de productos
 */

import express from 'express';
import {
  getProducts,
  getProductsAdminHandler,
  getProduct,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
  getRecentProductsHandler,
  getProductPublicHandler,
  getStoreProductsPublicHandler,
  outStockHandler,
  reorderProductsHandler,
} from '../controllers/productController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission, storeIdFromQueryOrBody } from '../middleware/permission.js';

const router = express.Router();

// Rutas públicas (sin autenticación) - DEBEN estar antes del middleware
/**
 * GET /api/products/recent
 * Obtener productos más recientes (público, sin autenticación)
 * Query params: limit (opcional, default: 20), offset (opcional, default: 0)
 */
router.get('/recent', getRecentProductsHandler);

/**
 * GET /api/products/public/:id
 * Obtener un producto por ID (público, sin autenticación)
 */
router.get('/public/:id', getProductPublicHandler);

/**
 * GET /api/products/store/:storeId
 * Obtener productos de una tienda específica (público, sin autenticación)
 * Query params: limit (opcional, default: 50), offset (opcional, default: 0)
 */
router.get('/store/:storeId', getStoreProductsPublicHandler);

// Todas las demás rutas requieren autenticación
// IMPORTANTE: Este middleware solo se aplica a las rutas definidas DESPUÉS de esta línea
router.use(authenticateToken);

/**
 * GET /api/products
 * Query params: storeId (requerido), categoryId (opcional), limit, offset
 */
router.get('/', requirePermission('products.view', storeIdFromQueryOrBody), getProducts);

/**
 * GET /api/products/admin
 * Query params: storeId (opcional), categoryId (opcional), limit, offset, search
 */
router.get('/admin', getProductsAdminHandler);

/**
 * POST /api/products/reorder
 * Body: { storeId, productIds: string[] }
 */
router.post('/reorder', requirePermission('products.edit', storeIdFromQueryOrBody), reorderProductsHandler);

/**
 * GET /api/products/:id
 * Query params: storeId (requerido)
 */
router.get('/:id', requirePermission('products.view', storeIdFromQueryOrBody), getProduct);

/**
 * POST /api/products
 * Body: { name, description, basePrice, currency, stock, sku, categoryId, storeId, ... }
 */
router.post('/', requirePermission('products.create', storeIdFromQueryOrBody), createProductHandler);

/**
 * PUT /api/products/:id
 * Body: { storeId, ...updates }
 */
router.put('/:id', requirePermission('products.edit', storeIdFromQueryOrBody), updateProductHandler);

/**
 * PUT /api/products/:id/out_stock
 * Query params: storeId (requerido)
 */
router.put('/:id/out_stock', requirePermission('products.edit', storeIdFromQueryOrBody), outStockHandler);

/**
 * DELETE /api/products/:id
 * Query params: storeId (requerido)
 */
router.delete('/:id', requirePermission('products.edit', storeIdFromQueryOrBody), deleteProductHandler);

export default router;
