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

const router = express.Router();

router.use(authenticateToken);

/** GET /api/sales/top-products?storeId=&limit= - Top 100 productos más vendidos */
router.get('/top-products', getTopProductsHandler);

/** GET /api/sales/products?storeId=&search=&limit= - Búsqueda para POS */
router.get('/products', searchProductsForPOSHandler);

/** GET /api/sales/products/:productId/options?storeId= - Opciones/variantes de un producto para POS */
router.get('/products/:productId/options', getProductOptionsHandler);

/** POST /api/sales - Crear venta al contado */
router.post('/', createSaleHandler);

/** GET /api/sales?storeId=&limit=&offset=&status=&dateFrom=&dateTo=&search= */
router.get('/', getSalesHandler);

/** GET /api/sales/:id?storeId= */
router.get('/:id', getSaleHandler);

/** GET /api/sales/:id/logs?storeId= */
router.get('/:id/logs', getSaleLogsHandler);

/** POST /api/sales/:id/refund?storeId= */
router.post('/:id/refund', refundSaleHandler);

/** POST /api/sales/:id/cancel?storeId= */
router.post('/:id/cancel', cancelSaleHandler);

export default router;
