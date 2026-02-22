/**
 * Middleware para verificar permisos por tienda.
 * Debe usarse después de authenticateToken.
 */

import { hasPermission } from '../services/permissionService.js';

const PERMISSION_DENIED_MESSAGE = 'No tienes permiso para realizar esta acción';

/**
 * Factory: middleware que exige un permiso antes de continuar.
 * Si el usuario no tiene el permiso en la tienda, responde 403 con mensaje estándar.
 *
 * @param {string} permissionCode - Código del permiso (ej. 'products.edit')
 * @param {(req) => string | undefined} getStoreId - Función que extrae storeId del request (query, body o params)
 * @returns {function} Middleware (req, res, next)
 */
export function requirePermission(permissionCode, getStoreId) {
  return async function checkPermission(req, res, next) {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Autenticación requerida',
      });
    }

    const storeId = typeof getStoreId === 'function' ? getStoreId(req) : getStoreId;
    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    try {
      const allowed = await hasPermission(storeId, req.user.id, permissionCode);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          error: PERMISSION_DENIED_MESSAGE,
          code: 'PERMISSION_DENIED',
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Mensaje estándar para usar en el frontend */
export const PERMISSION_DENIED_ERROR = PERMISSION_DENIED_MESSAGE;

/** Extrae storeId de query o body (uso típico en APIs) */
export const storeIdFromQueryOrBody = (req) => req.query.storeId || req.body?.storeId;

/** Extrae storeId de params.id (ej. /stores/:id) */
export const storeIdFromParamsId = (req) => req.params.id;

/** Extrae storeId de params.storeId (ej. /products/store/:storeId) */
export const storeIdFromParamsStoreId = (req) => req.params.storeId;
