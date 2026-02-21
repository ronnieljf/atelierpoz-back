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

const router = express.Router();

router.use(authenticateToken);

/** GET /api/expenses?storeId=&status=&categoryId=&limit=&offset= */
router.get('/', getExpensesHandler);

/** GET /api/expenses/pending-total?storeId= */
router.get('/pending-total', getPendingTotalHandler);

/** POST /api/expenses */
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
router.post('/', createValidation, createExpenseHandler);

/** GET /api/expenses/:id/payments */
router.get('/:id/payments', getExpensePaymentsHandler);

/** POST /api/expenses/:id/payments */
const paymentValidation = [
  body('storeId').notEmpty().isUUID(),
  body('amount').notEmpty().isFloat({ min: 0.01 }),
  body('currency').optional().isIn(['USD', 'EUR', 'VES']),
  body('notes').optional().trim().isLength({ max: 1000 }),
];
router.post('/:id/payments', paymentValidation, createExpensePaymentHandler);

/** GET /api/expenses/:id/logs */
router.get('/:id/logs', getExpenseLogsHandler);

/** GET /api/expenses/:id?storeId= */
router.get('/:id', getExpenseByIdHandler);

/** PUT /api/expenses/:id */
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
router.put('/:id', updateValidation, updateExpenseHandler);

export default router;
