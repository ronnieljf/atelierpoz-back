/**
 * Servicio de envío de correos electrónicos vía SMTP
 * Usa variables de entorno para la configuración
 *
 * Variables requeridas en .env:
 *   SMTP_HOST       - Host del servidor SMTP (ej: smtp.gmail.com)
 *   SMTP_PORT       - Puerto (587 para TLS, 465 para SSL)
 *   SMTP_SECURE     - true para SSL (puerto 465), false para STARTTLS (587)
 *   SMTP_USER       - Usuario/email para autenticación
 *   SMTP_PASS       - Contraseña o app password
 *   SMTP_FROM       - Email remitente (ej: "Atelier Poz <noreply@atelierpoz.com>")
 */

import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[email] SMTP no configurado (SMTP_HOST, SMTP_USER, SMTP_PASS). Los correos no se enviarán.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return transporter;
}

/**
 * Envía un correo
 * @param {Object} options
 * @param {string} options.to - Destinatario
 * @param {string} options.subject - Asunto
 * @param {string} options.text - Cuerpo en texto plano
 * @param {string} [options.html] - Cuerpo en HTML (opcional)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export async function sendEmail({ to, subject, text, html }) {
  const transport = getTransporter();
  if (!transport) {
    return { success: false, error: 'SMTP no configurado' };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@atelierpoz.com';

  try {
    const info = await transport.sendMail({
      from,
      to: to.trim().toLowerCase(),
      subject,
      text: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
      html: html || undefined,
    });

    console.log(`[email] Enviado a ${to} messageId=${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[email] Error enviando a', to, err?.message || err);
    return {
      success: false,
      error: err?.message || 'Error al enviar correo',
    };
  }
}

/**
 * Envía código de verificación para registro
 * @param {string} email - Email del destinatario
 * @param {string} code - Código de 6 dígitos
 * @param {string} [userName] - Nombre del usuario (opcional)
 */
export async function sendVerificationCode(email, code, userName = '') {
  const subject = 'Verifica tu correo - Atelier Poz';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verifica tu correo</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#0a0a0a;color:#e5e5e5;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;font-weight:600;color:#fff;margin:0;">Atelier Poz</h1>
      <p style="font-size:14px;color:#a3a3a3;margin-top:8px;">Plataforma para tu negocio</p>
    </div>
    <div style="background:#171717;border:1px solid #262626;border-radius:16px;padding:32px;">
      <h2 style="font-size:18px;font-weight:600;color:#fff;margin:0 0 16px;">Verifica tu correo electrónico</h2>
      ${userName ? `<p style="color:#a3a3a3;font-size:15px;margin:0 0 24px;">Hola ${userName},</p>` : ''}
      <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Usa el siguiente código para completar tu registro:
      </p>
      <div style="background:#262626;border-radius:12px;padding:20px;text-align:center;margin:24px 0;">
        <span style="font-size:28px;font-weight:700;letter-spacing:8px;color:#e14d4d;">${code}</span>
      </div>
      <p style="color:#737373;font-size:13px;line-height:1.5;margin:0;">
        El código expira en 15 minutos. Si no solicitaste este registro, ignora este correo.
      </p>
    </div>
    <p style="text-align:center;color:#525252;font-size:12px;margin-top:24px;">
      © ${new Date().getFullYear()} Atelier Poz · Todos los derechos reservados
    </p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    to: email,
    subject,
    text: `Tu código de verificación es: ${code}. Expira en 15 minutos.`,
    html,
  });
}

/**
 * Envía código de verificación para recuperación de contraseña
 * @param {string} email - Email del destinatario
 * @param {string} code - Código de 6 dígitos
 * @param {string} [userName] - Nombre del usuario (opcional)
 */
export async function sendPasswordResetCode(email, code, userName = '') {
  const subject = 'Recupera tu contraseña - Atelier Poz';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperar contraseña</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#0a0a0a;color:#e5e5e5;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;font-weight:600;color:#fff;margin:0;">Atelier Poz</h1>
      <p style="font-size:14px;color:#a3a3a3;margin-top:8px;">Plataforma para tu negocio</p>
    </div>
    <div style="background:#171717;border:1px solid #262626;border-radius:16px;padding:32px;">
      <h2 style="font-size:18px;font-weight:600;color:#fff;margin:0 0 16px;">Recuperar contraseña</h2>
      ${userName ? `<p style="color:#a3a3a3;font-size:15px;margin:0 0 24px;">Hola ${userName},</p>` : ''}
      <p style="color:#a3a3a3;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente código:
      </p>
      <div style="background:#262626;border-radius:12px;padding:20px;text-align:center;margin:24px 0;">
        <span style="font-size:28px;font-weight:700;letter-spacing:8px;color:#e14d4d;">${code}</span>
      </div>
      <p style="color:#737373;font-size:13px;line-height:1.5;margin:0;">
        El código expira en 15 minutos. Si no solicitaste este cambio, ignora este correo. Tu contraseña no se modificará.
      </p>
    </div>
    <p style="text-align:center;color:#525252;font-size:12px;margin-top:24px;">
      © ${new Date().getFullYear()} Atelier Poz · Todos los derechos reservados
    </p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    to: email,
    subject,
    text: `Tu código para recuperar contraseña es: ${code}. Expira en 15 minutos.`,
    html,
  });
}
