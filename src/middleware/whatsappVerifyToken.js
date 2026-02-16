/**
 * Middleware para rutas consumidas por WhatsApp.
 * Valida que el request incluya el WHATSAPP_VERIFY_TOKEN correcto.
 * El token puede enviarse en el header X-WhatsApp-Verify-Token o en query/body como verify_token.
 */

export function whatsappVerifyToken(req, res, next) {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN || process.env.WS_verify_token || '';

  if (!expected) {
    return res.status(503).json({
      success: false,
      error: 'WhatsApp verify token no configurado en el servidor',
    });
  }

  const token =
    req.headers['x-whatsapp-verify-token'] ||
    req.query?.verify_token ||
    req.body?.verify_token ||
    '';

  if (token !== expected) {
    return res.status(403).json({
      success: false,
      error: 'Token de verificación inválido',
    });
  }

  next();
}
