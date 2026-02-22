/**
 * Controlador de reportes inteligentes.
 * Requiere autenticación y acceso a la tienda (storeId en query).
 */

import {
  getSalesReport,
  getUnsoldReport,
  getFullReport,
  getRevenueOverTime,
  getTopProducts,
  getCancelledOrdersReport,
} from '../services/reportService.js';
import { getUserStoreById } from '../services/storeService.js';

/**
 * GET /api/reports/sales
 * Query: storeId (requerido), dateFrom?, dateTo?, groupByCategory?, limit?
 */
export async function getSalesReportHandler(req, res, next) {
  try {
    const userId = req.user?.id;
    const { storeId, dateFrom, dateTo, groupByCategory, limit } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const store = await getUserStoreById(storeId, userId);
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const report = await getSalesReport(storeId, {
      dateFrom,
      dateTo,
      groupByCategory: groupByCategory === 'true' || groupByCategory === '1',
      limit,
    });

    return res.json({
      success: true,
      report,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reports/unsold
 * Query: storeId (requerido), dateFrom?, dateTo?, onlyWithStock?, limit?
 */
export async function getUnsoldReportHandler(req, res, next) {
  try {
    const userId = req.user?.id;
    const { storeId, dateFrom, dateTo, onlyWithStock, limit } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const store = await getUserStoreById(storeId, userId);
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const report = await getUnsoldReport(storeId, {
      dateFrom,
      dateTo,
      onlyWithStock: onlyWithStock === 'true' || onlyWithStock === '1',
      limit,
    });

    return res.json({
      success: true,
      report,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reports/full
 * Query: storeId (requerido), dateFrom?, dateTo?, limitSales?, limitUnsold?, onlyWithStock?
 */
export async function getFullReportHandler(req, res, next) {
  try {
    const userId = req.user?.id;
    const { storeId, dateFrom, dateTo, limitSales, limitUnsold, onlyWithStock } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const store = await getUserStoreById(storeId, userId);
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const report = await getFullReport(storeId, {
      dateFrom,
      dateTo,
      limitSales,
      limitUnsold,
      onlyWithStock: onlyWithStock === 'true' || onlyWithStock === '1',
    });

    return res.json({
      success: true,
      report,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reports/revenue-over-time
 * Query: storeId (requerido), dateFrom?, dateTo?, groupBy?: day|week|month
 */
export async function getRevenueOverTimeHandler(req, res, next) {
  try {
    const userId = req.user?.id;
    const { storeId, dateFrom, dateTo, groupBy } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const store = await getUserStoreById(storeId, userId);
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const data = await getRevenueOverTime(storeId, {
      dateFrom,
      dateTo,
      groupBy,
    });

    return res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reports/top-products
 * Query: storeId (requerido), dateFrom?, dateTo?, limit?, sortBy?: units|revenue
 */
export async function getTopProductsHandler(req, res, next) {
  try {
    const userId = req.user?.id;
    const { storeId, dateFrom, dateTo, limit, sortBy } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const store = await getUserStoreById(storeId, userId);
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const data = await getTopProducts(storeId, {
      dateFrom,
      dateTo,
      limit,
      sortBy,
    });

    return res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reports/cancelled-orders
 * Query: storeId (requerido), dateFrom?, dateTo?, limit?
 */
export async function getCancelledOrdersReportHandler(req, res, next) {
  try {
    const userId = req.user?.id;
    const { storeId, dateFrom, dateTo, limit } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const store = await getUserStoreById(storeId, userId);
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const report = await getCancelledOrdersReport(storeId, {
      dateFrom,
      dateTo,
      limit,
    });

    return res.json({
      success: true,
      report,
    });
  } catch (error) {
    next(error);
  }
}
