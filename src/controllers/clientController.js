/**
 * Controlador de clientes (cartera por tienda)
 */

import {
  getClientsByStore,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
} from '../services/clientService.js';
import { getUserStoreById } from '../services/storeService.js';

function checkStoreAccess(req, storeId) {
  const userId = req.user.id;
  return getUserStoreById(storeId, userId).then((store) => !!store);
}

/**
 * GET /api/clients?storeId=&limit=&offset=&search=
 */
export async function getClientsHandler(req, res, next) {
  try {
    const { storeId, limit, offset, search } = req.query;
    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }
    const result = await getClientsByStore(storeId, {
      limit: limit ? parseInt(limit) : 20,
      offset: offset ? parseInt(offset) : 0,
      search: search != null ? String(search).trim() : undefined,
    });
    res.json({
      success: true,
      clients: result.clients,
      total: result.total,
      count: result.clients.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/clients/:id?storeId=
 */
export async function getClientHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId } = req.query;
    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }
    const client = await getClientById(id, storeId);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado',
      });
    }
    res.json({
      success: true,
      client,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/clients
 * Body: { storeId, name?, phone?, email?, address?, identityDocument } — identityDocument (cédula) es obligatorio
 */
export async function createClientHandler(req, res, next) {
  try {
    const { storeId, name, phone, email, address, identityDocument } = req.body;
    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }
    const cedula = identityDocument != null ? String(identityDocument).trim() : '';
    if (!cedula) {
      return res.status(400).json({
        success: false,
        error: 'La cédula de identidad es obligatoria',
      });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }
    const client = await createClient({
      store_id: storeId,
      name: name != null ? String(name).trim() || null : null,
      phone: phone != null ? String(phone).trim() || null : null,
      email: email != null ? String(email).trim() || null : null,
      address: address != null ? String(address).trim() || null : null,
      identity_document: cedula,
    });
    res.status(201).json({
      success: true,
      client,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Ya existe un cliente con ese teléfono en esta tienda',
      });
    }
    if (error.code === 'VALIDATION') {
      return res.status(400).json({
        success: false,
        error: error.message || 'La cédula de identidad es obligatoria',
      });
    }
    next(error);
  }
}

/**
 * PUT /api/clients/:id
 * Body: { storeId, name?, phone?, email?, address?, identityDocument? }
 */
export async function updateClientHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId, name, phone, email, address, identityDocument } = req.body;
    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }
    const client = await updateClient(id, storeId, {
      name: name !== undefined ? (name == null ? null : String(name).trim()) : undefined,
      phone: phone !== undefined ? (phone == null ? null : String(phone).trim()) : undefined,
      email: email !== undefined ? (email == null ? null : String(email).trim()) : undefined,
      address: address !== undefined ? (address == null ? null : String(address).trim()) : undefined,
      identity_document: identityDocument !== undefined ? (identityDocument == null ? null : String(identityDocument).trim()) : undefined,
    });
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado',
      });
    }
    res.json({
      success: true,
      client,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Ya existe un cliente con ese teléfono en esta tienda',
      });
    }
    next(error);
  }
}

/**
 * DELETE /api/clients/:id?storeId=
 */
export async function deleteClientHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId } = req.query;
    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }
    const deleted = await deleteClient(id, storeId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado',
      });
    }
    res.json({
      success: true,
      message: 'Cliente eliminado',
    });
  } catch (error) {
    next(error);
  }
}
