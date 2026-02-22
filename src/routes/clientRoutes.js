/**
 * Rutas de clientes (cartera por tienda)
 * Todas requieren autenticación y acceso a la tienda.
 */

import express from 'express';
import { body } from 'express-validator';
import {
  getClientsHandler,
  getClientHandler,
  createClientHandler,
  updateClientHandler,
  deleteClientHandler,
} from '../controllers/clientController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission, storeIdFromQueryOrBody } from '../middleware/permission.js';

const router = express.Router();

router.use(authenticateToken);

const storeIdQueryOrBody = (req) => req.query.storeId || req.body?.storeId;

router.get('/', requirePermission('clients.view', storeIdQueryOrBody), getClientsHandler);
router.get('/:id', requirePermission('clients.view', storeIdQueryOrBody), getClientHandler);

const createValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('name').optional().trim().isLength({ max: 500 }),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().trim().isEmail().withMessage('Email debe ser válido'),
];
router.post('/', requirePermission('clients.create', storeIdQueryOrBody), createValidation, createClientHandler);

const updateValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('name').optional().trim().isLength({ max: 500 }),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().trim().isEmail().withMessage('Email debe ser válido'),
];
router.put('/:id', requirePermission('clients.edit', storeIdQueryOrBody), updateValidation, updateClientHandler);
router.delete('/:id', requirePermission('clients.edit', storeIdQueryOrBody), deleteClientHandler);

export default router;
