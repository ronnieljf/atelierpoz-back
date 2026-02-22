/**
 * Middleware de Multer para manejar subida de archivos
 */

import multer from 'multer';

// Configurar multer para usar memoria (buffer)
const storage = multer.memoryStorage();

// Configurar límites
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo por archivo
    files: 45, // Máximo 45 archivos a la vez por producto
  },
  fileFilter: (req, file, cb) => {
    // Validar tipo de archivo
    const validTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
    ];

    if (validTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, WebP, GIF, SVG)'), false);
    }
  },
});

export const uploadMiddleware = upload.array('files', 45);

/** Un solo archivo para logo de tienda (campo "logo") */
export const uploadLogoMiddleware = upload.single('logo');
