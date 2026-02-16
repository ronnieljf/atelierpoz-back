/**
 * Rutas para integración con Meta/Instagram
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as metaController from '../controllers/metaController.js';

const router = express.Router();

// Iniciar autorización OAuth - requiere autenticación
router.get('/auth/initiate', authenticateToken, metaController.initiateAuthHandler);

// Callback de OAuth - no requiere autenticación (Meta redirige aquí)
router.get('/callback', metaController.callbackHandler);

// Obtener estado de la integración
router.get('/status', metaController.getIntegrationStatusHandler);

// Desconectar integración
router.delete('/disconnect', metaController.disconnectHandler);

export default router;
