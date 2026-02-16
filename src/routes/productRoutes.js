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
 * Obtener todos los productos de una tienda
 * Query params: storeId (requerido), categoryId (opcional), limit, offset
 */
router.get('/', getProducts);

/**
 * GET /api/products/admin
 * Obtener todos los productos de todas las tiendas
 * Query params: storeId (opcional), categoryId (opcional), limit, offset, search
 */
router.get('/admin', getProductsAdminHandler);

/**
 * POST /api/products/reorder
 * Reordenar productos de una tienda. Body: { storeId, productIds: string[] }
 */
router.post('/reorder', reorderProductsHandler);

/**
 * GET /api/products/:id
 * Obtener un producto específico
 * Query params: storeId (requerido)
 */
router.get('/:id', getProduct);

/**
 * POST /api/products
 * Crear un nuevo producto
 * Body: { name, description, basePrice, currency, stock, sku, categoryId, storeId, images, attributes, rating, reviewCount, tags }
 */
router.post('/', createProductHandler);

/**
 * PUT /api/products/:id
 * Actualizar un producto
 * Body: { storeId, ...updates }
 */
router.put('/:id', updateProductHandler);

/**
 * PUT /api/products/:id/out_stock
 * Poner el stock de un producto en 0
 * Query params: storeId (requerido)
 */
router.put('/:id/out_stock', outStockHandler);

/**
 * DELETE /api/products/:id
 * Eliminar un producto
 * Query params: storeId (requerido)
 */
router.delete('/:id', deleteProductHandler);

export default router;
