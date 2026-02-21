/**
 * Controlador de gastos / cuentas por pagar (expenses)
 */

import {
  createExpense,
  getExpensesByStore,
  getPendingTotalByStore,
  getExpenseById,
  updateExpense,
  createExpensePayment,
  getPaymentsByExpenseId,
  getExpenseLogs,
} from '../services/expenseService.js';
import { getUserStoreById } from '../services/storeService.js';

/**
 * POST /api/expenses
 */
export async function createExpenseHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const { storeId, categoryId, vendorId, vendorName, vendorPhone, description, amount, currency, dueDate } = req.body;

    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });

    if (!isAdmin) {
      const store = await getUserStoreById(storeId, userId);
      if (!store) return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const amountNum = amount != null && amount !== '' ? parseFloat(amount) : NaN;
    if (Number.isNaN(amountNum) || amountNum < 0) {
      return res.status(400).json({ success: false, error: 'El monto debe ser un número mayor o igual a 0' });
    }

    const expense = await createExpense({
      storeId,
      createdBy: userId,
      categoryId: categoryId || null,
      vendorId: vendorId || null,
      vendorName: vendorName?.trim() || null,
      vendorPhone: vendorPhone?.trim() || null,
      description: description?.trim() || null,
      amount: amountNum,
      currency: currency || 'USD',
      dueDate: dueDate || null,
    });

    return res.status(201).json({ success: true, expense });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/expenses
 */
export async function getExpensesHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const { storeId, status, categoryId, limit, offset } = req.query;

    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });

    if (!isAdmin) {
      const store = await getUserStoreById(storeId, userId);
      if (!store) return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const result = await getExpensesByStore(storeId, { status, categoryId, limit, offset });
    return res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/expenses/pending-total
 */
export async function getPendingTotalHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const { storeId } = req.query;

    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });

    if (!isAdmin) {
      const store = await getUserStoreById(storeId, userId);
      if (!store) return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const totals = await getPendingTotalByStore(storeId);
    return res.json({ success: true, totals });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/expenses/:id
 */
export async function getExpenseByIdHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const { storeId } = req.query;

    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });

    if (!isAdmin) {
      const store = await getUserStoreById(storeId, userId);
      if (!store) return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const expense = await getExpenseById(req.params.id, storeId);
    if (!expense) return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
    return res.json({ success: true, expense });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/expenses/:id
 */
export async function updateExpenseHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const { storeId, ...updates } = req.body;

    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });

    if (!isAdmin) {
      const store = await getUserStoreById(storeId, userId);
      if (!store) return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const expense = await updateExpense(req.params.id, storeId, updates, userId);
    if (!expense) return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
    return res.json({ success: true, expense });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/expenses/:id/payments
 */
export async function getExpensePaymentsHandler(req, res, next) {
  try {
    const payments = await getPaymentsByExpenseId(req.params.id);
    return res.json({ success: true, payments });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/expenses/:id/payments
 */
export async function createExpensePaymentHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const { storeId, amount, currency, notes } = req.body;

    if (!storeId) return res.status(400).json({ success: false, error: 'storeId es requerido' });

    if (!isAdmin) {
      const store = await getUserStoreById(storeId, userId);
      if (!store) return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const amountNum = amount != null && amount !== '' ? parseFloat(amount) : NaN;
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, error: 'El monto del pago debe ser mayor que 0' });
    }

    const payment = await createExpensePayment({
      expenseId: req.params.id,
      storeId,
      amount: amountNum,
      currency: currency || 'USD',
      notes: notes?.trim() || null,
      createdBy: userId,
    });

    return res.status(201).json({ success: true, payment });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/expenses/:id/logs
 */
export async function getExpenseLogsHandler(req, res, next) {
  try {
    const logs = await getExpenseLogs(req.params.id);
    return res.json({ success: true, logs });
  } catch (error) {
    next(error);
  }
}
