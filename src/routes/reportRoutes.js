/**
 * Rutas de reportes inteligentes.
 * Todas requieren autenticación y storeId en query.
 */

import express from 'express';
import {
  getSalesReportHandler,
  getUnsoldReportHandler,
  getFullReportHandler,
  getRevenueOverTimeHandler,
  getTopProductsHandler,
  getCancelledOrdersReportHandler,
} from '../controllers/reportController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';

const router = express.Router();
const storeIdFromQuery = (req) => req.query.storeId;

router.use(authenticateToken);

/**
 * GET /api/reports/sales
 * Lo que SÍ se vendió: productos, unidades, ingresos, por categoría.
 * Query: storeId (requerido), dateFrom?, dateTo?, groupByCategory?, limit?
 */
router.get('/sales', requirePermission('reports.view', storeIdFromQuery), getSalesReportHandler);

/**
 * GET /api/reports/unsold
 * Lo que NO se vendió en el periodo: productos con 0 ventas.
 * Query: storeId (requerido), dateFrom?, dateTo?, onlyWithStock?, limit?
 */
router.get('/unsold', requirePermission('reports.view', storeIdFromQuery), getUnsoldReportHandler);

/**
 * GET /api/reports/full
 * Reporte completo: resumen ejecutivo + ventas + no vendido.
 * Query: storeId (requerido), dateFrom?, dateTo?, limitSales?, limitUnsold?, onlyWithStock?
 */
router.get('/full', requirePermission('reports.view', storeIdFromQuery), getFullReportHandler);

/**
 * GET /api/reports/revenue-over-time
 * Ingresos en el tiempo (para gráficos): por día, semana o mes.
 * Query: storeId (requerido), dateFrom?, dateTo?, groupBy?: day|week|month
 */
router.get('/revenue-over-time', requirePermission('reports.view', storeIdFromQuery), getRevenueOverTimeHandler);

/**
 * GET /api/reports/top-products
 * Top N productos por unidades o por ingresos.
 * Query: storeId (requerido), dateFrom?, dateTo?, limit?, sortBy?: units|revenue
 */
router.get('/top-products', requirePermission('reports.view', storeIdFromQuery), getTopProductsHandler);

/**
 * GET /api/reports/cancelled-orders
 * Pedidos cancelados en el periodo (oportunidades perdidas).
 * Query: storeId (requerido), dateFrom?, dateTo?, limit?
 */
router.get('/cancelled-orders', requirePermission('reports.view', storeIdFromQuery), getCancelledOrdersReportHandler);

export default router;
