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

const router = express.Router();

router.use(authenticateToken);

/** GET /api/purchases?storeId=&status=&categoryId=&vendorId=&limit=&offset= */
router.get('/', getPurchasesHandler);

/** POST /api/purchases */
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
router.post('/', createValidation, createPurchaseHandler);

/** GET /api/purchases/:id?storeId= */
router.get('/:id', getPurchaseByIdHandler);

/** POST /api/purchases/:id/cancel */
router.post('/:id/cancel', cancelPurchaseHandler);

export default router;
