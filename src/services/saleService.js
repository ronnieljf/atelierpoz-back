/**
 * Servicio de ventas (POS - caja rápida)
 * Ventas al contado que se guardan en la tabla sales.
 * Las ventas a cuenta (cuenta por cobrar) usan request + receivable.
 */

import { query, getClient } from '../config/database.js';
import { getPOSProductsByKeys } from './productService.js';

/**
 * Formatear fila de venta para API
 */
function formatSale(row) {
  if (!row) return null;
  const items = row.items && (typeof row.items === 'string' ? JSON.parse(row.items) : row.items);
  return {
    id: row.id,
    storeId: row.store_id,
    clientId: row.client_id,
    createdBy: row.created_by,
    updatedBy: row.updated_by || null,
    createdByName: row.created_by_name || null,
    updatedByName: row.updated_by_name || null,
    saleNumber: row.sale_number,
    items: Array.isArray(items) ? items : [],
    total: parseFloat(row.total),
    currency: row.currency || 'USD',
    status: row.status,
    paidAt: row.paid_at,
    paymentMethod: row.payment_method || null,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    storeName: row.store_name,
  };
}

/**
 * Validar que todos los ítems de la venta tengan stock disponible.
 * Se debe llamar dentro de la transacción (con el lock) antes de insertar la venta.
 * Items: [{ productId, combinationId?, quantity, productName? }]
 * @param {string} storeId - ID de la tienda
 * @param {Array} items - Ítems de la venta
 * @param {Object} client - Cliente de PG (misma transacción)
 * @throws {Error} Si algún producto no existe o no tiene stock suficiente
 */
async function validateSaleItemsStock(storeId, items, client) {
  if (!Array.isArray(items) || items.length === 0) return;

  for (const item of items) {
    const { productId, combinationId, quantity, productName: itemName } = item;
    if (!productId || !quantity || quantity <= 0) continue;

    const res = await client.query(
      'SELECT id, name, stock, combinations FROM products WHERE id = $1 AND store_id = $2',
      [productId, storeId]
    );
    if (res.rows.length === 0) {
      throw new Error(
        itemName ? `"${itemName}" ya no está disponible.` : 'Uno de los productos ya no está disponible. Actualiza el carrito.'
      );
    }

    const product = res.rows[0];
    const displayName = itemName || product.name || 'Producto';
    let combinations = product.combinations;
    if (typeof combinations === 'string') {
      try {
        combinations = JSON.parse(combinations) || [];
      } catch {
        combinations = [];
      }
    }
    if (!Array.isArray(combinations)) combinations = [];

    if (combinationId && combinations.length > 0) {
      const matching = combinations.find((c) => c.id === combinationId);
      if (!matching) {
        throw new Error(`"${displayName}" ya no está disponible. Actualiza el carrito.`);
      }
      const current = typeof matching.stock === 'number' ? matching.stock : 0;
      if (current < quantity) {
        throw new Error(
          `No hay suficiente stock de "${displayName}". Hay ${current}, pediste ${quantity}. Actualiza el carrito.`
        );
      }
      continue;
    }

    const currentStock = typeof product.stock === 'number' ? product.stock : 0;
    if (currentStock < quantity) {
      throw new Error(
        `No hay suficiente stock de "${displayName}". Hay ${currentStock}, pediste ${quantity}. Actualiza el carrito.`
      );
    }
  }
}

/**
 * Descontar stock según items de venta.
 * Items: [{ productId, combinationId?, quantity }]
 */
