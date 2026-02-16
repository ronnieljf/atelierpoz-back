/**
 * Rutas de autenticación
 */

import express from 'express';
import { body } from 'express-validator';
import { login, verifyToken, getMe, changePasswordHandler, getAllUsersHandler, createUserHandler, updateUserHandler } from '../controllers/authController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

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

/**
 * GET /api/auth/users
 * Obtener todos los usuarios (solo para admins)
 */
router.get('/users', authenticateToken, requireAdmin, getAllUsersHandler);

/**
 * POST /api/auth/users
 * Crear un nuevo usuario (solo para admins)
 */
const createUserValidation = [
  body('email')
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Contraseña es requerida')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('El nombre no puede estar vacío'),
  body('role')
    .optional()
    .isIn(['admin', 'user'])
    .withMessage('El rol debe ser "admin" o "user"'),
];
router.post('/users', authenticateToken, requireAdmin, createUserValidation, createUserHandler);

/**
 * PUT /api/auth/users/:id
 * Actualizar un usuario (solo para admins)
 */
const updateUserValidation = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail(),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('name')
    .optional()
    .trim(),
  body('role')
    .optional()
    .isIn(['admin', 'user'])
    .withMessage('El rol debe ser "admin" o "user"'),
];
router.put('/users/:id', authenticateToken, requireAdmin, updateUserValidation, updateUserHandler);

export default router;
