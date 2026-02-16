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

const router = express.Router();

router.use(authenticateToken);

/**
 * GET /api/clients
 * Query: storeId (requerido), limit?, offset?, search?
 */
router.get('/', getClientsHandler);

/**
 * GET /api/clients/:id
 * Query: storeId (requerido)
 */
router.get('/:id', getClientHandler);

/**
 * POST /api/clients
 * Body: { storeId, name?, phone?, email? }
 */
const createValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('name').optional().trim().isLength({ max: 500 }),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().trim().isEmail().withMessage('Email debe ser válido'),
];
router.post('/', createValidation, createClientHandler);

/**
 * PUT /api/clients/:id
 * Body: { storeId, name?, phone?, email? }
 */
const updateValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('name').optional().trim().isLength({ max: 500 }),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().trim().isEmail().withMessage('Email debe ser válido'),
];
router.put('/:id', updateValidation, updateClientHandler);

/**
 * DELETE /api/clients/:id
 * Query: storeId (requerido)
 */
router.delete('/:id', deleteClientHandler);

export default router;
