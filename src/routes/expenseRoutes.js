/**
 * Rutas de gastos / cuentas por pagar (expenses)
 * Todas requieren autenticación.
 */

import express from 'express';
import { body } from 'express-validator';
import {
  createExpenseHandler,
  getExpensesHandler,
  getPendingTotalHandler,
  getExpenseByIdHandler,
  updateExpenseHandler,
  getExpensePaymentsHandler,
  createExpensePaymentHandler,
  getExpenseLogsHandler,
} from '../controllers/expenseController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';

const router = express.Router();
const storeIdQOrB = (req) => req.query.storeId || req.body?.storeId;

router.use(authenticateToken);

router.get('/', requirePermission('expenses.view', storeIdQOrB), getExpensesHandler);
router.get('/pending-total', requirePermission('expenses.view', storeIdQOrB), getPendingTotalHandler);

const createValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID(),
  body('amount').notEmpty().withMessage('El monto es requerido').isFloat({ min: 0 }),
  body('vendorName').optional().trim().isLength({ max: 255 }),
  body('vendorPhone').optional().trim().isLength({ max: 50 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('currency').optional().isIn(['USD', 'EUR', 'VES']),
  body('categoryId').optional().isUUID(),
  body('dueDate').optional().isISO8601(),
];
router.post('/', requirePermission('expenses.create', storeIdQOrB), createValidation, createExpenseHandler);

router.get('/:id/payments', requirePermission('expenses.view', storeIdQOrB), getExpensePaymentsHandler);

const paymentValidation = [
  body('storeId').notEmpty().isUUID(),
  body('amount').notEmpty().isFloat({ min: 0.01 }),
  body('currency').optional().isIn(['USD', 'EUR', 'VES']),
  body('notes').optional().trim().isLength({ max: 1000 }),
];
router.post('/:id/payments', requirePermission('expenses.edit', storeIdQOrB), paymentValidation, createExpensePaymentHandler);

router.get('/:id/logs', requirePermission('expenses.view', storeIdQOrB), getExpenseLogsHandler);
router.get('/:id', requirePermission('expenses.view', storeIdQOrB), getExpenseByIdHandler);

const updateValidation = [
  body('storeId').notEmpty().isUUID(),
  body('vendorName').optional().trim().isLength({ max: 255 }),
  body('vendorPhone').optional().trim().isLength({ max: 50 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('amount').optional().isFloat({ min: 0 }),
  body('currency').optional().isIn(['USD', 'EUR', 'VES']),
  body('status').optional().isIn(['pending', 'paid', 'cancelled']),
  body('categoryId').optional(),
  body('dueDate').optional(),
];
router.put('/:id', requirePermission('expenses.edit', storeIdQOrB), updateValidation, updateExpenseHandler);

export default router;
