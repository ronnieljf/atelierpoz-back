/**
 * Rutas de requests (pedidos)
 */

import express from 'express';
import { body } from 'express-validator';
import {
  createRequestHandler,
  getRequestsHandler,
  getRequestByIdHandler,
  updateRequestStatusHandler,
} from '../controllers/requestController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';

const router = express.Router();

/**
 * POST /api/requests
 * Crear un nuevo request (pedido) - PÚBLICO (no requiere autenticación)
 * Body: { storeId, customerName?, customerPhone?, customerEmail?, items, customMessage?, total, currency?, status? }
 */
const createRequestValidation = [
  body('storeId')
    .notEmpty()
    .withMessage('storeId es requerido')
    .isUUID()
    .withMessage('storeId debe ser un UUID válido'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('El pedido debe contener al menos un producto'),
  body('total')
    .notEmpty()
    .withMessage('El total es requerido')
    .isFloat({ min: 0 })
    .withMessage('El total debe ser un número válido mayor o igual a 0'),
  body('currency')
    .optional()
    .isIn(['USD', 'EUR', 'VES'])
    .withMessage('La moneda debe ser USD, EUR o VES'),
  body('status')
    .optional()
    .isIn(['pending', 'processing', 'completed', 'cancelled'])
    .withMessage('El estado debe ser pending, processing, completed o cancelled'),
  body('customerName')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('El nombre del cliente no puede exceder 255 caracteres'),
  body('customerPhone')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('El teléfono no puede exceder 20 caracteres'),
  body('customerEmail')
    .optional()
    .trim()
    .isEmail()
    .withMessage('El email debe tener un formato válido'),
];
router.post('/', createRequestValidation, createRequestHandler);

router.use(authenticateToken);

const storeIdQOrB = (req) => req.query.storeId || req.body?.storeId;

router.get('/', requirePermission('requests.view', storeIdQOrB), getRequestsHandler);
router.get('/:id', requirePermission('requests.view', storeIdQOrB), getRequestByIdHandler);

const updateStatusValidation = [
  body('storeId')
    .notEmpty()
    .withMessage('storeId es requerido')
    .isUUID()
    .withMessage('storeId debe ser un UUID válido'),
  body('status')
    .notEmpty()
    .withMessage('status es requerido')
    .isIn(['pending', 'processing', 'completed', 'cancelled'])
    .withMessage('El estado debe ser pending, processing, completed o cancelled'),
];
router.put('/:id/status', requirePermission('requests.edit', storeIdQOrB), updateStatusValidation, updateRequestStatusHandler);

export default router;
