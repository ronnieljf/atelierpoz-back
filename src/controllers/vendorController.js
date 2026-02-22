/**
 * Controlador de proveedores (vendors)
 */

import {
  getVendorsByStore,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
} from '../services/vendorService.js';
import { getUserStoreById } from '../services/storeService.js';

async function checkStoreAccess(req, storeId) {
  if (!storeId) return false;
  const store = await getUserStoreById(storeId, req.user.id);
  return !!store;
}

export async function getVendorsHandler(req, res, next) {
  try {
    const { storeId, limit, offset, search } = req.query;
    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });
    if (!(await checkStoreAccess(req, storeId))) return res.status(403).json({ success: false, error: 'Sin acceso' });

    const result = await getVendorsByStore(storeId, { limit, offset, search });
    return res.json({ success: true, vendors: result.vendors, total: result.total, count: result.vendors.length });
  } catch (error) {
    next(error);
  }
}

export async function getVendorHandler(req, res, next) {
  try {
    const storeId = req.query.storeId;
    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });
    if (!(await checkStoreAccess(req, storeId))) return res.status(403).json({ success: false, error: 'Sin acceso' });

    const vendor = await getVendorById(req.params.id, storeId);
    if (!vendor) return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
    return res.json({ success: true, vendor });
  } catch (error) {
    next(error);
  }
}

export async function createVendorHandler(req, res, next) {
  try {
    const { storeId, name, phone, email, address, identityDocument, notes } = req.body;
    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });
    if (!(await checkStoreAccess(req, storeId))) return res.status(403).json({ success: false, error: 'Sin acceso' });

    if (!name?.trim() && !phone?.trim()) {
      return res.status(400).json({ success: false, error: 'Se requiere al menos nombre o teléfono' });
    }

    const vendor = await createVendor({ storeId, name, phone, email, address, identityDocument, notes });
    return res.status(201).json({ success: true, vendor });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ya existe un proveedor con ese teléfono en esta tienda' });
    }
    next(error);
  }
}

export async function updateVendorHandler(req, res, next) {
  try {
    const { storeId, name, phone, email, address, identityDocument, notes } = req.body;
    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });
    if (!(await checkStoreAccess(req, storeId))) return res.status(403).json({ success: false, error: 'Sin acceso' });

    const vendor = await updateVendor(req.params.id, storeId, { name, phone, email, address, identityDocument, notes });
    if (!vendor) return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
    return res.json({ success: true, vendor });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ya existe un proveedor con ese teléfono' });
    }
    next(error);
  }
}

export async function deleteVendorHandler(req, res, next) {
  try {
    const storeId = req.query.storeId;
    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });
    if (!(await checkStoreAccess(req, storeId))) return res.status(403).json({ success: false, error: 'Sin acceso' });

    const deleted = await deleteVendor(req.params.id, storeId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Proveedor no encontrado' });
    return res.json({ success: true, message: 'Proveedor eliminado' });
  } catch (error) {
    next(error);
  }
}
