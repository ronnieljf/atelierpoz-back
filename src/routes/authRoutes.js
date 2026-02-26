/**
 * Rutas de autenticación
 */

import express from 'express';
import { body } from 'express-validator';
import {
  login,
  verifyToken,
  getMe,
  changePasswordHandler,
  sendRegisterCodeHandler,
  verifyRegisterHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  getOnboardingSurvey,
  saveOnboardingSurvey,
} from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Validaciones para login
const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Contraseña es requerida')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
];

/**
 * POST /api/auth/login
 * Login de usuario
 */
router.post('/login', loginValidation, login);

/**
 * POST /api/auth/register/send-code
 * Envía código de verificación para registro
 * Body: { email, name?, password }
 */
const registerSendCodeValidation = [
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Contraseña es requerida')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
];
router.post('/register/send-code', registerSendCodeValidation, sendRegisterCodeHandler);

/**
 * POST /api/auth/register/verify
 * Verifica código y crea usuario
 * Body: { email, code }
 */
const registerVerifyValidation = [
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('code').notEmpty().withMessage('Código es requerido').isLength({ min: 6, max: 6 }).withMessage('Código debe tener 6 dígitos'),
];
router.post('/register/verify', registerVerifyValidation, verifyRegisterHandler);

/**
 * POST /api/auth/forgot-password
 * Envía código de recuperación
 * Body: { email }
 */
router.post('/forgot-password', [body('email').isEmail().withMessage('Email inválido').normalizeEmail()], forgotPasswordHandler);

/**
 * POST /api/auth/reset-password
 * Restablece contraseña con código
 * Body: { email, code, newPassword }
 */
const resetPasswordValidation = [
  body('email').isEmail().normalizeEmail(),
  body('code').notEmpty().isLength({ min: 6, max: 6 }),
  body('newPassword').notEmpty().isLength({ min: 6 }),
];
router.post('/reset-password', resetPasswordValidation, resetPasswordHandler);

/**
 * GET /api/auth/verify
 * Verificar si el token es válido
 */
router.get('/verify', authenticateToken, verifyToken);

/**
 * GET /api/auth/me
 * Obtener información del usuario actual
 */
router.get('/me', authenticateToken, getMe);

/**
 * PUT /api/auth/me/password
 * Cambiar contraseña del usuario logeado
 * Body: { currentPassword, newPassword }
 */
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('La contraseña actual es requerida'),
  body('newPassword')
    .notEmpty()
    .withMessage('La nueva contraseña es requerida')
    .isLength({ min: 6 })
    .withMessage('La nueva contraseña debe tener al menos 6 caracteres'),
];
router.put('/me/password', authenticateToken, changePasswordValidation, changePasswordHandler);

/**
 * GET /api/auth/onboarding-survey
 * Obtener encuesta de onboarding del usuario (si la completó).
 */
router.get('/onboarding-survey', authenticateToken, getOnboardingSurvey);

/**
 * POST /api/auth/onboarding-survey
 * Guardar encuesta de onboarding. Body: { business_type?, business_size?, product_line?, age? }
 */
const onboardingSurveyValidation = [
  body('business_type').optional().trim().isLength({ max: 255 }),
  body('business_size').optional().trim().isLength({ max: 100 }),
  body('product_line').optional().trim(),
  body('age').optional().isInt({ min: 1, max: 120 }).toInt(),
];
router.post('/onboarding-survey', authenticateToken, onboardingSurveyValidation, saveOnboardingSurvey);

export default router;