async function decreaseStockForSaleItems(storeId, items) {
  for (const item of items || []) {
    const { productId, combinationId, quantity } = item;
    if (!productId || !quantity || quantity <= 0) continue;

    const res = await query(
      'SELECT id, stock, combinations FROM products WHERE id = $1 AND store_id = $2',
      [productId, storeId]
    );
    if (res.rows.length === 0) continue;

    const product = res.rows[0];
    let combinations = product.combinations;
    if (typeof combinations === 'string') {
      try {
        combinations = JSON.parse(combinations) || [];
      } catch {
        combinations = [];
      }
    }
    if (!Array.isArray(combinations)) combinations = [];

    if (combinationId && combinations.length > 0) {
      const matching = combinations.find((c) => c.id === combinationId);
      if (matching) {
        const current = typeof matching.stock === 'number' ? matching.stock : 0;
        const newStock = Math.max(0, current - quantity);
        const updated = combinations.map((c) =>
          c.id === combinationId ? { ...c, stock: newStock } : c
        );
        const currentProductStock = typeof product.stock === 'number' ? product.stock : 0;
        const newProductStock = Math.max(0, currentProductStock - quantity);
        await query(
          `UPDATE products SET combinations = $1::jsonb, stock = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND store_id = $4`,
          [JSON.stringify(updated), newProductStock, productId, storeId]
        );
        continue;
      }
    }

    const currentStock = typeof product.stock === 'number' ? product.stock : 0;
    const newStock = Math.max(0, currentStock - quantity);
    await query(
      `UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND store_id = $3`,
      [newStock, productId, storeId]
    );
  }
}

/**
 * Restaurar stock según items de venta (para refund/cancel)
 */
async function increaseStockForSaleItems(storeId, items) {
  for (const item of items || []) {
    const { productId, combinationId, quantity } = item;
    if (!productId || !quantity || quantity <= 0) continue;

    const res = await query(
      'SELECT id, stock, combinations FROM products WHERE id = $1 AND store_id = $2',
      [productId, storeId]
    );
    if (res.rows.length === 0) continue;

    const product = res.rows[0];
    let combinations = product.combinations;
    if (typeof combinations === 'string') {
      try {
        combinations = JSON.parse(combinations) || [];
      } catch {
        combinations = [];
      }
    }
    if (!Array.isArray(combinations)) combinations = [];

    if (combinationId && combinations.length > 0) {
      const matching = combinations.find((c) => c.id === combinationId);
      if (matching) {
        const current = typeof matching.stock === 'number' ? matching.stock : 0;
        const newStock = current + quantity;
        const updated = combinations.map((c) =>
          c.id === combinationId ? { ...c, stock: newStock } : c
        );
        const currentProductStock = typeof product.stock === 'number' ? product.stock : 0;
        const newProductStock = currentProductStock + quantity;
        await query(
          `UPDATE products SET combinations = $1::jsonb, stock = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND store_id = $4`,
          [JSON.stringify(updated), newProductStock, productId, storeId]
        );
        continue;
      }
    }

    const currentStock = typeof product.stock === 'number' ? product.stock : 0;
    const newStock = currentStock + quantity;
    await query(
      `UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND store_id = $3`,
      [newStock, productId, storeId]
    );
  }
}

/**
 * Obtener los N productos más vendidos (por cantidad) para POS.
 * Devuelve en formato POSProduct para búsqueda local rápida en el frontend.
 * @param {string} storeId - ID de la tienda
 * @param {number} [limit=1000] - Máximo de productos/variantes a devolver
 * @returns {Promise<Array>} Array de POSProduct
 */
export async function getTopSoldProductsForPOS(storeId, limit = 1000) {
  const limitNum = Math.min(Math.max(1, parseInt(limit) || 1000), 1000);

  const result = await query(
    `WITH items_unnested AS (
       SELECT
         (elem->>'productId')::uuid AS product_id,
         NULLIF(TRIM(elem->>'combinationId'), '')::text AS combination_id,
         COALESCE((elem->>'quantity')::int, 0) AS qty
       FROM sales s,
            jsonb_array_elements(s.items) AS elem
       WHERE s.store_id = $1 AND s.status = 'completed'
     ),
     aggregated AS (
       SELECT product_id, combination_id, SUM(qty) AS total_qty
       FROM items_unnested
       WHERE product_id IS NOT NULL
       GROUP BY product_id, combination_id
       ORDER BY total_qty DESC
       LIMIT $2
     )
     SELECT product_id, combination_id FROM aggregated`,
    [storeId, limitNum]
  );

  const keys = result.rows.map((r) => ({
    productId: r.product_id,
    combinationId: r.combination_id ?? null,
  }));

  if (keys.length === 0) return [];

  return getPOSProductsByKeys(storeId, keys);
}

