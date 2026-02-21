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

const router = express.Router();

router.use(authenticateToken);

/** GET /api/vendors?storeId=&limit=&offset=&search= */
router.get('/', getVendorsHandler);

/** GET /api/vendors/:id?storeId= */
router.get('/:id', getVendorHandler);

/** POST /api/vendors */
const createValidation = [
  body('storeId').notEmpty().isUUID(),
  body('name').optional().trim().isLength({ max: 500 }),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().isEmail(),
  body('address').optional().trim().isLength({ max: 2000 }),
  body('identityDocument').optional().trim().isLength({ max: 50 }),
  body('notes').optional().trim().isLength({ max: 2000 }),
];
router.post('/', createValidation, createVendorHandler);

/** PUT /api/vendors/:id */
const updateValidation = [
  body('storeId').notEmpty().isUUID(),
  body('name').optional().trim().isLength({ max: 500 }),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().isEmail(),
  body('address').optional().trim().isLength({ max: 2000 }),
  body('identityDocument').optional().trim().isLength({ max: 50 }),
  body('notes').optional().trim().isLength({ max: 2000 }),
];
router.put('/:id', updateValidation, updateVendorHandler);

/** DELETE /api/vendors/:id?storeId= */
router.delete('/:id', deleteVendorHandler);

export default router;
