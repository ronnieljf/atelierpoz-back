/**
 * Controlador de requests (pedidos)
 * Maneja las peticiones HTTP y delega la lógica de negocio a los servicios
 */

import {
  createRequest,
  getRequestsByStore,
  getRequestById,
  updateRequestStatus,
} from '../services/requestService.js';
import { upsertClientFromOrder } from '../services/clientService.js';

/**
 * Crear un nuevo request (pedido)
 * Body: { storeId, customerName?, customerPhone?, customerEmail?, items, customMessage?, total, currency?, status? }
 */
export async function createRequestHandler(req, res, next) {
  try {
    const {
      storeId,
      customerName,
      customerPhone,
      customerEmail,
      items,
      customMessage,
      total,
      currency,
      status,
      deliveryMethod,
      deliveryAddress,
      deliveryReference,
      deliveryRecipientName,
      deliveryRecipientPhone,
      deliveryDate,
      deliveryNotes,
    } = req.body;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El pedido debe contener al menos un producto',
      });
    }

    if (total === undefined || total === null) {
      return res.status(400).json({
        success: false,
        error: 'El total es requerido',
      });
    }

    const request = await createRequest({
      storeId,
      customerName,
      customerPhone,
      customerEmail,
      items,
      customMessage,
      total,
      currency,
      status,
      deliveryMethod,
      deliveryAddress,
      deliveryReference,
      deliveryRecipientName,
      deliveryRecipientPhone,
      deliveryDate,
      deliveryNotes,
    });

    if (customerPhone) {
      try {
        await upsertClientFromOrder(storeId, {
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
        });
      } catch (err) {
        console.error('[requests] Error upserting client:', err.message);
      }
    }

    res.status(201).json({
      success: true,
      request,
    });
  } catch (error) {
    if (error.message && error.message.includes('no encontrada')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message && (error.message.includes('debe contener') || error.message.includes('debe ser') || error.message.includes('dirección de envío'))) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Obtener todos los requests de una tienda
 * Query params: storeId (requerido), status? (opcional), limit?, offset?, withoutReceivable? (true = solo sin cuenta por cobrar), search? (nombre o número de cliente/pedido)
 */
export async function getRequestsHandler(req, res, next) {
  try {
    const { storeId, status, limit, offset, withoutReceivable, search } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const result = await getRequestsByStore(storeId, {
      status: status || undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      withoutReceivable: withoutReceivable === 'true',
      search: typeof search === 'string' && search.trim() ? search.trim() : undefined,
    });

    res.json({
      success: true,
      requests: result.requests,
      total: result.total,
      count: result.requests.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtener un request específico
 * Params: id (requestId)
 * Query params: storeId (requerido)
 */
export async function getRequestByIdHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const request = await getRequestById(id, storeId);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request no encontrado',
      });
    }

    res.json({
      success: true,
      request,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Actualizar el estado de un request
 * Params: id (requestId)
 * Body: { storeId, status }
 */
export async function updateRequestStatusHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId, status } = req.body;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'status es requerido',
      });
    }

    const request = await updateRequestStatus(id, storeId, status);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request no encontrado o no tienes acceso a él',
      });
    }

    res.json({
      success: true,
      request,
    });
  } catch (error) {
    if (error.message && error.message.includes('Estado inválido')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message && error.message.includes('no encontrado')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}