/**
 * Crear una venta (al contado)
 * @param {Object} data - { storeId, clientId, createdBy, items, total, currency? }
 * @returns {Promise<Object>}
 */
export async function createSale(data) {
  const { storeId, clientId, createdBy, items, total, currency = 'USD', paymentMethod, notes } = data;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('La venta debe contener al menos un producto');
  }

  const totalNum = parseFloat(total);
  if (Number.isNaN(totalNum) || totalNum < 0) {
    throw new Error('El total debe ser un número válido');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [storeId]);

    await validateSaleItemsStock(storeId, items, client);

    const nextRes = await client.query(
      'SELECT COALESCE(MAX(sale_number), 0) + 1 AS next FROM sales WHERE store_id = $1',
      [storeId]
    );
    const saleNumber = nextRes.rows[0].next;

    const result = await client.query(
      `INSERT INTO sales (store_id, client_id, created_by, sale_number, items, total, currency, status, paid_at, payment_method, notes)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'completed', CURRENT_TIMESTAMP, $8, $9)
       RETURNING id, store_id, client_id, created_by, sale_number, items, total, currency, status, paid_at, payment_method, notes, created_at, updated_at`,
      [storeId, clientId, createdBy, saleNumber, JSON.stringify(items), totalNum, currency, (paymentMethod && String(paymentMethod).trim()) || null, (notes && String(notes).trim()) || null]
    );

    const row = result.rows[0];
    await client.query(
      `INSERT INTO sales_logs (sale_id, user_id, action, details) VALUES ($1, $2, 'created', '{}'::jsonb)`,
      [row.id, createdBy]
    );

    await client.query('COMMIT');

    try {
      await decreaseStockForSaleItems(storeId, items);
    } catch (err) {
      console.error('[saleService] Error descontando stock:', err);
    }

    const sale = await getSaleById(row.id, storeId);
    return sale;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Listar ventas de una tienda
 */
export async function getSalesByStore(storeId, options = {}) {
  const { limit = 20, offset = 0, status, dateFrom, dateTo, search } = options;
  const params = [storeId];
  let paramIdx = 2;

  let where = 'WHERE s.store_id = $1';
  if (status) {
    where += ` AND s.status = $${paramIdx++}`;
    params.push(status);
  }
  if (dateFrom) {
    where += ` AND s.created_at >= $${paramIdx}::date`;
    params.push(dateFrom);
    paramIdx++;
  }
  if (dateTo) {
    where += ` AND s.created_at < ($${paramIdx}::date + interval '1 day')`;
    params.push(dateTo);
    paramIdx++;
  }
  if (search && String(search).trim()) {
    const term = `%${String(search).trim()}%`;
    where += ` AND (c.name ILIKE $${paramIdx} OR c.phone ILIKE $${paramIdx} OR s.sale_number::text ILIKE $${paramIdx})`;
    params.push(term);
    paramIdx++;
  }

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM sales s
     LEFT JOIN clients c ON c.id = s.client_id
     ${where}`,
    params
  );
  const total = countRes.rows[0]?.total ?? 0;

  const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
  const offsetNum = Math.max(0, parseInt(offset) || 0);
  params.push(limitNum, offsetNum);
  const limitParam = paramIdx;
  const offsetParam = paramIdx + 1;

  const result = await query(
    `SELECT s.id, s.store_id, s.client_id, s.created_by, s.updated_by, s.sale_number, s.items, s.total, s.currency,
       s.status, s.paid_at, s.payment_method, s.notes, s.created_at, s.updated_at,
       c.name as client_name, c.phone as client_phone,
       st.name as store_name,
       u_created.name as created_by_name, u_updated.name as updated_by_name
     FROM sales s
     LEFT JOIN clients c ON c.id = s.client_id
     LEFT JOIN stores st ON st.id = s.store_id
     LEFT JOIN users u_created ON u_created.id = s.created_by
     LEFT JOIN users u_updated ON u_updated.id = s.updated_by
     ${where}
     ORDER BY s.created_at DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );

  return {
    sales: result.rows.map(formatSale),
    total,
  };
}

