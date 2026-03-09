/**
 * Servicio de opciones de pago guardadas por tienda.
 * Permite guardar y listar datos de PagoMovil, transferencia y Binance para reutilizar en recordatorios.
 */

import { query } from '../config/database.js';

const VALID_TYPES = ['pagomovil', 'transferencia', 'binance'];

function formatOption(row) {
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.store_id,
    type: row.type,
    label: row.label || null,
    data: row.data || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Listar opciones de pago de una tienda, agrupadas por tipo
 * @param {string} storeId
 * @returns {Promise<{ pagomovil: Array, transferencia: Array, binance: Array }>}
 */
export async function getPaymentOptionsByStore(storeId) {
  const result = await query(
    `SELECT id, store_id, type, label, data, created_at, updated_at
     FROM store_payment_options
     WHERE store_id = $1
     ORDER BY type, COALESCE(label, '') ASC, created_at ASC`,
    [storeId]
  );

  const byType = { pagomovil: [], transferencia: [], binance: [] };
  for (const row of result.rows) {
    const opt = formatOption(row);
    if (opt && VALID_TYPES.includes(opt.type)) {
      byType[opt.type].push(opt);
    }
  }
  return byType;
}

/**
 * Crear opción de pago
 * @param {Object} data - { storeId, type, data, label? }
 */
export async function createPaymentOption(data) {
  const { storeId, type, data: optData, label } = data;
  if (!VALID_TYPES.includes(type)) {
    throw new Error('Tipo debe ser pagomovil, transferencia o binance');
  }
  if (!optData || typeof optData !== 'string' || !optData.trim()) {
    throw new Error('Los datos son requeridos');
  }

  const result = await query(
    `INSERT INTO store_payment_options (store_id, type, label, data)
     VALUES ($1, $2, $3, $4)
     RETURNING id, store_id, type, label, data, created_at, updated_at`,
    [storeId, type, (label || '').trim() || null, optData.trim()]
  );
  return formatOption(result.rows[0]);
}

/**
 * Actualizar opción de pago
 */
export async function updatePaymentOption(optionId, storeId, updates) {
  const { label, data: optData } = updates;
  const setClauses = [];
  const params = [];
  let idx = 1;
  if (label !== undefined) {
    setClauses.push(`label = $${idx++}`);
    params.push((label || '').trim() || null);
  }
  if (optData !== undefined) {
    if (!optData || typeof optData !== 'string' || !optData.trim()) {
      throw new Error('Los datos no pueden estar vacíos');
    }
    setClauses.push(`data = $${idx++}`);
    params.push(optData.trim());
  }
  if (setClauses.length === 0) return getPaymentOptionById(optionId, storeId);

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(optionId, storeId);

  const result = await query(
    `UPDATE store_payment_options SET ${setClauses.join(', ')}
     WHERE id = $${idx} AND store_id = $${idx + 1}
     RETURNING id, store_id, type, label, data, created_at, updated_at`,
    params
  );
  if (result.rows.length === 0) return null;
  return formatOption(result.rows[0]);
}

/**
 * Obtener una opción por ID
 */
export async function getPaymentOptionById(optionId, storeId) {
  const result = await query(
    `SELECT id, store_id, type, label, data, created_at, updated_at
     FROM store_payment_options
     WHERE id = $1 AND store_id = $2`,
    [optionId, storeId]
  );
  if (result.rows.length === 0) return null;
  return formatOption(result.rows[0]);
}

/**
 * Eliminar opción de pago
 */
export async function deletePaymentOption(optionId, storeId) {
  const result = await query(
    `DELETE FROM store_payment_options WHERE id = $1 AND store_id = $2 RETURNING id`,
    [optionId, storeId]
  );
  return result.rowCount > 0;
}
