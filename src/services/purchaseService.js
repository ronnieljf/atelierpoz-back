/**
 * Servicio de compras al contado (purchases) — espejo de saleService
 */

import { query, getClient } from '../config/database.js';

function formatPurchase(row) {
  if (!row) return null;
  let items = row.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  if (!Array.isArray(items)) items = [];

  return {
    id: row.id,
    storeId: row.store_id,
    vendorId: row.vendor_id || null,
    vendorName: row.vendor_name || null,
    vendorPhone: row.vendor_phone || null,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    purchaseNumber: parseInt(row.purchase_number, 10),
    categoryId: row.category_id || null,
    categoryName: row.category_name || null,
    description: row.description || null,
    items,
    total: parseFloat(row.total),
    currency: row.currency || 'USD',
    status: row.status,
    paymentMethod: row.payment_method || null,
    notes: row.notes || null,
    paidAt: row.paid_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Crear compra al contado
 */
export async function createPurchase(data) {
  const {
    storeId, vendorId, createdBy, categoryId, description,
    items, total, currency = 'USD', paymentMethod, notes,
  } = data;

  const totalNum = parseFloat(total);
  if (Number.isNaN(totalNum) || totalNum < 0) throw new Error('Total inválido');

  const client = await getClient();
  let row;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text || \'purchase\'))', [storeId]);

    const nextRes = await client.query(
      'SELECT COALESCE(MAX(purchase_number), 0) + 1 AS next FROM purchases WHERE store_id = $1',
      [storeId]
    );
    const purchaseNumber = nextRes.rows[0].next;

    const result = await client.query(
      `INSERT INTO purchases (
        store_id, vendor_id, created_by, purchase_number, category_id,
        description, items, total, currency, status, payment_method, notes, paid_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', $10, $11, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        storeId,
        vendorId || null,
        createdBy,
        purchaseNumber,
        categoryId || null,
        description?.trim() || null,
        JSON.stringify(items || []),
        totalNum,
        currency || 'USD',
        paymentMethod?.trim() || null,
        notes?.trim() || null,
      ]
    );
    row = result.rows[0];

    await client.query(
      `INSERT INTO purchases_logs (purchase_id, user_id, action, details) VALUES ($1, $2, 'created', '{}'::jsonb)`,
      [row.id, createdBy]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return getPurchaseById(row.id, storeId);
}

/**
 * Listar compras
 */
export async function getPurchasesByStore(storeId, options = {}) {
  const { status, categoryId, vendorId, limit = 50, offset = 0 } = options;
  const conditions = ['p.store_id = $1'];
  const params = [storeId];
  let idx = 2;

  if (status) { conditions.push(`p.status = $${idx}`); params.push(status); idx++; }
  if (categoryId) { conditions.push(`p.category_id = $${idx}`); params.push(categoryId); idx++; }
  if (vendorId) { conditions.push(`p.vendor_id = $${idx}`); params.push(vendorId); idx++; }

  const where = conditions.join(' AND ');
  const countRes = await query(`SELECT COUNT(*) FROM purchases p WHERE ${where}`, params);
  const total = parseInt(countRes.rows[0].count, 10);

  params.push(parseInt(limit, 10) || 50);
  params.push(parseInt(offset, 10) || 0);

  const result = await query(
    `SELECT p.*, uc.name AS created_by_name,
            v.name AS vendor_name, v.phone AS vendor_phone,
            ec.name AS category_name
     FROM purchases p
     LEFT JOIN users uc ON p.created_by = uc.id
     LEFT JOIN vendors v ON p.vendor_id = v.id
     LEFT JOIN expense_categories ec ON p.category_id = ec.id
     WHERE ${where}
     ORDER BY p.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return { purchases: result.rows.map(formatPurchase), total };
}

/**
 * Obtener compra por ID
 */
export async function getPurchaseById(purchaseId, storeId) {
  const result = await query(
    `SELECT p.*, uc.name AS created_by_name,
            v.name AS vendor_name, v.phone AS vendor_phone,
            ec.name AS category_name
     FROM purchases p
     LEFT JOIN users uc ON p.created_by = uc.id
     LEFT JOIN vendors v ON p.vendor_id = v.id
     LEFT JOIN expense_categories ec ON p.category_id = ec.id
     WHERE p.id = $1 AND p.store_id = $2`,
    [purchaseId, storeId]
  );
  return formatPurchase(result.rows[0]);
}

/**
 * Cancelar compra
 */
export async function cancelPurchase(purchaseId, storeId, userId) {
  await query(
    `UPDATE purchases SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND store_id = $2`,
    [purchaseId, storeId]
  );
  if (userId) {
    await query(
      `INSERT INTO purchases_logs (purchase_id, user_id, action, details) VALUES ($1, $2, 'cancelled', '{}'::jsonb)`,
      [purchaseId, userId]
    );
  }
  return getPurchaseById(purchaseId, storeId);
}
