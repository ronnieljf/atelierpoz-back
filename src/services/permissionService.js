/**
 * Servicio de permisos por tienda.
 * Los creadores de tienda tienen todos los permisos implícitamente.
 */

import { query, getClient } from '../config/database.js';
import { isStoreCreator } from './storeService.js';

/**
 * Obtener todos los permisos disponibles (catálogo)
 * @returns {Promise<Array<{ id: string, code: string, name: string, module: string }>>}
 */
export async function getAllPermissions() {
  const result = await query(
    'SELECT id, code, name, module FROM permissions ORDER BY module, code'
  );
  return result.rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    module: r.module,
  }));
}

/**
 * Obtener los códigos de permiso que tiene un usuario en una tienda.
 * Si es creador, no miramos store_user_permissions (el frontend/API debe tratarlo como "todos").
 * @param {string} storeId - ID de la tienda
 * @param {string} userId - ID del usuario
 * @returns {Promise<string[]>} Lista de códigos (ej. ['products.view', 'sales.create'])
 */
export async function getUserPermissionCodesForStore(storeId, userId) {
  const creator = await isStoreCreator(storeId, userId);
  if (creator) {
    const all = await query('SELECT code FROM permissions ORDER BY code');
    return all.rows.map((r) => r.code);
  }
  const result = await query(
    `SELECT p.code
     FROM store_user_permissions sup
     INNER JOIN permissions p ON p.id = sup.permission_id
     WHERE sup.store_id = $1 AND sup.user_id = $2`,
    [storeId, userId]
  );
  return result.rows.map((r) => r.code);
}

/**
 * Verificar si un usuario tiene un permiso en una tienda.
 * El creador de la tienda tiene todos los permisos.
 * @param {string} storeId - ID de la tienda
 * @param {string} userId - ID del usuario
 * @param {string} permissionCode - Código del permiso (ej. 'products.edit')
 * @returns {Promise<boolean>}
 */
export async function hasPermission(storeId, userId, permissionCode) {
  const creator = await isStoreCreator(storeId, userId);
  if (creator) return true;

  const result = await query(
    `SELECT 1
     FROM store_user_permissions sup
     INNER JOIN permissions p ON p.id = sup.permission_id AND p.code = $3
     WHERE sup.store_id = $1 AND sup.user_id = $2
     LIMIT 1`,
    [storeId, userId, permissionCode]
  );
  return result.rows.length > 0;
}

/**
 * Verificar si el usuario tiene acceso a la tienda (está en store_users).
 * Útil antes de comprobar permisos específicos.
 */
export async function userHasAccessToStore(storeId, userId) {
  const result = await query(
    'SELECT 1 FROM store_users WHERE store_id = $1 AND user_id = $2 LIMIT 1',
    [storeId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Asignar todos los permisos a un usuario en una tienda.
 * Útil al agregar un usuario como creador (todos los permisos).
 * @param {string} storeId - ID de la tienda
 * @param {string} userId - ID del usuario
 */
export async function assignAllPermissionsToUser(storeId, userId) {
  const client = await getClient();
  try {
    const perms = await client.query('SELECT id FROM permissions ORDER BY code');
    if (perms.rows.length === 0) return;
    await client.query('BEGIN');
    for (const row of perms.rows) {
      await client.query(
        `INSERT INTO store_user_permissions (store_id, user_id, permission_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (store_id, user_id, permission_id) DO NOTHING`,
        [storeId, userId, row.id]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Asignar permisos a un usuario en una tienda.
 * Reemplaza todos los permisos previos del usuario en esa tienda.
 * Solo debe llamarse si el solicitante es creador (validado en controlador).
 * @param {string} storeId - ID de la tienda
 * @param {string} userId - ID del usuario (no puede ser el único creador; no se asignan permisos al creador)
 * @param {string[]} permissionCodes - Lista de códigos (ej. ['products.view', 'sales.create'])
 */
export async function setUserPermissions(storeId, userId, permissionCodes) {
  const codes = Array.isArray(permissionCodes) ? permissionCodes : [];
  const uniqueCodes = [...new Set(codes)];

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM store_user_permissions WHERE store_id = $1 AND user_id = $2',
      [storeId, userId]
    );

    if (uniqueCodes.length > 0) {
      const permRows = await client.query(
        'SELECT id, code FROM permissions WHERE code = ANY($1::varchar[])',
        [uniqueCodes]
      );
      const codeToId = Object.fromEntries(permRows.rows.map((r) => [r.code, r.id]));
      for (const code of uniqueCodes) {
        const permId = codeToId[code];
        if (!permId) continue;
        await client.query(
          `INSERT INTO store_user_permissions (store_id, user_id, permission_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (store_id, user_id, permission_id) DO NOTHING`,
          [storeId, userId, permId]
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
