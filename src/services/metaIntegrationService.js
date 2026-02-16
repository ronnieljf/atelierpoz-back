/**
 * Servicio para gestionar integraciones de Meta/Instagram en la base de datos
 */

import { query } from '../config/database.js';

/**
 * Obtener integración de Meta para un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object|null>} Integración encontrada o null
 */
export async function getMetaIntegrationByUser(userId) {
  const result = await query(
    `SELECT 
      id,
      user_id,
      page_id,
      page_name,
      instagram_account_id,
      instagram_username,
      access_token,
      token_type,
      expires_at,
      is_long_lived,
      created_at,
      updated_at
    FROM meta_integrations
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    pageId: row.page_id,
    pageName: row.page_name,
    instagramAccountId: row.instagram_account_id,
    instagramUsername: row.instagram_username,
    accessToken: row.access_token,
    tokenType: row.token_type,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    isLongLived: row.is_long_lived,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Guardar o actualizar integración de Meta
 * @param {Object} integrationData - Datos de la integración
 * @param {string} integrationData.userId - ID del usuario
 * @param {string} integrationData.pageId - ID de la página de Facebook
 * @param {string} integrationData.pageName - Nombre de la página
 * @param {string} integrationData.instagramAccountId - ID de la cuenta de Instagram
 * @param {string} integrationData.instagramUsername - Username de Instagram
 * @param {string} integrationData.accessToken - Token de acceso
 * @param {string} integrationData.tokenType - Tipo de token (default: 'bearer')
 * @param {Date} integrationData.expiresAt - Fecha de expiración del token
 * @param {boolean} integrationData.isLongLived - Si es token de larga duración
 * @returns {Promise<Object>} Integración guardada
 */
export async function saveMetaIntegration(integrationData) {
  const {
    userId,
    pageId,
    pageName,
    instagramAccountId,
    instagramUsername,
    accessToken,
    tokenType = 'bearer',
    expiresAt,
    isLongLived = false,
  } = integrationData;

  // Verificar si ya existe una integración para este usuario y página
  const existing = await query(
    'SELECT id FROM meta_integrations WHERE user_id = $1 AND page_id = $2',
    [userId, pageId]
  );

  if (existing.rows.length > 0) {
    // Actualizar integración existente
    const result = await query(
      `UPDATE meta_integrations
      SET 
        page_name = $1,
        instagram_account_id = $2,
        instagram_username = $3,
        access_token = $4,
        token_type = $5,
        expires_at = $6,
        is_long_lived = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $8 AND page_id = $9
      RETURNING 
        id,
        user_id,
        page_id,
        page_name,
        instagram_account_id,
        instagram_username,
        access_token,
        token_type,
        expires_at,
        is_long_lived,
        created_at,
        updated_at`,
      [
        pageName,
        instagramAccountId,
        instagramUsername,
        accessToken,
        tokenType,
        expiresAt ? new Date(expiresAt) : null,
        isLongLived,
        userId,
        pageId,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      pageId: row.page_id,
      pageName: row.page_name,
      instagramAccountId: row.instagram_account_id,
      instagramUsername: row.instagram_username,
      accessToken: row.access_token,
      tokenType: row.token_type,
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      isLongLived: row.is_long_lived,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  } else {
    // Crear nueva integración
    const result = await query(
      `INSERT INTO meta_integrations (
        user_id,
        page_id,
        page_name,
        instagram_account_id,
        instagram_username,
        access_token,
        token_type,
        expires_at,
        is_long_lived
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING 
        id,
        user_id,
        page_id,
        page_name,
        instagram_account_id,
        instagram_username,
        access_token,
        token_type,
        expires_at,
        is_long_lived,
        created_at,
        updated_at`,
      [
        userId,
        pageId,
        pageName,
        instagramAccountId,
        instagramUsername,
        accessToken,
        tokenType,
        expiresAt ? new Date(expiresAt) : null,
        isLongLived,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      pageId: row.page_id,
      pageName: row.page_name,
      instagramAccountId: row.instagram_account_id,
      instagramUsername: row.instagram_username,
      accessToken: row.access_token,
      tokenType: row.token_type,
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      isLongLived: row.is_long_lived,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

/**
 * Eliminar integración de Meta para un usuario
 * @param {string} userId - ID del usuario
 * @param {string} pageId - ID de la página (opcional)
 * @returns {Promise<boolean>} True si se eliminó, false si no existía
 */
export async function deleteMetaIntegration(userId, pageId = null) {
  if (pageId) {
    const result = await query(
      'DELETE FROM meta_integrations WHERE user_id = $1 AND page_id = $2 RETURNING id',
      [userId, pageId]
    );
    return result.rows.length > 0;
  } else {
    const result = await query(
      'DELETE FROM meta_integrations WHERE user_id = $1 RETURNING id',
      [userId]
    );
    return result.rows.length > 0;
  }
}
