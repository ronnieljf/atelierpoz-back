/**
 * Rutas de categorías financieras (income_categories + expense_categories)
 * Todas requieren autenticación.
 */

import express from 'express';
import { body } from 'express-validator';
import { incomeHandlers, expenseHandlers } from '../controllers/financeCategoryController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

const nameValidation = [
  body('name').notEmpty().withMessage('El nombre es requerido').trim().isLength({ max: 255 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('color').optional().trim().isLength({ max: 30 }),
];

// ── Categorías de ingresos ──
router.get('/income', incomeHandlers.list);
router.get('/income/:id', incomeHandlers.getById);
router.post('/income', [...nameValidation, body('storeId').notEmpty().isUUID()], incomeHandlers.create);
router.put('/income/:id', nameValidation, incomeHandlers.update);
router.delete('/income/:id', incomeHandlers.remove);

// ── Categorías de gastos ──
router.get('/expense', expenseHandlers.list);
router.get('/expense/:id', expenseHandlers.getById);
router.post('/expense', [...nameValidation, body('storeId').notEmpty().isUUID()], expenseHandlers.create);
router.put('/expense/:id', nameValidation, expenseHandlers.update);
router.delete('/expense/:id', expenseHandlers.remove);

export default router;
