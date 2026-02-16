/**
 * Webhook de WhatsApp con Groq AI - Conversaciones inteligentes.
 * Este es el nuevo webhook que reemplaza al básico con comandos.
 */

import { processMessageWithGroq } from '../services/groqService.js';
import { getStoresWithUserIdByPhoneNumber, getStoreNameAndPhone } from '../services/storeService.js';
import { generateToken, getUserById } from '../services/authService.js';
import { getPendingReceivablesByCustomerPhone } from '../services/receivableService.js';
import { findStoresByClientPhone } from '../services/clientService.js';

const GRAPH_API_VERSION = 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const MAX_MESSAGE_LENGTH = 4096; // límite WhatsApp
const WEB_BUTTON_LABEL = 'Ver en la web 🌐';

/**
 * Verificación del webhook (Meta envía GET con hub.mode, hub.verify_token, hub.challenge).
 * Idéntico al webhook anterior.
 */
export function geminiWebhookVerify(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.WS_verify_token || '';
  if (mode === 'subscribe' && token === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
}

/**
 * Recibe mensajes de WhatsApp y procesa con Gemini AI
 */
export async function geminiWebhookPost(req, res) {
  res.status(200).send('OK');

  const body = req.body;
  if (!body?.object || body.object !== 'whatsapp_business_account') {
    return;
  }

  const entries = body.entry;
  if (!Array.isArray(entries)) return;

  const token = process.env.WS_token;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    console.error('[groq-webhook] Falta WS_token o WHATSAPP_PHONE_NUMBER_ID en .env');
    return;
  }

  for (const entry of entries) {
    const changes = entry.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (change.field !== 'messages') continue;
      const value = change.value;
      if (!value?.messages) continue;

      for (const message of value.messages) {
        const from = message.from;
        if (!from) continue;

        // Solo procesar mensajes de texto
        const messageText = (message.type === 'text' && message.text?.body)
          ? String(message.text.body).trim()
          : '';

        if (!messageText) {
          console.log(`[groq-webhook] Mensaje no-texto ignorado de ${from}`);
          continue;
        }

        console.log(`[groq-webhook] Mensaje de ${from}: ${messageText}`);

        try {
          // Obtener información del usuario: solo procesar si el teléfono está asociado a una tienda
          const storesWithUser = await getStoresWithUserIdByPhoneNumber(String(from));
          if (storesWithUser.length === 0) {
            const fromStr = String(from);
            let messageToSend = null;

            // 1) ¿Tiene cuentas pendientes con algún store?
            const pendingByStore = await getPendingReceivablesByCustomerPhone(fromStr);
            if (pendingByStore.length > 0) {
              const parts = [];
              const amountParts = [];
              for (const entry of pendingByStore) {
                const { name, phoneNumber } = await getStoreNameAndPhone(entry.storeId);
                const phoneDisplay = phoneNumber ? ` (${phoneNumber})` : '';
                parts.push(`${name}${phoneDisplay}`);
                const amounts = Object.entries(entry.pendingByCurrency)
                  .map(([cur, amt]) => `${amt} ${cur}`)
                  .join(', ');
                amountParts.push(`${amounts} con ${name}`);
              }
              messageToSend =
                'Hola 👋 No podemos atender mensajes en este número. Tienes cuenta(s) pendiente(s) con: ' +
                parts.join('; ') +
                '. Monto pendiente: ' +
                amountParts.join('; ') +
                '. Por favor escribe directamente a la tienda o tiendas para coordinar.';
            } else {
              // 2) ¿Es cliente de alguna tienda?
              const storesAsClient = await findStoresByClientPhone(fromStr);
              if (storesAsClient.length > 0) {
                const parts = [];
                for (const s of storesAsClient) {
                  const { name, phoneNumber } = await getStoreNameAndPhone(s.storeId);
                  parts.push(phoneNumber ? `${name} (${phoneNumber})` : name);
                }
                messageToSend =
                  'Hola 👋 No podemos atender mensajes en este número. Puedes escribir directamente a la(s) tienda(s): ' +
                  parts.join('; ') +
                  '.';
              }
            }

            if (!messageToSend) {
              messageToSend =
                'Hola 👋 Gracias por escribir. No podemos atender mensajes en este número porque no está asociado a una tienda autorizada. Si eres cliente, por favor responde al número de la tienda donde realizaste tu pedido. Si necesitas ayuda para dar de alta tu tienda, contáctanos por otro medio.';
            }
            await sendWhatsAppText(phoneNumberId, from, messageToSend, token);
            console.log(`[groq-webhook] Remitente ${from} no asociado a tienda, respuesta enviada.`);
            continue;
          }

          let loginToken = null;
          if (storesWithUser.length > 0) {
            const firstStore = storesWithUser[0];
            const user = await getUserById(firstStore.userId);
            if (user) {
              loginToken = generateToken({
                id: user.id,
                email: user.email,
                role: user.role,
              });
            }
          }

          // Procesar con Groq
          const result = await processMessageWithGroq(from, messageText);
          
          let responseText = result.response || 'Lo siento, no pude procesar tu mensaje.';
          
          // Verificar si es un error de rate limit
          const isRateLimitError = result.error === 'rate_limit_exceeded';
          
          // Truncar si es muy largo (excepto para rate limit que ya está bien formateado)
          if (!isRateLimitError && responseText.length > MAX_MESSAGE_LENGTH) {
            const truncateSuffix = '\n\n...(mensaje recortado)';
            responseText = responseText.slice(0, MAX_MESSAGE_LENGTH - truncateSuffix.length) + truncateSuffix;
          }

          // Enviar respuesta principal
          await sendWhatsAppText(phoneNumberId, from, responseText, token);

          // Si hay rate limit y hay resúmenes, enviarlos como mensajes separados
          if (isRateLimitError && result.summaries && Array.isArray(result.summaries)) {
            console.log(`[groq-webhook] Enviando ${result.summaries.length} resúmenes adicionales...`);
            
            // Esperar un poco antes de enviar los resúmenes
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            for (const summary of result.summaries) {
              if (summary && summary.trim()) {
                try {
                  // Truncar si es muy largo
                  let summaryText = summary;
                  if (summaryText.length > MAX_MESSAGE_LENGTH) {
                    const truncateSuffix = '\n\n...(mensaje recortado, ver más en el panel web)';
                    summaryText = summaryText.slice(0, MAX_MESSAGE_LENGTH - truncateSuffix.length) + truncateSuffix;
                  }
                  
                  await sendWhatsAppText(phoneNumberId, from, summaryText, token);
                  // Pequeña pausa entre mensajes
                  await new Promise(resolve => setTimeout(resolve, 500));
                } catch (summaryErr) {
                  console.error('[groq-webhook] Error enviando resumen:', summaryErr);
                }
              }
            }
          }

          // Para rate limit, siempre enviar botón web (incluso sin login token)
          // Para otros casos, solo si hay login token
          if (isRateLimitError || (loginToken && result.webButtonUrl)) {
            const webUrl = process.env.DOMAIN || 'https://atelierpoz.com';
            const adminUrl = loginToken 
              ? `${webUrl}/admin?token=${encodeURIComponent(loginToken)}`
              : `${webUrl}/admin`;
            
            const buttonMessage = isRateLimitError
              ? 'Mientras tanto, usa el panel web 👇'
              : 'Gestiona tu tienda desde el panel web 👇';
            
            await sendWhatsAppCtaUrl(
              phoneNumberId,
              from,
              buttonMessage,
              WEB_BUTTON_LABEL,
              adminUrl,
              token
            );
          }

          console.log(`[groq-webhook] Respuesta enviada a ${from}`);
          
        } catch (err) {
          console.error('[groq-webhook] Error procesando mensaje:', err);
          try {
            await sendWhatsAppText(
              phoneNumberId, 
              from, 
              '❌ Hubo un error procesando tu mensaje. Por favor intenta de nuevo en unos momentos.', 
              token
            );
          } catch (sendErr) {
            console.error('[groq-webhook] Error enviando mensaje de error:', sendErr);
          }
        }
      }
    }
  }
}

