/**
 * Rutas de compras al contado (purchases)
 */

import express from 'express';
import { body } from 'express-validator';
import {
  createPurchaseHandler,
  getPurchasesHandler,
  getPurchaseByIdHandler,
  cancelPurchaseHandler,
} from '../controllers/purchaseController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';

const router = express.Router();
const storeIdQOrB = (req) => req.query.storeId || req.body?.storeId;

router.use(authenticateToken);

router.get('/', requirePermission('purchases.view', storeIdQOrB), getPurchasesHandler);

const createValidation = [
  body('storeId').notEmpty().isUUID(),
  body('total').notEmpty().isFloat({ min: 0 }),
  body('vendorId').optional().isUUID(),
  body('categoryId').optional().isUUID(),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('currency').optional().isIn(['USD', 'EUR', 'VES']),
  body('paymentMethod').optional().trim().isLength({ max: 100 }),
  body('notes').optional().trim().isLength({ max: 2000 }),
];
router.post('/', requirePermission('purchases.create', storeIdQOrB), createValidation, createPurchaseHandler);

router.get('/:id', requirePermission('purchases.view', storeIdQOrB), getPurchaseByIdHandler);
router.post('/:id/cancel', requirePermission('purchases.edit', storeIdQOrB), cancelPurchaseHandler);

export default router;
