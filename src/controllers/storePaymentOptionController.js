/**
 * Controlador de opciones de pago guardadas por tienda
 */

import { getUserStoreById } from '../services/storeService.js';
import {
  getPaymentOptionsByStore,
  createPaymentOption,
  updatePaymentOption,
  deletePaymentOption,
} from '../services/storePaymentOptionService.js';

const storeIdFromParams = (req) => req.params.id;

/**
 * GET /api/stores/:id/payment-options
 * Listar opciones de pago de la tienda (PagoMovil, transferencia, Binance)
 */
export async function getPaymentOptionsHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const storeId = req.params.id;

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const options = await getPaymentOptionsByStore(storeId);
    return res.json({ success: true, options });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/stores/:id/payment-options
 * Crear opción de pago. Body: { type, data, label? }
 */
export async function createPaymentOptionHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const storeId = req.params.id;
    const { type, data, label } = req.body;

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const option = await createPaymentOption({ storeId, type, data, label });
    return res.json({ success: true, option });
  } catch (error) {
    if (error.message?.includes('Tipo debe ser') || error.message?.includes('Los datos son requeridos')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
}

/**
 * PUT /api/stores/:id/payment-options/:optionId
 * Actualizar opción de pago. Body: { label?, data? }
 */
export async function updatePaymentOptionHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const storeId = req.params.id;
    const { optionId } = req.params;
    const { label, data } = req.body;

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const option = await updatePaymentOption(optionId, storeId, { label, data });
    if (!option) {
      return res.status(404).json({ success: false, error: 'Opción de pago no encontrada' });
    }
    return res.json({ success: true, option });
  } catch (error) {
    if (error.message?.includes('Los datos no pueden estar vacíos')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
}

/**
 * DELETE /api/stores/:id/payment-options/:optionId
 * Eliminar opción de pago
 */
export async function deletePaymentOptionHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const storeId = req.params.id;
    const { optionId } = req.params;

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const deleted = await deletePaymentOption(optionId, storeId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Opción de pago no encontrada' });
    }
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
}
