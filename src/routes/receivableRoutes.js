/**
 * Rutas de cuentas por cobrar (receivables)
 * Todas requieren autenticación y acceso a la tienda.
 */

import express from 'express';
import { body } from 'express-validator';
import {
  createReceivableHandler,
  createReceivableFromRequestHandler,
  getReceivablesHandler,
  getPendingTotalHandler,
  getReceivableByIdHandler,
  getReceivableLogsHandler,
  updateReceivableHandler,
  updateReceivableItemsHandler,
  getReceivablePaymentsHandler,
  createReceivablePaymentHandler,
  sendReceivableRemindersHandler,
  bulkUpdateReceivableStatusHandler,
} from '../controllers/receivableController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

/**
 * GET /api/receivables
 * Query: storeId (requerido), status?, limit?, offset?
 */
router.get('/', getReceivablesHandler);

/**
 * GET /api/receivables/pending-total
 * Query: storeId (requerido). Retorna total pendiente por cobrar por moneda.
 */
router.get('/pending-total', getPendingTotalHandler);

/**
 * POST /api/receivables/send-reminders
 * Envía recordatorios por WhatsApp con template recordatorio_estado_de_cuenta. Body: { storeId, recipients: [ { phone, receivableIds } ] }
 */
const sendRemindersValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('recipients')
    .isArray({ min: 1 })
    .withMessage('recipients debe ser un array con al menos un elemento { phone, receivableIds }'),
];
router.post('/send-reminders', sendRemindersValidation, sendReceivableRemindersHandler);

/**
 * POST /api/receivables/bulk-update-status
 * Actualiza el estado de varias cuentas en lote. Solo se actualizan las pendientes.
 * Body: { storeId, receivableIds: string[], newStatus: 'paid' | 'cancelled' }
 */
const bulkUpdateStatusValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('receivableIds')
    .isArray({ min: 1 })
    .withMessage('receivableIds debe ser un array con al menos un ID'),
  body('newStatus')
    .isIn(['paid', 'cancelled'])
    .withMessage('newStatus debe ser paid o cancelled'),
];
router.post('/bulk-update-status', bulkUpdateStatusValidation, bulkUpdateReceivableStatusHandler);

/**
 * POST /api/receivables/from-request
 * Crear desde pedido. Body: { storeId, requestId, description? }
 */
const fromRequestValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('requestId').notEmpty().withMessage('requestId es requerido').isUUID().withMessage('requestId debe ser UUID'),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('amount').optional().isFloat({ min: 0 }).withMessage('El monto debe ser mayor o igual a 0'),
  body('initialPayment').optional(),
  body('initialPayment.amount').optional().isFloat({ min: 0 }).withMessage('Abono inicial debe ser mayor o igual a 0'),
  body('initialPayment.notes').optional().trim().isLength({ max: 1000 }),
];
router.post('/from-request', fromRequestValidation, createReceivableFromRequestHandler);

/**
 * POST /api/receivables
 * Crear manual. Body: { storeId, customerName?, customerPhone?, description?, amount, currency? }
 */
const createValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('amount')
    .notEmpty()
    .withMessage('El monto es requerido')
    .isFloat({ min: 0 })
    .withMessage('El monto debe ser un número mayor o igual a 0'),
  body('customerName').optional().trim().isLength({ max: 255 }),
  body('customerPhone').optional().trim().isLength({ max: 50 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('currency').optional().isIn(['USD', 'EUR', 'VES']).withMessage('Moneda debe ser USD, EUR o VES'),
  body('initialPayment').optional(),
  body('initialPayment.amount').optional().isFloat({ min: 0 }).withMessage('Abono inicial debe ser mayor o igual a 0'),
  body('initialPayment.notes').optional().trim().isLength({ max: 1000 }),
];
router.post('/', createValidation, createReceivableHandler);

/**
 * GET /api/receivables/:id/payments
 * Listar abonos. Query: storeId (requerido)
 */
router.get('/:id/payments', getReceivablePaymentsHandler);

/**
 * POST /api/receivables/:id/payments
 * Registrar abono. Body: { storeId, amount, currency?, notes? }
 */
const paymentValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('amount')
    .notEmpty()
    .withMessage('El monto es requerido')
    .isFloat({ min: 0.01 })
    .withMessage('El monto debe ser mayor que 0'),
  body('currency').optional().isIn(['USD', 'EUR', 'VES']),
  body('notes').optional().trim().isLength({ max: 1000 }),
];
router.post('/:id/payments', paymentValidation, createReceivablePaymentHandler);

/**
 * GET /api/receivables/:id/logs
 * Trazabilidad. Query: storeId (requerido)
 */
router.get('/:id/logs', getReceivableLogsHandler);

/**
 * GET /api/receivables/:id
 * Query: storeId (requerido)
 */
router.get('/:id', getReceivableByIdHandler);

/**
 * PUT /api/receivables/:id/items
 * Cambiar productos de una cuenta creada desde pedido. Body: { storeId, items, total }
 */
const updateItemsValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('items').isArray({ min: 1 }).withMessage('items debe tener al menos un producto'),
  body('total').isFloat({ min: 0 }).withMessage('total debe ser mayor o igual a 0'),
];
router.put('/:id/items', updateItemsValidation, updateReceivableItemsHandler);

/**
 * PUT /api/receivables/:id
 * Body: { storeId, customerName?, customerPhone?, description?, amount?, currency?, status? }
 */
const updateValidation = [
  body('storeId').notEmpty().withMessage('storeId es requerido').isUUID().withMessage('storeId debe ser UUID'),
  body('customerName').optional().trim().isLength({ max: 255 }),
  body('customerPhone').optional().trim().isLength({ max: 50 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('amount').optional().isFloat({ min: 0 }).withMessage('El monto debe ser mayor o igual a 0'),
  body('currency').optional().isIn(['USD', 'EUR', 'VES']),
  body('status').optional().isIn(['pending', 'paid', 'cancelled']).withMessage('Estado debe ser pending, paid o cancelled'),
];
router.put('/:id', updateValidation, updateReceivableHandler);

export default router;
