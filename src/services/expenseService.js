/**
 * Servicio de gastos / cuentas por pagar (expenses)
 */

import { query, getClient } from '../config/database.js';

function formatExpense(row) {
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.store_id,
    expenseNumber: row.expense_number,
    createdBy: row.created_by,
    updatedBy: row.updated_by || null,
    createdByName: row.created_by_name || null,
    updatedByName: row.updated_by_name || null,
    categoryId: row.category_id || null,
    categoryName: row.category_name || null,
    categoryColor: row.category_color || null,
    vendorId: row.vendor_id || null,
    vendorName: row.v_name || row.vendor_name || null,
    vendorPhone: row.v_phone || row.vendor_phone || null,
    description: row.description || null,
    amount: parseFloat(row.amount),
    currency: row.currency || 'USD',
    status: row.status,
    dueDate: row.due_date || null,
    paidAt: row.paid_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    expenseId: row.expense_id,
    amount: parseFloat(row.amount),
    currency: row.currency || 'USD',
    notes: row.notes || null,
    createdBy: row.created_by || null,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
  };
}

/**
 * Crear gasto / cuenta por pagar
 */
export async function createExpense(data) {
  const {
    storeId,
    createdBy,
    categoryId,
    vendorId,
    vendorName,
    vendorPhone,
    description,
    amount,
    currency = 'USD',
    dueDate,
  } = data;

  const amountNum = parseFloat(amount);
  if (Number.isNaN(amountNum) || amountNum < 0) {
    throw new Error('El monto debe ser un número válido mayor o igual a 0');
  }

  const client = await getClient();
  let row;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text || \'expense\'))', [storeId]);

    const nextRes = await client.query(
      'SELECT COALESCE(MAX(expense_number), 0) + 1 AS next FROM expenses WHERE store_id = $1',
      [storeId]
    );
    const expenseNumber = nextRes.rows[0].next;

    const result = await client.query(
      `INSERT INTO expenses (
        store_id, expense_number, created_by, category_id, vendor_id, vendor_name, vendor_phone,
        description, amount, currency, status, due_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
      RETURNING *`,
      [
        storeId,
        expenseNumber,
        createdBy,
        categoryId || null,
        vendorId || null,
        vendorName?.trim() || null,
        vendorPhone?.trim() || null,
        description?.trim() || null,
        amountNum,
        currency || 'USD',
        dueDate || null,
      ]
    );
    row = result.rows[0];

    await client.query(
      `INSERT INTO expenses_logs (expense_id, user_id, action, details) VALUES ($1, $2, 'created', '{}'::jsonb)`,
      [row.id, createdBy]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return getExpenseById(row.id, data.storeId);
}

/**
 * Listar gastos de una tienda con filtros
 */
