/**
 * Rutas de autenticación
 */

import express from 'express';
import { body } from 'express-validator';
import { login, verifyToken, getMe, changePasswordHandler } from '../controllers/authController.js';
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

export default router;
