/**
 * Servicio de cuentas por cobrar (receivables)
 * Permite crear cuentas por cobrar de forma manual o a partir de un pedido (request).
 */

import { query, getClient } from '../config/database.js';
import { updateRequestStatus, getRequestById, decreaseStockForRequest, increaseStockForRequest, updateRequestItemsForReceivable } from './requestService.js';

function toIsoDateString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

/**
 * Formatear fila de BD a objeto para API (camelCase)
 */
function formatReceivable(row) {
  if (!row) return null;
  const itemsCount =
    row.items_count != null && !Number.isNaN(parseInt(row.items_count, 10)) ? parseInt(row.items_count, 10) : null;
  const productNames =
    typeof row.product_names === 'string' && row.product_names.trim().length > 0 ? row.product_names.trim() : null;
  return {
    id: row.id,
    storeId: row.store_id,
    receivableNumber: row.receivable_number,
    createdBy: row.created_by,
    updatedBy: row.updated_by || null,
    createdByName: row.created_by_name || null,
    updatedByName: row.updated_by_name || null,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    description: row.description,
    amount: parseFloat(row.amount),
    currency: row.currency || 'USD',
    status: row.status,
    requestId: row.request_id,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storeName: row.store_name,
    invoiceNumber: row.invoice_number || null,
    dueDate: toIsoDateString(row.due_date),
    itemsCount,
    orderNumber: row.order_number != null ? parseInt(row.order_number, 10) : null,
    productNames,
  };
}

/**
 * Crear una cuenta por cobrar (manual)
 * @param {Object} data - customerName, customerPhone, description, amount, currency?, storeId, createdBy, initialPayment? { amount, notes? }
 */
