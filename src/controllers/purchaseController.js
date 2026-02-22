/**
 * Controlador de compras al contado (purchases)
 */

import {
  createPurchase,
  getPurchasesByStore,
  getPurchaseById,
  cancelPurchase,
} from '../services/purchaseService.js';
import { getUserStoreById } from '../services/storeService.js';

export async function createPurchaseHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId, vendorId, categoryId, description, items, total, currency, paymentMethod, notes } = req.body;

    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });
    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) return res.status(403).json({ success: false, error: 'Sin acceso' });

    const totalNum = total != null ? parseFloat(total) : NaN;
    if (Number.isNaN(totalNum) || totalNum < 0) {
      return res.status(400).json({ success: false, error: 'Total inválido' });
    }

    const purchase = await createPurchase({
      storeId, vendorId, createdBy: userId, categoryId,
      description, items: items || [], total: totalNum,
      currency: currency || 'USD', paymentMethod, notes,
    });

    return res.status(201).json({ success: true, purchase });
  } catch (error) {
    next(error);
  }
}

export async function getPurchasesHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId, status, categoryId, vendorId, limit, offset } = req.query;

    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });
    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) return res.status(403).json({ success: false, error: 'Sin acceso' });

    const result = await getPurchasesByStore(storeId, { status, categoryId, vendorId, limit, offset });
    return res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getPurchaseByIdHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId } = req.query;

    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });
    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) return res.status(403).json({ success: false, error: 'Sin acceso' });

    const purchase = await getPurchaseById(req.params.id, storeId);
    if (!purchase) return res.status(404).json({ success: false, error: 'Compra no encontrada' });
    return res.json({ success: true, purchase });
  } catch (error) {
    next(error);
  }
}

export async function cancelPurchaseHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId } = req.body;

    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });
    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) return res.status(403).json({ success: false, error: 'Sin acceso' });

    const purchase = await cancelPurchase(req.params.id, storeId, userId);
    if (!purchase) return res.status(404).json({ success: false, error: 'Compra no encontrada' });
    return res.json({ success: true, purchase });
  } catch (error) {
    next(error);
  }
}