/**
 * Envía un mensaje de texto por WhatsApp Cloud API.
 * @param {string} phoneNumberId - ID del número de negocio
 * @param {string} to - Número del destinatario
 * @param {string} text - Cuerpo del mensaje
 * @param {string} accessToken - Token Bearer
 */
async function sendWhatsAppText(phoneNumberId, to, text, accessToken) {
  const url = `${GRAPH_BASE}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(to).replace(/\D/g, ''),
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${errText}`);
  }
}

/**
 * Envía un mensaje interactivo con botón CTA (link) por WhatsApp Cloud API.
 * @param {string} phoneNumberId - ID del número de negocio
 * @param {string} to - Número del destinatario
 * @param {string} bodyText - Texto del cuerpo del mensaje
 * @param {string} buttonLabel - Texto del botón
 * @param {string} buttonUrl - URL del botón
 * @param {string} accessToken - Token Bearer
 */
async function sendWhatsAppCtaUrl(phoneNumberId, to, bodyText, buttonLabel, buttonUrl, accessToken) {
  const url = `${GRAPH_BASE}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: String(to).replace(/\D/g, ''),
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: bodyText },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: buttonLabel.slice(0, 20),
            url: buttonUrl,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${errText}`);
  }
}

/**
 * Envía un mensaje con lista interactiva (hasta 10 opciones)
 * @param {string} phoneNumberId - ID del número de negocio
 * @param {string} to - Número del destinatario
 * @param {string} bodyText - Texto del cuerpo
 * @param {string} buttonText - Texto del botón de la lista
 * @param {Array} sections - Secciones con opciones [{title, rows: [{id, title, description}]}]
 * @param {string} accessToken - Token Bearer
 */
async function sendWhatsAppList(phoneNumberId, to, bodyText, buttonText, sections, accessToken) {
  const url = `${GRAPH_BASE}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: String(to).replace(/\D/g, ''),
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: buttonText.slice(0, 20),
          sections,
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${errText}`);
  }
}

/**
 * Envía un mensaje con botones de respuesta rápida (hasta 3 botones)
 * @param {string} phoneNumberId - ID del número de negocio
 * @param {string} to - Número del destinatario
 * @param {string} bodyText - Texto del cuerpo
 * @param {Array} buttons - Botones [{id, title}]
 * @param {string} accessToken - Token Bearer
 */
async function sendWhatsAppButtons(phoneNumberId, to, bodyText, buttons, accessToken) {
  const url = `${GRAPH_BASE}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: String(to).replace(/\D/g, ''),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map(btn => ({
            type: 'reply',
            reply: {
              id: btn.id,
              title: btn.title.slice(0, 20),
            },
          })),
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${errText}`);
  }
}