export async function createReceivable(data) {
  const {
    storeId,
    createdBy,
    customerName,
    customerPhone,
    description,
    amount,
    currency = 'USD',
    requestId = null,
    initialPayment = null,
    invoiceNumber = null,
    dueDate = null,
  } = data;

  const amountNum = parseFloat(amount);
  if (Number.isNaN(amountNum) || amountNum < 0) {
    throw new Error('El monto debe ser un número válido mayor o igual a 0');
  }

  const client = await getClient();
  let row;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [storeId]);
    const nextRes = await client.query(
      'SELECT COALESCE(MAX(receivable_number), 0) + 1 AS next FROM receivables WHERE store_id = $1',
      [storeId]
    );
    const receivableNumber = nextRes.rows[0].next;

    const result = await client.query(
      `INSERT INTO receivables (
        store_id, created_by, customer_name, customer_phone, description,
        amount, currency, status, request_id, receivable_number, invoice_number, due_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11::date)
      RETURNING id, store_id, receivable_number, created_by, customer_name, customer_phone, description,
        amount, currency, status, request_id, paid_at, created_at, updated_at, invoice_number, due_date`,
      [
        storeId,
        createdBy,
        customerName || null,
        customerPhone || null,
        description || null,
        amountNum,
        currency || 'USD',
        requestId || null,
        receivableNumber,
        invoiceNumber || null,
        dueDate ? toIsoDateString(dueDate) : null,
      ]
    );
    row = result.rows[0];
    await client.query(
      `INSERT INTO receivables_logs (receivable_id, user_id, action, details) VALUES ($1, $2, 'created', $3::jsonb)`,
      [row.id, createdBy, JSON.stringify({ amount: amountNum, currency: currency || 'USD', customerName: customerName || null, fromRequest: !!requestId })]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const receivableId = row.id;

  // Stock: si la cuenta se crea desde un pedido, el stock se descuenta UNA SOLA VEZ aquí.
  // Al marcar después la cuenta como cobrada, updateRequestStatus(completed) no vuelve a descontar.
  if (requestId) {
    try {
      await decreaseStockForRequest(requestId, storeId);
    } catch (err) {
      console.error('Error descontando stock al crear cuenta por cobrar:', err);
      // No fallar la creación del receivable; el stock se puede ajustar manualmente
    }
  }

  let initialPaymentId = null;
  if (initialPayment && initialPayment.amount != null && initialPayment.amount !== '') {
    const abonoNum = parseFloat(initialPayment.amount);
    if (!Number.isNaN(abonoNum) && abonoNum > 0) {
      const payResult = await query(
        `INSERT INTO receivable_payments (receivable_id, amount, currency, notes, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          receivableId,
          abonoNum,
          currency || 'USD',
          (initialPayment.notes && String(initialPayment.notes).trim()) || null,
          createdBy,
        ]
      );
      initialPaymentId = payResult.rows[0]?.id || null;
      const sumResult = await query(
        `SELECT COALESCE(SUM(amount), 0)::numeric as total FROM receivable_payments WHERE receivable_id = $1`,
        [receivableId]
      );
      const totalPaid = parseFloat(sumResult.rows[0]?.total || 0);
      if (totalPaid >= amountNum) {
        await query(
          `UPDATE receivables SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_by = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND store_id = $3`,
          [createdBy, receivableId, storeId]
        );
        await query(
          `INSERT INTO receivables_logs (receivable_id, user_id, action, details) VALUES ($1, $2, 'paid_initial', $3::jsonb)`,
          [receivableId, createdBy, JSON.stringify({ amount: abonoNum, currency: currency || 'USD' })]
        );
        row.status = 'paid';
        row.paid_at = new Date();
        if (row.request_id) {
          await updateRequestStatus(row.request_id, storeId, 'completed');
        }
      }
    }
  }

  const storeResult = await query('SELECT name FROM stores WHERE id = $1', [storeId]);
  if (storeResult.rows[0]) row.store_name = storeResult.rows[0].name;
  return { receivable: formatReceivable(row), initialPaymentId };
}

/**
 * Crear una cuenta por cobrar a partir de un pedido (request)
 * Toma datos del pedido: customer_name, customer_phone, total, currency; description puede ser el resumen del pedido.
 */
export async function createReceivableFromRequest(requestId, storeId, createdBy, options = {}) {
  const req = await query(
    `SELECT id, store_id, customer_name, customer_phone, customer_email, items, custom_message, total, currency
     FROM requests WHERE id = $1 AND store_id = $2`,
    [requestId, storeId]
  );

  if (req.rows.length === 0) {
    throw new Error('Pedido no encontrado o no pertenece a esta tienda');
  }

  const r = req.rows[0];
  const totalNum = parseFloat(r.total);
  const description =
    options.description ||
    (r.custom_message && r.custom_message.trim() ? r.custom_message.trim() : null) ||
    `Cuenta por cobrar generada desde pedido #${r.id.slice(0, 8)}`;

  const customerName =
    options.customerName !== undefined
      ? (options.customerName && String(options.customerName).trim()) || null
      : (r.customer_name || 'Cliente');
  const customerPhone =
    options.customerPhone !== undefined
      ? (options.customerPhone && String(options.customerPhone).trim()) || null
      : (r.customer_phone || null);

  // Monto: si se pasa amount en options se usa (permite ajustar sin modificar el pedido); si no, el total del pedido
  const amountToUse =
    options.amount !== undefined && options.amount !== null && !Number.isNaN(Number(options.amount))
      ? parseFloat(options.amount)
      : totalNum;
  if (amountToUse < 0) {
    throw new Error('El monto debe ser mayor o igual a 0');
  }

  return createReceivable({
    storeId,
    createdBy,
    customerName: customerName || 'Cliente',
    customerPhone,
    description,
    amount: amountToUse,
    currency: r.currency || 'USD',
    requestId: r.id,
    initialPayment: options.initialPayment,
    invoiceNumber: options.invoiceNumber ?? null,
    dueDate: options.dueDate ?? null,
  });
}

/**
 * Obtener el total pendiente por cobrar por tienda (solo cuentas con status = 'pending').
 * Por cada cuenta pendiente se resta el total ya abonado.
 * @param {string} storeId - UUID de la tienda
 * @returns {Promise<{ byCurrency: Record<string, number> }>}
 */
export async function getPendingTotalByStore(storeId) {
  const result = await query(
    `SELECT r.currency,
       SUM(r.amount - COALESCE((
         SELECT SUM(rp.amount)::numeric FROM receivable_payments rp WHERE rp.receivable_id = r.id
       ), 0)) AS total
     FROM receivables r
     WHERE r.store_id = $1 AND r.status = 'pending'
     GROUP BY r.currency`,
    [storeId]
  );
  const byCurrency = {};
  for (const row of result.rows) {
    const currency = row.currency || 'USD';
    const value = parseFloat(row.total);
    if (!Number.isNaN(value) && value > 0) {
      byCurrency[currency] = value;
    }
  }
  return { byCurrency };
}

/**
 * Obtener cuentas por cobrar de una tienda
 * @param {Object} options - status?, limit?, offset?, dateFrom? (YYYY-MM-DD), dateTo? (YYYY-MM-DD, inclusive)
 */
export async function getReceivablesByStore(storeId, options = {}) {
  const { status, limit, offset, dateFrom, dateTo, search, invoiceNumber, source } = options;

  let whereClause = 'WHERE r.store_id = $1';
  const params = [storeId];
  let paramIdx = 2;

  const searchTerm = typeof search === 'string' ? search.trim() : '';
  if (searchTerm) {
    const likeParam = `%${searchTerm}%`;
    whereClause += ` AND (
      r.customer_name ILIKE $${paramIdx}
      OR r.customer_phone ILIKE $${paramIdx}
      OR r.receivable_number::text ILIKE $${paramIdx}
      OR EXISTS (
        SELECT 1
        FROM requests req
        WHERE req.id = r.request_id
          AND req.store_id = r.store_id
          AND jsonb_typeof(req.items) = 'array'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(req.items) AS elem
            WHERE
              elem->>'productName' ILIKE $${paramIdx}
              OR EXISTS (
                SELECT 1
                FROM products p
                WHERE p.id = (elem->>'productId')::uuid
                  AND p.store_id = r.store_id
                  AND (p.name ILIKE $${paramIdx} OR p.sku ILIKE $${paramIdx})
              )
          )
      )
    )`;
    params.push(likeParam);
    paramIdx++;
  }

  if (invoiceNumber && typeof invoiceNumber === 'string' && invoiceNumber.trim() !== '') {
    whereClause += ` AND r.invoice_number ILIKE $${paramIdx}`;
    params.push(`%${invoiceNumber.trim()}%`);
    paramIdx++;
  }

  if (source === 'manual') {
    whereClause += ' AND r.request_id IS NULL';
  } else if (source === 'request') {
    whereClause += ' AND r.request_id IS NOT NULL';
  }

  if (status) {
    whereClause += ` AND r.status = $${paramIdx}`;
    params.push(status);
    paramIdx++;
  }

  if (dateFrom) {
    whereClause += ` AND r.created_at >= $${paramIdx}::date`;
    params.push(dateFrom);
    paramIdx++;
  }
  if (dateTo) {
    whereClause += ` AND r.created_at < ($${paramIdx}::date + interval '1 day')`;
    params.push(dateTo);
    paramIdx++;
  }

  const countResult = await query(
    `SELECT COUNT(*)::int as total FROM receivables r ${whereClause}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;

  const sumResult = await query(
    `SELECT r.currency, SUM(r.amount)::numeric as total_amount FROM receivables r ${whereClause} GROUP BY r.currency`,
    params
  );
  const totalAmountByCurrency = {};
  for (const row of sumResult.rows) {
    const currency = row.currency || 'USD';
    totalAmountByCurrency[currency] = parseFloat(row.total_amount) || 0;
  }

  let sql = `
    SELECT r.id, r.store_id, r.receivable_number, r.created_by, r.updated_by, r.customer_name, r.customer_phone, r.description,
      r.amount, r.currency, r.status, r.request_id, r.paid_at, r.created_at, r.updated_at, r.invoice_number, r.due_date,
      s.name as store_name,
      u_created.name as created_by_name, u_updated.name as updated_by_name,
      (SELECT COALESCE(jsonb_array_length(req.items), 0)::int FROM requests req WHERE req.id = r.request_id) AS items_count,
      (SELECT req.order_number FROM requests req WHERE req.id = r.request_id) AS order_number,
      (
        SELECT STRING_AGG(DISTINCT name, ', ' ORDER BY name)
        FROM (
          SELECT TRIM(SUBSTRING(elem->>'productName' FOR 25)) AS name
          FROM requests req,
               LATERAL jsonb_array_elements(req.items) AS elem
          WHERE req.id = r.request_id
            AND req.store_id = r.store_id
            AND jsonb_typeof(req.items) = 'array'
            AND COALESCE(TRIM(elem->>'productName'), '') <> ''
          LIMIT 5
        ) AS names
      ) AS product_names,
      COALESCE((SELECT SUM(rp.amount)::numeric FROM receivable_payments rp WHERE rp.receivable_id = r.id), 0)::float AS total_paid
    FROM receivables r
    LEFT JOIN stores s ON s.id = r.store_id
    LEFT JOIN users u_created ON u_created.id = r.created_by
    LEFT JOIN users u_updated ON u_updated.id = r.updated_by
    ${whereClause}
    ORDER BY r.created_at DESC
  `;
  if (limit) {
    sql += ` LIMIT $${paramIdx}`;
    params.push(limit);
    paramIdx++;
    if (offset) {
      sql += ` OFFSET $${paramIdx}`;
      params.push(offset);
    }
  }

  const result = await query(sql, params);
  return {
    receivables: result.rows.map((row) => ({
      ...formatReceivable(row),
      totalPaid: parseFloat(row.total_paid) || 0,
    })),
    total,
    totalAmountByCurrency,
  };
}

/**
 * Obtener cuentas por cobrar de una tienda con total pagado por cada una (para reportes).
 * @param {string} storeId - UUID de la tienda
 * @returns {Promise<Array<{...receivable, totalPaid: number}>>}
 */
export async function getReceivablesByStoreWithPayments(storeId) {
  const result = await query(
    `SELECT r.id, r.store_id, r.receivable_number, r.created_by, r.updated_by, r.customer_name, r.customer_phone, r.description,
      r.amount, r.currency, r.status, r.request_id, r.paid_at, r.created_at, r.updated_at, r.invoice_number, r.due_date,
      s.name as store_name,
      u_created.name as created_by_name, u_updated.name as updated_by_name,
      COALESCE((
        SELECT SUM(rp.amount)::numeric FROM receivable_payments rp WHERE rp.receivable_id = r.id
      ), 0)::float as total_paid
    FROM receivables r
    LEFT JOIN stores s ON s.id = r.store_id
    LEFT JOIN users u_created ON u_created.id = r.created_by
    LEFT JOIN users u_updated ON u_updated.id = r.updated_by
    WHERE r.store_id = $1
    ORDER BY r.created_at DESC`,
    [storeId]
  );
  return result.rows.map((row) => ({
    ...formatReceivable(row),
    totalPaid: parseFloat(row.total_paid) || 0,
  }));
}

/**
 * Obtener una cuenta por cobrar por ID (y store para permisos)
 */
export async function getReceivableById(receivableId, storeId) {
  const result = await query(
    `SELECT r.id, r.store_id, r.receivable_number, r.created_by, r.updated_by, r.customer_name, r.customer_phone, r.description,
      r.amount, r.currency, r.status, r.request_id, r.paid_at, r.created_at, r.updated_at, r.invoice_number, r.due_date,
      s.name as store_name,
      u_created.name as created_by_name, u_updated.name as updated_by_name
     FROM receivables r
     LEFT JOIN stores s ON s.id = r.store_id
     LEFT JOIN users u_created ON u_created.id = r.created_by
     LEFT JOIN users u_updated ON u_updated.id = r.updated_by
     WHERE r.id = $1 AND r.store_id = $2`,
    [receivableId, storeId]
  );

  if (result.rows.length === 0) return null;
  return formatReceivable(result.rows[0]);
}

/**
 * Obtener cuentas por cobrar por IDs y tienda (para bulk update).
 * @param {string[]} ids - Array de UUIDs
 * @param {string} storeId - ID de la tienda
 * @returns {Promise<Array>} Array de receivables formateados
 */
export async function getReceivablesByIds(ids, storeId) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const validIds = ids.filter((id) => typeof id === 'string' && id.trim());
  if (validIds.length === 0) return [];
  const result = await query(
    `SELECT r.id, r.store_id, r.receivable_number, r.created_by, r.updated_by, r.customer_name, r.customer_phone, r.description,
      r.amount, r.currency, r.status, r.request_id, r.paid_at, r.created_at, r.updated_at, r.invoice_number, r.due_date,
      s.name as store_name,
      u_created.name as created_by_name, u_updated.name as updated_by_name
     FROM receivables r
     LEFT JOIN stores s ON s.id = r.store_id
     LEFT JOIN users u_created ON u_created.id = r.created_by
     LEFT JOIN users u_updated ON u_updated.id = r.updated_by
     WHERE r.id = ANY($1::uuid[]) AND r.store_id = $2`,
    [validIds, storeId]
  );
  return result.rows.map(formatReceivable);
}

/**
 * Obtener una cuenta por cobrar por tienda y número (para webhook).
 * @param {string} storeId - ID de la tienda
 * @param {number} receivableNumber - receivable_number
 * @returns {Promise<Object|null>} Receivable formateado o null
 */
export async function getReceivableByStoreAndReceivableNumber(storeId, receivableNumber) {
  const num = parseInt(receivableNumber, 10);
  if (Number.isNaN(num) || num < 1) return null;
  const result = await query(
    `SELECT r.id, r.store_id, r.receivable_number, r.created_by, r.updated_by, r.customer_name, r.customer_phone, r.description,
      r.amount, r.currency, r.status, r.request_id, r.paid_at, r.created_at, r.updated_at, r.invoice_number, r.due_date,
      s.name as store_name,
      u_created.name as created_by_name, u_updated.name as updated_by_name
     FROM receivables r
     LEFT JOIN stores s ON s.id = r.store_id
     LEFT JOIN users u_created ON u_created.id = r.created_by
     LEFT JOIN users u_updated ON u_updated.id = r.updated_by
     WHERE r.store_id = $1 AND r.receivable_number = $2`,
    [storeId, num]
  );
  if (result.rows.length === 0) return null;
  return formatReceivable(result.rows[0]);
}

/**
 * Obtener cuentas pendientes por teléfono de cliente (para webhook WhatsApp).
 * Compara customer_phone normalizado (solo dígitos).
 * @param {string} phone - Teléfono del cliente (ej. wa_id de WhatsApp)
 * @returns {Promise<Array<{ storeId: string, storeName: string, pendingByCurrency: Record<string, number> }>>}
 */
export async function getPendingReceivablesByCustomerPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return [];

  const result = await query(
    `SELECT r.store_id, s.name as store_name, r.currency,
       (r.amount - COALESCE((
         SELECT SUM(rp.amount)::numeric FROM receivable_payments rp WHERE rp.receivable_id = r.id
       ), 0))::float as balance
     FROM receivables r
     LEFT JOIN stores s ON s.id = r.store_id
     WHERE r.status = 'pending'
       AND REGEXP_REPLACE(COALESCE(r.customer_phone, ''), '[^0-9]', '', 'g') = $1`,
    [digits]
  );

  const byStore = new Map();
  for (const row of result.rows) {
    const balance = parseFloat(row.balance);
    if (Number.isNaN(balance) || balance <= 0) continue;
    const storeId = row.store_id;
    const storeName = row.store_name || 'Tienda';
    const currency = row.currency || 'USD';
    if (!byStore.has(storeId)) {
      byStore.set(storeId, { storeId, storeName, pendingByCurrency: {} });
    }
    const entry = byStore.get(storeId);
    entry.pendingByCurrency[currency] = (entry.pendingByCurrency[currency] || 0) + balance;
  }
  return Array.from(byStore.values());
}

/**
 * Actualizar los productos de una cuenta por cobrar creada desde un pedido.
 * Restaura stock de los productos viejos y descuenta el de los nuevos.
 * Opcionalmente actualiza el monto de la cuenta al nuevo total.
 * @param {string} receivableId - ID de la cuenta por cobrar
 * @param {string} storeId - ID de la tienda
 * @param {Array} newItems - Nuevos ítems (productId, quantity, selectedVariants, productName, basePrice, totalPrice, etc.)
 * @param {number} newTotal - Nuevo total (usado para el pedido y opcionalmente para receivable.amount)
 * @param {Object} options - { updateAmount?: boolean, updatedByUserId?: string }
 * @returns {Promise<{ receivable: Object, request: Object }|null>}
 */
export async function updateReceivableItems(receivableId, storeId, newItems, newTotal, options = {}) {
  const receivable = await getReceivableById(receivableId, storeId);
  if (!receivable) return null;
  if (!receivable.requestId) {
    throw new Error('Solo se pueden cambiar productos en una cuenta por cobrar creada desde un pedido');
  }

  const requestRow = await updateRequestItemsForReceivable(receivable.requestId, storeId, newItems, newTotal);
  if (!requestRow) return null;

  const updateAmount = options.updateAmount !== false;
  const updatedByUserId = options.updatedByUserId || null;
  if (updateAmount) {
    if (updatedByUserId) {
      await query(
        `UPDATE receivables SET amount = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND store_id = $4`,
        [parseFloat(newTotal), updatedByUserId, receivableId, storeId]
      );
      await query(
        `INSERT INTO receivables_logs (receivable_id, user_id, action, details) VALUES ($1, $2, 'items_updated', $3::jsonb)`,
        [receivableId, updatedByUserId, JSON.stringify({ newTotal, itemsCount: (newItems || []).length })]
      );
    } else {
      await query(
        `UPDATE receivables SET amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND store_id = $3`,
        [parseFloat(newTotal), receivableId, storeId]
      );
    }
  }

  const updatedReceivable = await getReceivableById(receivableId, storeId);
  return {
    receivable: updatedReceivable,
    request: requestRow,
  };
}

/**
 * Reabrir una cuenta por cobrar cobrada (volver a pendiente). Aplica a manuales y a cuentas desde pedido.
 * Permite corregir abonos si se equivocaron al registrar el monto.
 * Si la cuenta viene de un pedido, el pedido vuelve a estado 'pending'.
 * @param {string} receivableId - ID de la cuenta
 * @param {string} storeId - ID de la tienda
 * @param {string} updatedByUserId - Usuario que reabre (para trazabilidad)
 * @returns {Promise<Object|null>} Cuenta actualizada o null
 */
export async function reopenReceivable(receivableId, storeId, updatedByUserId) {
  const row = await getReceivableById(receivableId, storeId);
  if (!row) return null;
  if (row.status !== 'paid') {
    throw new Error('Solo se puede reabrir una cuenta que esté marcada como cobrada.');
  }

  await query(
    `UPDATE receivables SET status = 'pending', paid_at = NULL, updated_by = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND store_id = $3`,
    [updatedByUserId, receivableId, storeId]
  );
  await query(
    `INSERT INTO receivables_logs (receivable_id, user_id, action, details) VALUES ($1, $2, 'reopened', '{}'::jsonb)`,
    [receivableId, updatedByUserId]
  );

  if (row.requestId) {
    try {
      await updateRequestStatus(row.requestId, storeId, 'pending');
    } catch (err) {
      console.error('Error al revertir estado del pedido al reabrir cuenta:', err);
    }
  }

  const result = await query(
    `SELECT r.id, r.store_id, r.receivable_number, r.created_by, r.updated_by, r.customer_name, r.customer_phone, r.description,
      r.amount, r.currency, r.status, r.request_id, r.paid_at, r.created_at, r.updated_at, r.invoice_number, r.due_date,
      s.name as store_name,
      u_created.name as created_by_name, u_updated.name as updated_by_name
     FROM receivables r
     LEFT JOIN stores s ON s.id = r.store_id
     LEFT JOIN users u_created ON u_created.id = r.created_by
     LEFT JOIN users u_updated ON u_updated.id = r.updated_by
     WHERE r.id = $1 AND r.store_id = $2`,
    [receivableId, storeId]
  );
  if (result.rows.length === 0) return null;
  return formatReceivable(result.rows[0]);
}

/**
 * Actualizar una cuenta por cobrar (editar campos o marcar como cobrada/cancelada).
 * - Marcar cobrada + tiene pedido vinculado → se marca el pedido completado; stock ya fue descontado al crear la cuenta.
 * - Cancelar cuenta vinculada a pedido → se restaura el stock del pedido.
 * @param {string} [updatedByUserId] - Usuario que realiza la actualización (para trazabilidad)
 */
export async function updateReceivable(receivableId, storeId, updates, updatedByUserId = null) {
  const allowed = ['customerName', 'customerPhone', 'description', 'amount', 'currency', 'status', 'dueDate'];
  const dbFields = {
    customerName: 'customer_name',
    customerPhone: 'customer_phone',
    description: 'description',
    amount: 'amount',
    currency: 'currency',
    status: 'status',
    dueDate: 'due_date',
  };

  // Obtener estado anterior para logs y para restaurar stock al cancelar
  let previousReceivable = null;
  if (updatedByUserId && (updates.status !== undefined || Object.keys(updates).some((k) => ['customerName', 'customerPhone', 'description', 'amount', 'currency'].includes(k)))) {
    previousReceivable = await getReceivableById(receivableId, storeId);
  }
  if (!previousReceivable && updates.status === 'cancelled') {
    previousReceivable = await getReceivableById(receivableId, storeId);
  }

  const setClauses = [];
  const values = [];
  let paramIdx = 1;

  if (updatedByUserId) {
    setClauses.push(`updated_by = $${paramIdx}`);
    values.push(updatedByUserId);
    paramIdx++;
  }

  if (updates.status !== undefined) {
    const status = updates.status;
    if (!['pending', 'paid', 'cancelled'].includes(status)) {
      throw new Error('Estado debe ser pending, paid o cancelled');
    }
    setClauses.push(`status = $${paramIdx}`);
    values.push(status);
    paramIdx++;
    if (status === 'paid') {
      setClauses.push(`paid_at = CURRENT_TIMESTAMP`);
    } else if (status !== 'paid') {
      setClauses.push(`paid_at = NULL`);
    }
  }

  if (updates.customerName !== undefined) {
    setClauses.push(`customer_name = $${paramIdx}`);
    values.push(updates.customerName || null);
    paramIdx++;
  }
  if (updates.customerPhone !== undefined) {
    setClauses.push(`customer_phone = $${paramIdx}`);
    values.push(updates.customerPhone || null);
    paramIdx++;
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIdx}`);
    values.push(updates.description || null);
    paramIdx++;
  }
  if (updates.amount !== undefined) {
    const amountNum = parseFloat(updates.amount);
    if (Number.isNaN(amountNum) || amountNum < 0) {
      throw new Error('El monto debe ser un número válido mayor o igual a 0');
    }
    setClauses.push(`amount = $${paramIdx}`);
    values.push(amountNum);
    paramIdx++;
  }
  if (updates.currency !== undefined) {
    setClauses.push(`currency = $${paramIdx}`);
    values.push(updates.currency || 'USD');
    paramIdx++;
  }
  if (updates.dueDate !== undefined) {
    setClauses.push(`due_date = $${paramIdx}`);
    values.push(updates.dueDate || null);
    paramIdx++;
  }

  if (setClauses.length === 0) {
    return getReceivableById(receivableId, storeId);
  }

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(receivableId, storeId);

  const result = await query(
    `UPDATE receivables SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND store_id = $${paramIdx + 1}
     RETURNING id, store_id, receivable_number, created_by, updated_by, customer_name, customer_phone, description,
       amount, currency, status, request_id, paid_at, created_at, updated_at`,
    values
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  if (updatedByUserId) {
    const action = updates.status === 'paid' ? 'status_paid' : updates.status === 'cancelled' ? 'status_cancelled' : 'updated';
    const details =
      action === 'status_paid' || action === 'status_cancelled'
        ? { previousStatus: previousReceivable?.status, newStatus: updates.status }
        : updates;
    await query(
      `INSERT INTO receivables_logs (receivable_id, user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)`,
      [receivableId, updatedByUserId, action, JSON.stringify(details)]
    );
  }

  // Al marcar la cuenta como cobrada: si tiene pedido vinculado, marcar el pedido como completado.
  // El stock ya fue descontado UNA VEZ al crear la cuenta desde el pedido; updateRequestStatus
  // no vuelve a descontar porque detecta que existe una receivable para ese request_id.
  if (updates.status === 'paid' && row.request_id) {
    await updateRequestStatus(row.request_id, storeId, 'completed');
  }

  // Al cancelar una cuenta por cobrar vinculada a un pedido, restaurar el stock solo si el pedido no está cancelado
  // (si el usuario ya canceló el pedido, el stock ya se restauró allí; evitar doble restauración)
  if (updates.status === 'cancelled' && previousReceivable?.requestId && previousReceivable?.status !== 'cancelled') {
    const linkedRequest = await getRequestById(previousReceivable.requestId, storeId);
    if (linkedRequest && linkedRequest.status !== 'cancelled') {
      try {
        await increaseStockForRequest(previousReceivable.requestId, storeId);
      } catch (err) {
        console.error('Error restaurando stock al cancelar cuenta por cobrar:', err);
      }
    }
  }

  const storeResult = await query('SELECT name FROM stores WHERE id = $1', [storeId]);
  if (storeResult.rows[0]) row.store_name = storeResult.rows[0].name;
  return formatReceivable(row);
}

/**
 * Formatear fila de pago (abono) a objeto para API
 */
function formatPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    receivableId: row.receivable_id,
    amount: parseFloat(row.amount),
    currency: row.currency || 'USD',
    notes: row.notes,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

/**
 * Obtener abonos de una cuenta por cobrar (verifica que la cuenta pertenezca a la tienda)
 */
export async function getPaymentsByReceivableId(receivableId, storeId) {
  const receivable = await getReceivableById(receivableId, storeId);
  if (!receivable) return null;

  const result = await query(
    `SELECT id, receivable_id, amount, currency, notes, created_at, created_by
     FROM receivable_payments
     WHERE receivable_id = $1
     ORDER BY created_at ASC`,
    [receivableId]
  );

  return {
    receivable,
    payments: result.rows.map(formatPayment),
    totalPaid: result.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0),
  };
}

/**
 * Registrar un abono en una cuenta por cobrar.
 * Si la suma de abonos >= monto de la cuenta, actualiza la cuenta a status 'paid' y paid_at.
 */
export async function createReceivablePayment(receivableId, storeId, data, createdBy = null) {
  const { amount, currency = 'USD', notes } = data;

  const receivable = await getReceivableById(receivableId, storeId);
  if (!receivable) {
    throw new Error('Cuenta por cobrar no encontrada');
  }
  if (receivable.status !== 'pending') {
    throw new Error('Solo se pueden registrar abonos en cuentas pendientes');
  }

  const amountNum = parseFloat(amount);
  if (Number.isNaN(amountNum) || amountNum <= 0) {
    throw new Error('El monto del abono debe ser un número mayor que 0');
  }

  await query(
    `INSERT INTO receivable_payments (receivable_id, amount, currency, notes, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [receivableId, amountNum, currency || receivable.currency, notes?.trim() || null, createdBy]
  );

  if (createdBy) {
    await query(
      `INSERT INTO receivables_logs (receivable_id, user_id, action, details) VALUES ($1, $2, 'payment_added', $3::jsonb)`,
      [receivableId, createdBy, JSON.stringify({ amount: amountNum, currency: currency || receivable.currency })]
    );
  }

  const sumResult = await query(
    `SELECT COALESCE(SUM(amount), 0)::numeric as total FROM receivable_payments WHERE receivable_id = $1`,
    [receivableId]
  );
  const totalPaid = parseFloat(sumResult.rows[0]?.total || 0);
  const receivableAmount = parseFloat(receivable.amount);

  if (totalPaid >= receivableAmount) {
    await query(
      `UPDATE receivables SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_by = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND store_id = $3`,
      [createdBy, receivableId, storeId]
    );
    if (createdBy) {
      await query(
        `INSERT INTO receivables_logs (receivable_id, user_id, action, details) VALUES ($1, $2, 'status_paid', '{}'::jsonb)`,
        [receivableId, createdBy]
      );
    }
    if (receivable.requestId) {
      await updateRequestStatus(receivable.requestId, storeId, 'completed');
    }
  }

  return getPaymentsByReceivableId(receivableId, storeId);
}

/**
 * Eliminar un abono de una cuenta por cobrar. Aplica a manuales y a cuentas desde pedido.
 * Tras eliminar, si el total abonado < monto de la cuenta, se pasa la cuenta a pendiente.
 * Si la cuenta viene de un pedido, el pedido vuelve a estado 'pending'.
 */
export async function deleteReceivablePayment(receivableId, paymentId, storeId, deletedByUserId = null) {
  const receivable = await getReceivableById(receivableId, storeId);
  if (!receivable) return null;

  const checkPayment = await query(
    `SELECT id FROM receivable_payments WHERE id = $1 AND receivable_id = $2`,
    [paymentId, receivableId]
  );
  if (checkPayment.rows.length === 0) {
    return null;
  }

  await query(`DELETE FROM receivable_payments WHERE id = $1 AND receivable_id = $2`, [paymentId, receivableId]);

  if (deletedByUserId) {
    await query(
      `INSERT INTO receivables_logs (receivable_id, user_id, action, details) VALUES ($1, $2, 'payment_deleted', $3::jsonb)`,
      [receivableId, deletedByUserId, JSON.stringify({ paymentId })]
    );
  }

  const sumResult = await query(
    `SELECT COALESCE(SUM(amount), 0)::numeric as total FROM receivable_payments WHERE receivable_id = $1`,
    [receivableId]
  );
  const totalPaid = parseFloat(sumResult.rows[0]?.total || 0);
  const receivableAmount = parseFloat(receivable.amount);

  if (totalPaid < receivableAmount) {
    await query(
      `UPDATE receivables SET status = 'pending', paid_at = NULL, updated_by = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND store_id = $3`,
      [deletedByUserId, receivableId, storeId]
    );
    if (deletedByUserId) {
      await query(
        `INSERT INTO receivables_logs (receivable_id, user_id, action, details) VALUES ($1, $2, 'reopened_after_payment_deleted', '{}'::jsonb)`,
        [receivableId, deletedByUserId]
      );
    }
    if (receivable.requestId) {
      try {
        await updateRequestStatus(receivable.requestId, storeId, 'pending');
      } catch (err) {
        console.error('Error al revertir estado del pedido al eliminar abono:', err);
      }
    }
  }

  return getPaymentsByReceivableId(receivableId, storeId);
}

/**
 * Obtener cuentas pendientes de una tienda con fecha de creación y fecha de último abono (para recordatorios).
 * last_payment_date = MAX(receivable_payments.created_at)::date o created_at de la cuenta si no hay abonos.
 * @param {string} storeId - UUID de la tienda
 * @returns {Promise<Array<{ id, store_id, created_at, last_payment_date }>>}
 */
export async function getPendingReceivablesWithReferenceDates(storeId) {
  const result = await query(
    `SELECT r.id, r.store_id, r.created_at,
      COALESCE(
        (SELECT MAX(rp.created_at)::date FROM receivable_payments rp WHERE rp.receivable_id = r.id),
        r.created_at::date
      ) AS last_payment_date
     FROM receivables r
     WHERE r.store_id = $1 AND r.status = 'pending'
     ORDER BY r.created_at ASC`,
    [storeId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    store_id: row.store_id,
    created_at: row.created_at,
    last_payment_date: row.last_payment_date,
  }));
}

/**
 * Insertar un log de actividad en una cuenta por cobrar.
 * @param {string} receivableId
 * @param {string} userId
 * @param {string} action - ej: 'reminder_sent', 'created', 'payment_added'
 * @param {Object} [details={}]
 */
export async function insertReceivableLog(receivableId, userId, action, details = {}) {
  await query(
    `INSERT INTO receivables_logs (receivable_id, user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)`,
    [receivableId, userId, action, JSON.stringify(details)]
  );
}

/**
 * Obtener logs de una cuenta por cobrar (trazabilidad)
 */
export async function getReceivablesLogs(receivableId, storeId) {
  const receivable = await getReceivableById(receivableId, storeId);
  if (!receivable) return null;
  const result = await query(
    `SELECT rl.id, rl.receivable_id, rl.user_id, rl.action, rl.details, rl.created_at, u.name as user_name, u.email as user_email
     FROM receivables_logs rl
     INNER JOIN users u ON u.id = rl.user_id
     WHERE rl.receivable_id = $1
     ORDER BY rl.created_at DESC`,
    [receivableId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    receivableId: r.receivable_id,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    action: r.action,
    details: r.details || {},
    createdAt: r.created_at,
  }));
}
