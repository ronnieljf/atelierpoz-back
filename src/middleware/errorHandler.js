/**
 * Middleware para manejo de errores
 */

export function errorHandler(err, req, res, next) {
  // Errores de Multer (subida de archivos) — log detallado para depurar móvil/PC
  if (err.code === 'LIMIT_FILE_SIZE') {
    console.error('[upload] Error Multer: archivo demasiado grande (límite 10MB).', err.message);
  } else if (err.code === 'LIMIT_FILE_COUNT') {
    console.error('[upload] Error Multer: demasiados archivos (máx. 45).', err.message);
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    console.error('[upload] Error Multer: campo inesperado (debe ser "files").', err.message);
  } else if (err.code && String(err.code).startsWith('LIMIT_')) {
    console.error('[upload] Error Multer:', err.code, err.message);
  } else {
    console.error('Error:', err);
  }

  // Error de validación
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Error de validación',
      message: err.message,
    });
  }

  // Error de Multer (subida)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: 'Archivo demasiado grande. Máximo 10MB por imagen.',
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: err.message || 'Error en la subida de archivos.',
    });
  }

  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Token inválido',
    });
  }

  // Error de base de datos
  if (err.code === '23505') { // Unique violation
    return res.status(409).json({
      success: false,
      error: 'El registro ya existe',
    });
  }

  // Error genérico
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
