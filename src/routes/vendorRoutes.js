/**
 * Rutas de proveedores (vendors)
 */

import express from 'express';
import { body } from 'express-validator';
import {
  getVendorsHandler,
  getVendorHandler,
  createVendorHandler,
  updateVendorHandler,
  deleteVendorHandler,
} from '../controllers/vendorController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';

const router = express.Router();
const storeIdQOrB = (req) => req.query.storeId || req.body?.storeId;

router.use(authenticateToken);

router.get('/', requirePermission('vendors.view', storeIdQOrB), getVendorsHandler);
router.get('/:id', requirePermission('vendors.view', storeIdQOrB), getVendorHandler);

const createValidation = [
  body('storeId').notEmpty().isUUID(),
  body('name').optional().trim().isLength({ max: 500 }),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().isEmail(),
  body('address').optional().trim().isLength({ max: 2000 }),
  body('identityDocument').optional().trim().isLength({ max: 50 }),
  body('notes').optional().trim().isLength({ max: 2000 }),
];
router.post('/', requirePermission('vendors.create', storeIdQOrB), createValidation, createVendorHandler);

const updateValidation = [
  body('storeId').notEmpty().isUUID(),
  body('name').optional().trim().isLength({ max: 500 }),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().isEmail(),
  body('address').optional().trim().isLength({ max: 2000 }),
  body('identityDocument').optional().trim().isLength({ max: 50 }),
  body('notes').optional().trim().isLength({ max: 2000 }),
];
router.put('/:id', requirePermission('vendors.edit', storeIdQOrB), updateValidation, updateVendorHandler);
router.delete('/:id', requirePermission('vendors.edit', storeIdQOrB), deleteVendorHandler);

export default router;
