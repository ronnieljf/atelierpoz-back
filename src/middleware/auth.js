/**
 * Middleware de autenticación JWT
 */

import jwt from 'jsonwebtoken';

/**
 * Middleware para verificar el token JWT
 * IMPORTANTE: Este middleware solo debe aplicarse a rutas que requieren autenticación
 * Las rutas públicas deben estar definidas ANTES de usar este middleware
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token de autenticación requerido',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Agregar información del usuario al request
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: 'Token inválido o expirado',
    });
  }
}

/**
 * Middleware opcional - verifica token si existe, pero no falla si no existe
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Ignorar error si el token es inválido en auth opcional
    }
  }

  next();
}

/**
 * Middleware para verificar que el usuario sea admin
 * Debe usarse después de authenticateToken
 */
export function requireAdmin(req, res, next) {
  // authenticateToken ya debe haber agregado req.user
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Autenticación requerida',
    });
  }

  // Verificar que el rol sea 'admin'
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Se requieren permisos de administrador',
    });
  }

  next();
}