export async function getExpensesByStore(storeId, options = {}) {
  const { status, categoryId, vendorId, limit = 50, offset = 0 } = options;
  const conditions = ['e.store_id = $1'];
  const params = [storeId];
  let idx = 2;

  if (status) {
    conditions.push(`e.status = $${idx}`);
    params.push(status);
    idx++;
  }
  if (categoryId) {
    conditions.push(`e.category_id = $${idx}`);
    params.push(categoryId);
    idx++;
  }
  if (vendorId) {
    conditions.push(`e.vendor_id = $${idx}`);
    params.push(vendorId);
    idx++;
  }

  const where = conditions.join(' AND ');

  const countRes = await query(`SELECT COUNT(*) FROM expenses e WHERE ${where}`, params);
  const total = parseInt(countRes.rows[0].count, 10);

  params.push(parseInt(limit, 10) || 50);
  params.push(parseInt(offset, 10) || 0);

  const result = await query(
    `SELECT e.*,
            uc.name AS created_by_name,
            uu.name AS updated_by_name,
            ec.name AS category_name,
            ec.color AS category_color,
            v.name AS v_name,
            v.phone AS v_phone,
            COALESCE((SELECT SUM(ep.amount)::numeric FROM expense_payments ep WHERE ep.expense_id = e.id), 0)::float AS total_paid
     FROM expenses e
     LEFT JOIN users uc ON e.created_by = uc.id
     LEFT JOIN users uu ON e.updated_by = uu.id
     LEFT JOIN expense_categories ec ON e.category_id = ec.id
     LEFT JOIN vendors v ON e.vendor_id = v.id
     WHERE ${where}
     ORDER BY e.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return {
    expenses: result.rows.map((row) => ({
      ...formatExpense(row),
      totalPaid: parseFloat(row.total_paid) || 0,
    })),
    total,
  };
}

/**
 * Total pendiente por pagar agrupado por moneda (restando abonos)
 */
export async function getPendingTotalByStore(storeId) {
  const result = await query(
    `SELECT e.currency,
            COALESCE(SUM(e.amount - (
              SELECT COALESCE(SUM(ep.amount)::numeric, 0) FROM expense_payments ep WHERE ep.expense_id = e.id
            )), 0)::numeric AS total
     FROM expenses e
     WHERE e.store_id = $1 AND e.status = 'pending'
     GROUP BY e.currency`,
    [storeId]
  );
  return result.rows.map((r) => ({ currency: r.currency, total: parseFloat(r.total) }));
}

/**
 * Obtener un gasto por ID
 */
export async function getExpenseById(expenseId, storeId) {
  const result = await query(
    `SELECT e.*,
            uc.name AS created_by_name,
            uu.name AS updated_by_name,
            ec.name AS category_name,
            ec.color AS category_color,
            v.name AS v_name,
            v.phone AS v_phone
     FROM expenses e
     LEFT JOIN users uc ON e.created_by = uc.id
     LEFT JOIN users uu ON e.updated_by = uu.id
     LEFT JOIN expense_categories ec ON e.category_id = ec.id
     LEFT JOIN vendors v ON e.vendor_id = v.id
     WHERE e.id = $1 AND e.store_id = $2`,
    [expenseId, storeId]
  );
  return formatExpense(result.rows[0]);
}

/**
 * Actualizar gasto (campos o estado)
 */
export async function updateExpense(expenseId, storeId, updates, updatedByUserId = null) {
  const setClauses = ['updated_at = CURRENT_TIMESTAMP'];
  const values = [];
  let idx = 1;

  if (updatedByUserId) {
    setClauses.push(`updated_by = $${idx}`);
    values.push(updatedByUserId);
    idx++;
  }
  if (updates.status !== undefined) {
    const s = updates.status;
    if (!['pending', 'paid', 'cancelled'].includes(s)) {
      throw new Error('Estado debe ser pending, paid o cancelled');
    }
    setClauses.push(`status = $${idx}`);
    values.push(s);
    idx++;
    if (s === 'paid') {
      setClauses.push('paid_at = CURRENT_TIMESTAMP');
    } else {
      setClauses.push('paid_at = NULL');
    }
  }
  if (updates.vendorName !== undefined) {
    setClauses.push(`vendor_name = $${idx}`);
    values.push(updates.vendorName?.trim() || null);
    idx++;
  }
  if (updates.vendorPhone !== undefined) {
    setClauses.push(`vendor_phone = $${idx}`);
    values.push(updates.vendorPhone?.trim() || null);
    idx++;
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${idx}`);
    values.push(updates.description?.trim() || null);
    idx++;
  }
  if (updates.amount !== undefined) {
    setClauses.push(`amount = $${idx}`);
    values.push(parseFloat(updates.amount));
    idx++;
  }
  if (updates.currency !== undefined) {
    setClauses.push(`currency = $${idx}`);
    values.push(updates.currency);
    idx++;
  }
  if (updates.categoryId !== undefined) {
    setClauses.push(`category_id = $${idx}`);
    values.push(updates.categoryId || null);
    idx++;
  }
  if (updates.dueDate !== undefined) {
    setClauses.push(`due_date = $${idx}`);
    values.push(updates.dueDate || null);
    idx++;
  }

  if (values.length === 0) return getExpenseById(expenseId, storeId);

  values.push(expenseId);
  values.push(storeId);
  await query(
    `UPDATE expenses SET ${setClauses.join(', ')} WHERE id = $${idx} AND store_id = $${idx + 1}`,
    values
  );

  if (updatedByUserId) {
    const action = updates.status === 'paid' ? 'marked_paid' : updates.status === 'cancelled' ? 'cancelled' : 'updated';
    await query(
      `INSERT INTO expenses_logs (expense_id, user_id, action, details) VALUES ($1, $2, $3, $4)`,
      [expenseId, updatedByUserId, action, JSON.stringify(updates)]
    );
  }

  return getExpenseById(expenseId, storeId);
}

/**
 * Registrar pago/abono a un gasto
 */
export async function createExpensePayment(data) {
  const { expenseId, storeId, amount, currency = 'USD', notes, createdBy } = data;
  const amountNum = parseFloat(amount);
  if (Number.isNaN(amountNum) || amountNum <= 0) {
    throw new Error('El monto del pago debe ser mayor que 0');
  }

  const result = await query(
    `INSERT INTO expense_payments (expense_id, amount, currency, notes, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [expenseId, amountNum, currency || 'USD', notes?.trim() || null, createdBy]
  );

  if (createdBy) {
    await query(
      `INSERT INTO expenses_logs (expense_id, user_id, action, details) VALUES ($1, $2, 'payment', $3)`,
      [expenseId, createdBy, JSON.stringify({ amount: amountNum, currency, notes })]
    );
  }

  return formatPayment(result.rows[0]);
}

/**
 * Listar pagos de un gasto
 */
export async function getPaymentsByExpenseId(expenseId) {
  const result = await query(
    `SELECT ep.*, u.name AS created_by_name
     FROM expense_payments ep
     LEFT JOIN users u ON ep.created_by = u.id
     WHERE ep.expense_id = $1
     ORDER BY ep.created_at ASC`,
    [expenseId]
  );
  return result.rows.map(formatPayment);
}

/**
 * Obtener logs de un gasto
 */
export async function getExpenseLogs(expenseId) {
  const result = await query(
    `SELECT el.*, u.name AS user_name
     FROM expenses_logs el
     LEFT JOIN users u ON el.user_id = u.id
     WHERE el.expense_id = $1
     ORDER BY el.created_at ASC`,
    [expenseId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    expenseId: r.expense_id,
    userId: r.user_id,
    userName: r.user_name || null,
    action: r.action,
    details: r.details,
    createdAt: r.created_at,
  }));
}
