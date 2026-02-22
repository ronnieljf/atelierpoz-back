/**
 * Rutas de tiendas
 */

import express from 'express';
import { body } from 'express-validator';
import { getStores, getStoreById, getAllStoresPublic, getStoreByIdPublicHandler, getStoreCategoriesHandler, getStoreFeatureSendReminderReceivablesWhatsappHandler, createStoreHandler, updateStoreHandler, addUserToStoreHandler, removeUserFromStoreHandler, updateUserPhoneNumberHandler, getStoreUsersHandler, uploadStoreLogoHandler, getMyPermissionsHandler, setUserPermissionsHandler, getAllPermissionsHandler } from '../controllers/storeController.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadLogoMiddleware } from '../middleware/multer.js';

const router = express.Router();

// Rutas públicas (sin autenticación) - DEBEN estar antes del middleware
/**
 * GET /api/stores/public
 * Obtener todas las tiendas activas (público, sin autenticación)
 */
router.get('/public', getAllStoresPublic);

/**
 * GET /api/stores/public/:id/categories
 * Obtener categorías de una tienda (público, para filtros en la página de la tienda)
 */
router.get('/public/:id/categories', getStoreCategoriesHandler);

/**
 * GET /api/stores/public/:id/feature-send-reminder-receivables-whatsapp
 * Verificar si la tienda tiene activa la función de recordatorio de cobranzas por WhatsApp (público)
 */
router.get('/public/:id/feature-send-reminder-receivables-whatsapp', getStoreFeatureSendReminderReceivablesWhatsappHandler);

/**
 * GET /api/stores/public/:id
 * Obtener una tienda por ID (público, sin autenticación)
 */
router.get('/public/:id', getStoreByIdPublicHandler);

// Todas las demás rutas requieren autenticación
router.use(authenticateToken);

/**
 * GET /api/stores
 * Obtener todas las tiendas del usuario actual
 */
router.get('/', getStores);

/**
 * POST /api/stores
 * Crear una nueva tienda
 * - Admins pueden crear múltiples tiendas
 * - Usuarios normales solo pueden crear una tienda
 */
const createStoreValidation = [
  body('name')
    .notEmpty()
    .withMessage('El nombre de la tienda es requerido')
    .trim()
    .isLength({ min: 1 })
    .withMessage('El nombre de la tienda no puede estar vacío'),
  body('state')
    .optional()
    .isIn(['active', 'inactive']),
  body('store_id')
    .optional()
    .trim()
    .custom((value) => {
      if (!value || value.trim() === '') {
        return true;
      }
      const slugRegex = /^[a-zA-Z0-9_-]+$/;
      if (!slugRegex.test(value)) {
        throw new Error('El store_id solo puede contener letras, números, guiones y guiones bajos.');
      }
      return true;
    }),
  body('instagram')
    .optional()
    .trim()
    .custom((value) => {
      if (!value || value.trim() === '') {
        return true;
      }
      const instagramRegex = /^[a-zA-Z0-9._]+$/;
      if (!instagramRegex.test(value)) {
        throw new Error('El formato del Instagram no es válido. Solo se permiten letras, números, puntos y guiones bajos.');
      }
      return true;
    }),
  body('tiktok')
    .optional()
    .trim()
    .custom((value) => {
      if (!value || value.trim() === '') {
        return true;
      }
      const tiktokRegex = /^[a-zA-Z0-9._]+$/;
      if (!tiktokRegex.test(value)) {
        throw new Error('El formato del TikTok no es válido. Solo se permiten letras, números, puntos y guiones bajos.');
      }
      return true;
    }),
];
// No requiere requireAdmin, el controlador valida permisos
router.post('/', authenticateToken, createStoreValidation, createStoreHandler);

/**
 * GET /api/stores/permissions
 * Catálogo de todos los permisos disponibles
 */
router.get('/permissions', authenticateToken, getAllPermissionsHandler);

/**
 * GET /api/stores/:id/my-permissions
 * Permisos del usuario actual en esta tienda
 */