/**
 * Obtener venta por ID
 */
export async function getSaleById(saleId, storeId) {
  const result = await query(
    `SELECT s.id, s.store_id, s.client_id, s.created_by, s.updated_by, s.sale_number, s.items, s.total, s.currency,
       s.status, s.paid_at, s.payment_method, s.notes, s.created_at, s.updated_at,
       c.name as client_name, c.phone as client_phone, c.email as client_email, c.address as client_address,
       st.name as store_name,
       u_created.name as created_by_name, u_updated.name as updated_by_name
     FROM sales s
     LEFT JOIN clients c ON c.id = s.client_id
     LEFT JOIN stores st ON st.id = s.store_id
     LEFT JOIN users u_created ON u_created.id = s.created_by
     LEFT JOIN users u_updated ON u_updated.id = s.updated_by
     WHERE s.id = $1 AND s.store_id = $2`,
    [saleId, storeId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const sale = formatSale(row);
  sale.clientEmail = row.client_email;
  sale.clientAddress = row.client_address;
  return sale;
}

/**
 * Marcar venta como devuelta (refund) - restaura stock
 * @param {string} saleId
 * @param {string} storeId
 * @param {string} userId - Usuario que realiza la devolución (para trazabilidad)
 */
export async function refundSale(saleId, storeId, userId) {
  const sale = await getSaleById(saleId, storeId);
  if (!sale) return null;
  if (sale.status !== 'completed') {
    throw new Error('Solo se pueden devolver ventas completadas');
  }

  await query(
    `UPDATE sales SET status = 'refunded', updated_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND store_id = $3`,
    [userId || null, saleId, storeId]
  );
  if (userId) {
    await query(
      `INSERT INTO sales_logs (sale_id, user_id, action, details) VALUES ($1, $2, 'refunded', '{}'::jsonb)`,
      [saleId, userId]
    );
  }

  try {
    await increaseStockForSaleItems(storeId, sale.items);
  } catch (err) {
    console.error('[saleService] Error restaurando stock en refund:', err);
  }

  return getSaleById(saleId, storeId);
}

/**
 * Cancelar venta - restaura stock
 * @param {string} saleId
 * @param {string} storeId
 * @param {string} userId - Usuario que cancela (para trazabilidad)
 */
export async function cancelSale(saleId, storeId, userId) {
  const sale = await getSaleById(saleId, storeId);
  if (!sale) return null;
  if (sale.status !== 'completed') {
    throw new Error('Solo se pueden cancelar ventas completadas');
  }

  await query(
    `UPDATE sales SET status = 'cancelled', updated_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND store_id = $3`,
    [userId || null, saleId, storeId]
  );
  if (userId) {
    await query(
      `INSERT INTO sales_logs (sale_id, user_id, action, details) VALUES ($1, $2, 'cancelled', '{}'::jsonb)`,
      [saleId, userId]
    );
  }

  try {
    await increaseStockForSaleItems(storeId, sale.items);
  } catch (err) {
    console.error('[saleService] Error restaurando stock en cancelación:', err);
  }

  return getSaleById(saleId, storeId);
}

/**
 * Obtener logs de una venta (trazabilidad)
 */
export async function getSalesLogs(saleId, storeId) {
  const sale = await getSaleById(saleId, storeId);
  if (!sale) return null;
  const result = await query(
    `SELECT sl.id, sl.sale_id, sl.user_id, sl.action, sl.details, sl.created_at, u.name as user_name, u.email as user_email
     FROM sales_logs sl
     INNER JOIN users u ON u.id = sl.user_id
     WHERE sl.sale_id = $1
     ORDER BY sl.created_at DESC`,
    [saleId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    saleId: r.sale_id,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    action: r.action,
    details: r.details || {},
    createdAt: r.created_at,
  }));
}
