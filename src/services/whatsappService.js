/**
 * Servicio para enviar mensajes por WhatsApp Cloud API.
 * Usa las mismas variables de entorno que el webhook: WS_token, WHATSAPP_PHONE_NUMBER_ID.
 *
 * IMPORTANTE - Regla de 24 horas de WhatsApp:
 * Solo puedes enviar mensajes de texto libres al cliente dentro de las 24 horas
 * desde su último mensaje a tu número. Pasado ese tiempo, solo se pueden enviar
 * plantillas (templates) aprobadas por Meta. Si el mensaje "se envía" pero no llega,
 * suele ser porque la conversación está fuera de esa ventana.
 */

const GRAPH_API_VERSION = 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Envía un mensaje de texto por WhatsApp Cloud API.
 * @param {string} toPhone - Número del destinatario (con o sin +; se normaliza a solo dígitos)
 * @param {string} text - Cuerpo del mensaje
 * @returns {Promise<{ messageId?: string }>} messageId si la API lo devuelve (para rastreo)
 * @throws {Error} Si falta configuración o la API falla
 */
export async function sendWhatsAppText(toPhone, text) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WS_token;

  if (!phoneNumberId || !token) {
    throw new Error('Configuración de WhatsApp incompleta (WHATSAPP_PHONE_NUMBER_ID o WS_token)');
  }

  const to = String(toPhone || '').replace(/\D/g, '');
  if (!to) {
    throw new Error('Número de teléfono inválido');
  }

  const url = `${GRAPH_BASE}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (res.ok) {
    try {
      const data = await res.json();
      const messageId = data?.messages?.[0]?.id;
      if (messageId) {
        console.log(`[whatsapp] Mensaje enviado a ...${to.slice(-4)} message_id=${messageId}`);
      }
      return { messageId };
    } catch {
      return {};
    }
  }

  const errText = await res.text();
  let message = `WhatsApp API ${res.status}`;
  try {
    const data = JSON.parse(errText);
    const err = data?.error;
    if (err?.code === 100 && (err?.error_subcode === 33 || err?.message?.includes('does not exist') || err?.message?.includes('missing permissions'))) {
      message = 'El número de WhatsApp Business no está disponible o el token no tiene permisos. Revisa WHATSAPP_PHONE_NUMBER_ID y el token (WS_token) en Meta for Developers > WhatsApp > Configuración de la API.';
    } else if (err?.message) {
      message = err.message;
    } else {
      message = errText.slice(0, 200);
    }
  } catch {
    message = errText.slice(0, 200) || message;
  }
  throw new Error(message);
}

/**
 * Envía un mensaje de plantilla (template) por WhatsApp Cloud API.
 * Útil cuando la conversación está fuera de la ventana de 24h - solo se pueden enviar templates aprobados.
 * @param {string} toPhone - Número del destinatario (con o sin +; se normaliza)
 * @param {string} templateName - Nombre del template (ej. cuenta_por_cobrar)
 * @param {string[]} bodyParams - Parámetros del body en orden ({{1}}, {{2}}, ...). Máx 1024 chars cada uno.
 * @param {string} [languageCode='es']
 * @param {string[]} [headerParams] - Parámetros del header en orden ({{1}}, ...). Opcional.
 * @returns {Promise<{ messageId?: string }>}
 */
export async function sendWhatsAppTemplate(toPhone, templateName, bodyParams = [], languageCode = 'es', headerParams = null) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WS_token;

  if (!phoneNumberId || !token) {
    throw new Error('Configuración de WhatsApp incompleta (WHATSAPP_PHONE_NUMBER_ID o WS_token)');
  }

  const to = String(toPhone || '').replace(/\D/g, '');
  if (!to) {
    throw new Error('Número de teléfono inválido');
  }

  // WhatsApp: param text cannot have new-line/tab or more than 4 consecutive spaces (error 132018)
  const toTextParam = (text) => {
    let value = String(text ?? '').trim();
    value = value.replace(/[\r\n\t]+/g, ' ').replace(/ {5,}/g, '    ');
    const safe = value.length > 0 ? value : '—';
    return { type: 'text', text: safe.slice(0, 1024) };
  };

  const bodyParameters = (Array.isArray(bodyParams) ? bodyParams : []).map(toTextParam);
  const headerParameters = Array.isArray(headerParams) && headerParams.length > 0
    ? headerParams.map(toTextParam)
    : null;

  const components = [];
  if (headerParameters && headerParameters.length > 0) {
    components.push({ type: 'header', parameters: headerParameters });
  }
  if (bodyParameters.length > 0) {
    components.push({ type: 'body', parameters: bodyParameters });
  }

  const url = `${GRAPH_BASE}/${phoneNumberId}/messages`;
  const code = process.env.WHATSAPP_TEMPLATE_LANGUAGE
    || (languageCode && languageCode.includes('_') ? languageCode : languageCode || 'es');
  // Según https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
  // y https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/TemplateObject/
  // el objeto template debe tener: name, language (policy + code), components
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: {
        policy: 'deterministic',
        code,
      },
      components: components.length > 0 ? components : [],
    },
  };

  console.log(JSON.stringify(payload, null, 2));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    try {
      const data = await res.json();
      const messageId = data?.messages?.[0]?.id;
      if (messageId) {
        console.log(`[whatsapp] Template ${templateName} enviado a ...${to.slice(-4)} message_id=${messageId}`);
      }
      return { messageId };
    } catch {
      return {};
    }
  }

  const errText = await res.text();
  let message = `WhatsApp API ${res.status}`;
  try {
    const data = JSON.parse(errText);
    const err = data?.error;
    if (err?.message) message = err.message;
  } catch {
    message = errText.slice(0, 200) || message;
  }
  
  throw new Error(message);
}