router.get('/:id/my-permissions', authenticateToken, getMyPermissionsHandler);

/**
 * GET /api/stores/:id/users
 * Solo el creador puede ver usuarios
 */
router.get('/:id/users', authenticateToken, getStoreUsersHandler);

/**
 * POST /api/stores/:id/users
 * Agregar un usuario a una tienda por email
 * - Solo el creador de la tienda o un admin pueden agregar usuarios
 * IMPORTANTE: Esta ruta debe estar ANTES de /:id para evitar conflictos
 */
const addUserValidation = [
  body('email')
    .notEmpty()
    .withMessage('El email del usuario es requerido')
    .trim()
    .isEmail()
    .withMessage('El formato del email no es válido'),
];
router.post('/:id/users', authenticateToken, addUserValidation, addUserToStoreHandler);

/**
 * DELETE /api/stores/:id/users/:userId
 * Eliminar un usuario de la tienda. Solo el creador.
 */
router.delete('/:id/users/:userId', authenticateToken, removeUserFromStoreHandler);

/**
 * PUT /api/stores/:id/users/:userId/permissions
 * Asignar permisos a un usuario. Solo el creador. Body: { permissionCodes: string[] }
 */
router.put('/:id/users/:userId/permissions', authenticateToken, setUserPermissionsHandler);

/**
 * PUT /api/stores/:id/users/phone
 * Actualizar el número de teléfono del usuario actual en una tienda específica
 * - El usuario solo puede actualizar su propio número de teléfono
 */
const updatePhoneValidation = [
  body('phoneNumber')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('El número de teléfono no puede tener más de 20 caracteres'),
];
router.put('/:id/users/phone', authenticateToken, updatePhoneValidation, updateUserPhoneNumberHandler);

/**
 * GET /api/stores/:id
 * Obtener una tienda específica del usuario actual
 */
router.get('/:id', getStoreById);

/**
 * PUT /api/stores/:id/logo
 * Subir y actualizar el logo de la tienda. Solo creador o admin.
 * Body: multipart/form-data, campo "logo" (imagen).
 */
router.put('/:id/logo', authenticateToken, uploadLogoMiddleware, uploadStoreLogoHandler);

/**
 * PUT /api/stores/:id
 * Actualizar una tienda (admins pueden editar cualquier tienda, usuarios normales solo sus propias tiendas)
 */
const updateStoreValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('El nombre de la tienda no puede estar vacío'),
  body('state')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('El estado debe ser "active" o "inactive"'),
  body('store_id')
    .optional()
    .trim()
    .custom((value) => {
      if (value === null || value === undefined || value === '') {
        return true;
      }
      const slugRegex = /^[a-zA-Z0-9_-]+$/;
      if (!slugRegex.test(value)) {
        throw new Error('El store_id solo puede contener letras, números, guiones y guiones bajos.');
      }
      return true;
    }),
  body('instagram')
    .optional()
    .trim()
    .custom((value) => {
      if (value === null || value === undefined || value === '') {
        return true;
      }
      const instagramRegex = /^[a-zA-Z0-9._]+$/;
      if (!instagramRegex.test(value)) {
        throw new Error('El usuario de Instagram solo puede contener letras, números, puntos y guiones bajos');
      }
      return true;
    }),
  body('tiktok')
    .optional()
    .trim()
    .custom((value) => {
      if (value === null || value === undefined || value === '') {
        return true;
      }
      const tiktokRegex = /^[a-zA-Z0-9._]+$/;
      if (!tiktokRegex.test(value)) {
        throw new Error('El usuario de TikTok solo puede contener letras, números, puntos y guiones bajos');
      }
      return true;
    }),
  body('feature_send_reminder_receivables_whatsapp')
    .optional()
    .isBoolean()
    .withMessage('feature_send_reminder_receivables_whatsapp debe ser true o false'),
];
// No requiere requireAdmin, el controlador verifica permisos
router.put('/:id', authenticateToken, updateStoreValidation, updateStoreHandler);

export default router;
