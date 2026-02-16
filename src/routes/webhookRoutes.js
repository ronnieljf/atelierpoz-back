/**
 * Rutas de webhooks (sin autenticación).
 * Rutas /whatsapp/receivables-pending y /whatsapp/orders-pending requieren WHATSAPP_VERIFY_TOKEN.
 */

import express from 'express';
import { whatsappWebhookVerify, whatsappWebhookPost, getReceivablesPendingForPhone, getOrdersPendingForPhone } from '../controllers/webhookController.js';
import { geminiWebhookVerify, geminiWebhookPost } from '../controllers/geminiWebhookController.js';
import { whatsappVerifyToken } from '../middleware/whatsappVerifyToken.js';

const router = express.Router();

/**
 * GET /api/webhooks/whatsapp
 * Verificación del webhook de Meta (hub.mode, hub.verify_token, hub.challenge).
 * NUEVO: Ahora usa el webhook con Gemini AI para conversaciones inteligentes.
 */
router.get('/whatsapp', geminiWebhookVerify);

/**
 * POST /api/webhooks/whatsapp
 * Recibe mensajes de WhatsApp y procesa con Gemini AI para conversaciones naturales.
 * NUEVO: Reemplaza el webhook básico por uno con IA conversacional.
 */
router.post('/whatsapp', geminiWebhookPost);

/**
 * GET /api/webhooks/whatsapp-legacy
 * Verificación del webhook LEGACY (comandos básicos, sin IA).
 */
router.get('/whatsapp-legacy', whatsappWebhookVerify);

/**
 * POST /api/webhooks/whatsapp-legacy
 * Webhook LEGACY con comandos básicos (sin Gemini).
 * Mantenido por compatibilidad, pero se recomienda usar /whatsapp con Gemini.
 */
router.post('/whatsapp-legacy', whatsappWebhookPost);

/**
 * GET/POST /api/webhooks/whatsapp/receivables-pending
 * Consumido por WhatsApp. Header X-WhatsApp-Verify-Token (o query/body verify_token) requerido.
 * Query o body: phone → cuentas por cobrar pendientes de las tiendas del store_user con ese teléfono.
 */
router.get('/whatsapp/receivables-pending', whatsappVerifyToken, getReceivablesPendingForPhone);
router.post('/whatsapp/receivables-pending', whatsappVerifyToken, getReceivablesPendingForPhone);

/**
 * GET/POST /api/webhooks/whatsapp/orders-pending
 * Consumido por WhatsApp. Header X-WhatsApp-Verify-Token (o query/body verify_token) requerido.
 * Query o body: phone → pedidos pendientes de las tiendas del store_user con ese teléfono.
 */
router.get('/whatsapp/orders-pending', whatsappVerifyToken, getOrdersPendingForPhone);
router.post('/whatsapp/orders-pending', whatsappVerifyToken, getOrdersPendingForPhone);

export default router;
