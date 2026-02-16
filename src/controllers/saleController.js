/**
 * Controlador de ventas (POS)
 */

import { createSale, getSalesByStore, getSaleById, refundSale, cancelSale, getTopSoldProductsForPOS, getSalesLogs } from '../services/saleService.js';
import { getUserStoreById } from '../services/storeService.js';
import { searchProductsForPOS, getProductPOSOptions } from '../services/productService.js';

function checkStoreAccess(req, storeId) {
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (isAdmin) return Promise.resolve(true);
  return getUserStoreById(storeId, userId).then((store) => !!store);
}

/**
 * GET /api/sales/top-products?storeId=&limit=
 * Productos más vendidos (para búsqueda local rápida en frontend)
 */
export async function getTopProductsHandler(req, res, next) {
  try {
    const { storeId, limit } = req.query;
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const products = await getTopSoldProductsForPOS(storeId, limit ? parseInt(limit) : 100);
    res.json({ success: true, products });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/sales/products?storeId=&search=&limit=
 * Búsqueda de productos para POS
 */
export async function searchProductsForPOSHandler(req, res, next) {
  try {
    const { storeId, search, limit } = req.query;
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const products = await searchProductsForPOS(storeId, search || '', limit ? parseInt(limit) : 30);
    res.json({ success: true, products });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/sales/products/:productId/options?storeId=
 * Todas las opciones (combinaciones) de un producto para elegir variante en POS
 */
export async function getProductOptionsHandler(req, res, next) {
  try {
    const { productId } = req.params;
    const { storeId } = req.query;
    if (!storeId || !productId) {
      return res.status(400).json({ success: false, error: 'storeId y productId son requeridos' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const products = await getProductPOSOptions(storeId, productId);
    res.json({ success: true, products });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/sales
 * Body: { storeId, clientId, items, total, currency? }
 */
export async function createSaleHandler(req, res, next) {
  try {
    const { storeId, clientId, items, total, currency, paymentMethod, notes } = req.body;
    const createdBy = req.user.id;
    if (!storeId || !clientId) {
      return res.status(400).json({ success: false, error: 'storeId y clientId son requeridos' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const sale = await createSale({
      storeId,
      clientId,
      createdBy,
      items: items || [],
      total,
      currency: currency || 'USD',
      paymentMethod: paymentMethod || undefined,
      notes: notes || undefined,
    });
    res.status(201).json({ success: true, sale });
  } catch (error) {
    const msg = error && error.message ? String(error.message) : '';
    if (msg.includes('stock') || msg.includes('Disponible') || msg.includes('no está disponible')) {
      return res.status(400).json({ success: false, error: msg });
    }
    next(error);
  }
}

/**
 * GET /api/sales?storeId=&limit=&offset=&status=&dateFrom=&dateTo=&search=
 */
export async function getSalesHandler(req, res, next) {
  try {
    const { storeId, limit, offset, status, dateFrom, dateTo, search } = req.query;
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const result = await getSalesByStore(storeId, {
      limit: limit ? parseInt(limit) : 20,
      offset: offset ? parseInt(offset) : 0,
      status: status || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/sales/:id?storeId=
 */
export async function getSaleHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId } = req.query;
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const sale = await getSaleById(id, storeId);
    if (!sale) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    res.json({ success: true, sale });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/sales/:id/refund?storeId=
 */
export async function refundSaleHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId } = req.query;
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const sale = await refundSale(id, storeId, req.user.id);
    if (!sale) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    res.json({ success: true, sale });
  } catch (error) {
    if (error.message?.includes('Solo se pueden devolver')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
}

/**
 * POST /api/sales/:id/cancel?storeId=
 */
export async function cancelSaleHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId } = req.query;
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const sale = await cancelSale(id, storeId, req.user.id);
    if (!sale) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    res.json({ success: true, sale });
  } catch (error) {
    if (error.message?.includes('Solo se pueden cancelar')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
}

/**
 * GET /api/sales/:id/logs?storeId=
 */
export async function getSaleLogsHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId } = req.query;
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const logs = await getSalesLogs(id, storeId);
    if (logs === null) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    res.json({ success: true, logs });
  } catch (error) {
    next(error);
  }
}
