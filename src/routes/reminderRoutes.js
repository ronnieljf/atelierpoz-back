/**
 * Rutas de recordatorios: configuración y notificaciones in-app.
 */

import express from 'express';
import { getSettings, updateSettings, getNotifications, dismissNotification, runNow } from '../controllers/reminderController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.get('/notifications', getNotifications);
router.post('/notifications/:id/dismiss', dismissNotification);
router.post('/run-now', runNow);

export default router;
