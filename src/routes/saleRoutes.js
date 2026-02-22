/**
 * Rutas de ventas (POS)
 * Todas requieren autenticación y acceso a la tienda.
 */

import express from 'express';
import {
  getTopProductsHandler,
  searchProductsForPOSHandler,
  getProductOptionsHandler,
  createSaleHandler,
  getSalesHandler,
  getSaleHandler,
  getSaleLogsHandler,
  refundSaleHandler,
  cancelSaleHandler,
} from '../controllers/saleController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission, storeIdFromQueryOrBody } from '../middleware/permission.js';

const router = express.Router();

router.use(authenticateToken);

const storeIdQueryOrBody = (req) => req.query.storeId || req.body?.storeId;

/** GET /api/sales/top-products?storeId=&limit= */
router.get('/top-products', requirePermission('sales.view', storeIdQueryOrBody), getTopProductsHandler);

/** GET /api/sales/products?storeId=&search=&limit= */
router.get('/products', requirePermission('sales.view', storeIdQueryOrBody), searchProductsForPOSHandler);

/** GET /api/sales/products/:productId/options?storeId= */
router.get('/products/:productId/options', requirePermission('sales.view', storeIdQueryOrBody), getProductOptionsHandler);

/** POST /api/sales - Crear venta */
router.post('/', requirePermission('sales.create', storeIdQueryOrBody), createSaleHandler);

/** GET /api/sales?storeId=&limit=&offset=... */
router.get('/', requirePermission('sales.view', storeIdQueryOrBody), getSalesHandler);

/** GET /api/sales/:id?storeId= */
router.get('/:id', requirePermission('sales.view', storeIdQueryOrBody), getSaleHandler);

/** GET /api/sales/:id/logs?storeId= */
router.get('/:id/logs', requirePermission('sales.view', storeIdQueryOrBody), getSaleLogsHandler);

/** POST /api/sales/:id/refund?storeId= */
router.post('/:id/refund', requirePermission('sales.cancel', storeIdQueryOrBody), refundSaleHandler);

/** POST /api/sales/:id/cancel?storeId= */
router.post('/:id/cancel', requirePermission('sales.cancel', storeIdQueryOrBody), cancelSaleHandler);

export default router;
