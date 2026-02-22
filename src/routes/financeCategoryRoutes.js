/**
 * Rutas de categorías financieras (income_categories + expense_categories)
 * Todas requieren autenticación.
 */

import express from 'express';
import { body } from 'express-validator';
import { incomeHandlers, expenseHandlers } from '../controllers/financeCategoryController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';

const router = express.Router();
const storeIdQOrB = (req) => req.query.storeId || req.body?.storeId;

router.use(authenticateToken);

const nameValidation = [
  body('name').notEmpty().withMessage('El nombre es requerido').trim().isLength({ max: 255 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('color').optional().trim().isLength({ max: 30 }),
];

// ── Categorías de ingresos ──
router.get('/income', requirePermission('finance_categories.view', storeIdQOrB), incomeHandlers.list);
router.get('/income/:id', requirePermission('finance_categories.view', storeIdQOrB), incomeHandlers.getById);
router.post('/income', requirePermission('finance_categories.create', storeIdQOrB), [...nameValidation, body('storeId').notEmpty().isUUID()], incomeHandlers.create);
router.put('/income/:id', requirePermission('finance_categories.edit', storeIdQOrB), nameValidation, incomeHandlers.update);
router.delete('/income/:id', requirePermission('finance_categories.edit', storeIdQOrB), incomeHandlers.remove);

// ── Categorías de gastos ──
router.get('/expense', requirePermission('finance_categories.view', storeIdQOrB), expenseHandlers.list);
router.get('/expense/:id', requirePermission('finance_categories.view', storeIdQOrB), expenseHandlers.getById);
router.post('/expense', requirePermission('finance_categories.create', storeIdQOrB), [...nameValidation, body('storeId').notEmpty().isUUID()], expenseHandlers.create);
router.put('/expense/:id', requirePermission('finance_categories.edit', storeIdQOrB), nameValidation, expenseHandlers.update);
router.delete('/expense/:id', requirePermission('finance_categories.edit', storeIdQOrB), expenseHandlers.remove);

export default router;
