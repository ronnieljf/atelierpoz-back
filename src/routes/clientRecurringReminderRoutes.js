/**
 * Rutas de recordatorios de pagos recurrentes por cliente.
 */

import express from 'express';
import { body } from 'express-validator';
import {
  getRemindersHandler,
  getReminderByIdHandler,
  createReminderHandler,
  updateReminderHandler,
  deleteReminderHandler,
} from '../controllers/clientRecurringReminderController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission, storeIdFromQueryOrBody } from '../middleware/permission.js';

const router = express.Router();
const storeIdQOrB = (req) => req.query.storeId || req.body?.storeId;

router.use(authenticateToken);

router.get('/', requirePermission('clients.view', storeIdQOrB), getRemindersHandler);
router.get('/:id', requirePermission('clients.view', storeIdQOrB), getReminderByIdHandler);

const createValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('clientIds').isArray({ min: 1 }).withMessage('clientIds debe ser un array con al menos un cliente'),
  body('clientIds.*').isUUID().withMessage('cada clientId debe ser UUID'),
  body('amount').notEmpty().withMessage('amount es requerido').isFloat({ min: 0 }).withMessage('amount debe ser mayor o igual a 0'),
  body('nextDueAt').notEmpty().withMessage('nextDueAt es requerido').isISO8601().withMessage('nextDueAt debe ser una fecha/hora válida'),
  body('currency').optional().isIn(['USD', 'EUR', 'VES']).withMessage('currency debe ser USD, EUR o VES'),
  body('dueDay').optional().isInt({ min: 1, max: 31 }).withMessage('dueDay debe ser un número entre 1 y 31'),
  body('contact').optional().isString().trim().withMessage('contact debe ser string'),
  body('contactChannel').optional().isIn(['phone', 'email']).withMessage('contactChannel debe ser phone o email'),
  body('enabled').optional().isBoolean(),
];

const updateValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('clientIds').optional().isArray().withMessage('clientIds debe ser un array'),
  body('clientIds.*').optional().isUUID().withMessage('cada clientId debe ser UUID'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('amount debe ser mayor o igual a 0'),
  body('nextDueAt').optional().isISO8601().withMessage('nextDueAt debe ser una fecha/hora válida'),
  body('currency').optional().isIn(['USD', 'EUR', 'VES']).withMessage('currency debe ser USD, EUR o VES'),
  body('dueDay').optional().isInt({ min: 1, max: 31 }).withMessage('dueDay debe ser un número entre 1 y 31'),
  body('contact').optional().isString().trim().withMessage('contact debe ser string'),
  body('contactChannel').optional().isIn(['phone', 'email']).withMessage('contactChannel debe ser phone o email'),
  body('enabled').optional().isBoolean(),
];

router.post('/', requirePermission('clients.edit', storeIdQOrB), createValidation, createReminderHandler);
router.put('/:id', requirePermission('clients.edit', storeIdQOrB), updateValidation, updateReminderHandler);
router.delete('/:id', requirePermission('clients.edit', storeIdQOrB), deleteReminderHandler);

export default router;
