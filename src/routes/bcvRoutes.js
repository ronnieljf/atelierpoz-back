/**
 * Rutas para endpoints relacionados con BCV
 */

import express from 'express';
import { getBCVHTMLHandler, getDolarHandler } from '../controllers/bcvController.js';

const router = express.Router();

// Endpoint temporal para ver el HTML del BCV
router.get('/html', getBCVHTMLHandler);

// Endpoint para obtener el elemento con id "dolar"
router.get('/dolar', getDolarHandler);

export default router;
