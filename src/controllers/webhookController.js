/**
 * Webhook de WhatsApp (Meta Cloud API).
 * - GET: verificación del webhook (hub.mode, hub.verify_token, hub.challenge).
 * - POST: recibe mensajes; busca store_users por teléfono del remitente, obtiene cuentas por cobrar de esas tiendas y envía un reporte por WhatsApp.
 *
 * Variables de entorno:
 * - WS_token: token de acceso de Meta (Bearer) para enviar mensajes.
 * - WHATSAPP_PHONE_NUMBER_ID: ID del número de WhatsApp Business (ej. 917482631457452).
 * - WHATSAPP_VERIFY_TOKEN o WS_verify_token: token que configuras en Meta; debe coincidir para GET.
 */

import { getStoreIdsByPhoneNumber, getStoresWithUserIdByPhoneNumber } from '../services/storeService.js';
import {
  getReceivablesByStoreWithPayments,
  createReceivableFromRequest,
  getReceivableByStoreAndReceivableNumber,
  createReceivablePayment,
  updateReceivable,
} from '../services/receivableService.js';
import {
  getRequestsByStore,
  getRequestByStoreAndOrderNumber,
  getPendingRequestByStoreAndOrderNumber,
  updateRequestStatus,
} from '../services/requestService.js';
import { generateToken, getUserById } from '../services/authService.js';

// ─── Endpoints consumidos por WhatsApp (requieren middleware whatsappVerifyToken) ───

/**
 * GET/POST /api/webhooks/whatsapp/receivables-pending
 * Query o body: phone (teléfono del store_user).
 * Devuelve las cuentas por cobrar pendientes de las tiendas asociadas a ese teléfono.
 */
export async function getReceivablesPendingForPhone(req, res, next) {
  try {
    const phone = req.query?.phone ?? req.body?.phone ?? '';
    const phoneStr = String(phone).trim();
    if (!phoneStr) {
      return res.status(400).json({
        success: false,
        error: 'Falta el parámetro phone (query o body)',
      });
    }

    const stores = await getStoreIdsByPhoneNumber(phoneStr);
    if (stores.length === 0) {
      return res.json({
        success: true,
        stores: [],
        message: 'No se encontraron tiendas para este número',
      });
    }

    const result = [];
    for (const { storeId, storeName } of stores) {
      const all = await getReceivablesByStoreWithPayments(storeId);
      const receivables = all.filter((r) => r.status === 'pending').map((r) => ({
        id: r.id,
        storeId: r.storeId,
        receivableNumber: r.receivableNumber,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        description: r.description,
        amount: r.amount,
        currency: r.currency,
        totalPaid: r.totalPaid,
        pendingAmount: Math.max(0, r.amount - (r.totalPaid || 0)),
        requestId: r.requestId,
        createdAt: r.createdAt,
      }));
      result.push({
        storeId,
        storeName: storeName || null,
        receivables,
      });
    }

    res.json({
      success: true,
      stores: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET/POST /api/webhooks/whatsapp/orders-pending
 * Query o body: phone (teléfono del store_user).
 * Devuelve los pedidos pendientes de las tiendas asociadas a ese teléfono.
 */
export async function getOrdersPendingForPhone(req, res, next) {
  try {
    const phone = req.query?.phone ?? req.body?.phone ?? '';
    const phoneStr = String(phone).trim();
    if (!phoneStr) {
      return res.status(400).json({
        success: false,
        error: 'Falta el parámetro phone (query o body)',
      });
    }

    const stores = await getStoreIdsByPhoneNumber(phoneStr);
    if (stores.length === 0) {
      return res.json({
        success: true,
        stores: [],
        message: 'No se encontraron tiendas para este número',
      });
    }

    const result = [];
    for (const { storeId, storeName } of stores) {
      const { requests } = await getRequestsByStore(storeId, { status: 'pending' });
      const orders = (requests || []).map((r) => ({
        id: r.id,
        storeId: r.store_id,
        orderNumber: r.order_number,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        customerEmail: r.customer_email,
        items: r.items,
        customMessage: r.custom_message,
        total: parseFloat(r.total),
        currency: r.currency || 'USD',
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        hasReceivable: r.has_receivable ?? false,
      }));
      result.push({
        storeId,
        storeName: storeName || null,
        orders,
      });
    }

    res.json({
      success: true,
      stores: result,
    });
  } catch (err) {
    next(err);
  }
}

const GRAPH_API_VERSION = 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const MAX_MESSAGE_LENGTH = 4096; // límite WhatsApp
const WEB_URL = process.env.DOMAIN || 'https://atelierpoz.com';
const WEB_BUTTON_LABEL = 'Ir a la web';

/** Mensaje de ayuda con todos los comandos (cuando escribe algo no reconocido y es de una tienda). */
function getHelpMessageForStoreUser() {
  return (
    '📩 *No reconocí tu mensaje.* Puedes usar estos comandos (escríbelos tal cual, en minúsculas):\n\n' +
    '*Consultar:*\n' +
    '• *pedidos* — ver pedidos pendientes\n' +
    '• *cuentas* — ver cuentas por cobrar pendientes\n\n' +
    '*Acciones:*\n' +
    '• *convertir pedido N* — convertir el pedido N en cuenta por cobrar (ej: convertir pedido 3)\n' +
    '• *abonar N MONTO* — abono a la cuenta N; puedes añadir una nota al final (ej: abonar 2 50 pago parcial)\n' +
    '• *completar N* — marcar la cuenta N como cobrada\n' +
    '• *cancelar N* — cancelar la cuenta N\n' +
    '• *cancelar pedido N* — cancelar el pedido N\n\n' +
    '_N = número que ves en el reporte (Pedido #3, Cuenta #2)._'
  );
}

/**
 * Verificación del webhook (Meta envía GET con hub.mode, hub.verify_token, hub.challenge).
 * Si hub.verify_token coincide con WHATSAPP_VERIFY_TOKEN (o WS_verify_token), devuelve hub.challenge.
 */
export function whatsappWebhookVerify(req, res) {
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
 * Recibe mensajes de WhatsApp; busca store_users por teléfono del remitente, obtiene cuentas por cobrar de esas tiendas y envía el reporte por WhatsApp.
 */
export async function whatsappWebhookPost(req, res) {
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
    console.error('[webhook/whatsapp] Falta WS_token o WHATSAPP_PHONE_NUMBER_ID en .env');
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

        const messageText = (message.type === 'text' && message.text?.body)
          ? String(message.text.body).trim().toLowerCase()
          : '';

        try {
          const storesWithUser = await getStoresWithUserIdByPhoneNumber(String(from));
          const stores = await getStoreIdsByPhoneNumber(String(from));

          // Generar token de login si es un número válido (para incluir en el botón)
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

          let toSend;
          let sendWebButton = false;
          if (messageText.includes('pedidos') && !/^(convertir|abonar|abono|completar|cobrar|cancelar)/.test(messageText)) {
            const report = await buildOrdersReportForPhone(String(from));
            toSend = report.length > 0 ? report : 'No tienes pedidos pendientes para este número.';
            sendWebButton = report.length > 0;
          } else if (messageText.includes('cuentas') && !/^(convertir|abonar|abono|completar|cobrar|cancelar)/.test(messageText)) {
            const report = await buildReceivablesReportForPhone(String(from));
            toSend = report.length > 0 ? report : 'No tienes cuentas por cobrar pendientes para este número.';
            sendWebButton = report.length > 0;
          } else {

            const convertMatch = messageText.match(/^(?:convertir\s+pedido|pedido\s+a\s+cuenta)\s+(\d+)$/);
            const abonoMatch = messageText.match(/^abonar?\s+(?:cuenta\s+)?(\d+)\s+([\d.,]+)\s*(.*)$/);
            const completarMatch = messageText.match(/^(?:completar|cobrar)\s+(?:cuenta\s+)?(\d+)$/);
            const cancelarRecMatch = messageText.match(/^cancelar\s+(?:cuenta\s+)?(\d+)$/);
            const cancelarPedidoMatch = messageText.match(/^cancelar\s+pedido\s+(\d+)$/);

            if (convertMatch && storesWithUser.length > 0) {
              const orderNum = parseInt(convertMatch[1], 10);
              let done = false;
              for (const { storeId, storeName, userId } of storesWithUser) {
                const request = await getRequestByStoreAndOrderNumber(storeId, orderNum);
                if (request) {
                  await createReceivableFromRequest(request.id, storeId, userId);
                  toSend = `✅ Pedido #${orderNum} convertido a cuenta por cobrar correctamente${storeName ? ` (${storeName})` : ''}.`;
                  done = true;
                  break;
                }
              }
              if (!done) toSend = `No se encontró un pedido pendiente #${orderNum} sin convertir, o ya tiene cuenta por cobrar. Escribe *pedidos* para ver los números.`;
            } else if (abonoMatch && storesWithUser.length > 0) {
              const recNum = parseInt(abonoMatch[1], 10);
              const amountStr = abonoMatch[2].replace(',', '.');
              const amount = parseFloat(amountStr);
              const note = (abonoMatch[3] && String(abonoMatch[3]).trim()) || null;
              if (Number.isNaN(amount) || amount <= 0) {
                toSend = 'El monto del abono debe ser un número mayor que 0. Ejemplo: *abonar 2 50* o *abonar 2 50 pago parcial*';
              } else {
                let done = false;
                for (const { storeId, storeName, userId } of storesWithUser) {
                  const rec = await getReceivableByStoreAndReceivableNumber(storeId, recNum);
                  if (rec && rec.status === 'pending') {
                    await createReceivablePayment(rec.id, storeId, { amount, currency: rec.currency, notes: note }, userId);
                    toSend = `✅ Abono de ${amount.toFixed(2)} ${rec.currency} registrado en la cuenta #${recNum}${storeName ? ` (${storeName})` : ''}${note ? `. Nota: ${note}` : ''}`;
                    done = true;
                    break;
                  }
                }
                if (!done) toSend = `No se encontró una cuenta pendiente #${recNum}. Escribe *cuentas* para ver los números.`;
              }
            } else if (cancelarPedidoMatch && stores.length > 0) {
              const orderNum = parseInt(cancelarPedidoMatch[1], 10);
              let done = false;
              for (const { storeId, storeName } of stores) {
                const request = await getPendingRequestByStoreAndOrderNumber(storeId, orderNum);
                if (request) {
                  await updateRequestStatus(request.id, storeId, 'cancelled');
                  toSend = `✅ Pedido #${orderNum} cancelado${storeName ? ` (${storeName})` : ''}.`;
                  done = true;
                  break;
                }
              }
              if (!done) toSend = `No se encontró un pedido pendiente #${orderNum}. Escribe *pedidos* para ver los números.`;
            } else if (completarMatch && stores.length > 0) {
              const recNum = parseInt(completarMatch[1], 10);
              let done = false;
              for (const { storeId, storeName } of stores) {
                const rec = await getReceivableByStoreAndReceivableNumber(storeId, recNum);
                if (rec && rec.status === 'pending') {
                  await updateReceivable(rec.id, storeId, { status: 'paid' });
                  toSend = `✅ Cuenta #${recNum} marcada como cobrada${storeName ? ` (${storeName})` : ''}.`;
                  done = true;
                  break;
                }
              }
              if (!done) toSend = `No se encontró una cuenta pendiente #${recNum}. Escribe *cuentas* para ver los números.`;
            } else if (cancelarRecMatch && stores.length > 0) {
              const recNum = parseInt(cancelarRecMatch[1], 10);
              let done = false;
              for (const { storeId, storeName } of stores) {
                const rec = await getReceivableByStoreAndReceivableNumber(storeId, recNum);
                if (rec && rec.status === 'pending') {
                  await updateReceivable(rec.id, storeId, { status: 'cancelled' });
                  toSend = `✅ Cuenta #${recNum} cancelada${storeName ? ` (${storeName})` : ''}.`;
                  done = true;
                  break;
                }
              }
              if (!done) toSend = `No se encontró una cuenta pendiente #${recNum}. Escribe *cuentas* para ver los números.`;
            } else {
              toSend = stores.length > 0 ? getHelpMessageForStoreUser() : 'Escribe *pedidos* o *cuentas* para ver información. Si eres dueño de tienda, asocia tu número en la web.';
            }
          }
          if (toSend.length > MAX_MESSAGE_LENGTH) {
            const truncateSuffix = '\n\n...(mensaje recortado)';
            toSend = toSend.slice(0, MAX_MESSAGE_LENGTH - truncateSuffix.length) + truncateSuffix;
          }
          await sendWhatsAppText(phoneNumberId, from, toSend, token);
          if (sendWebButton) {
            // Incluir token en la URL del botón si está disponible
            const adminUrl = loginToken 
              ? `${WEB_URL}/admin?token=${encodeURIComponent(loginToken)}`
              : WEB_URL + '/admin';
            await sendWhatsAppCtaUrl(
              phoneNumberId,
              from,
              'Para ver más detalles o el listado completo entra a la web.',
              WEB_BUTTON_LABEL,
              adminUrl,
              token
            );
          }
        } catch (err) {
          console.error('[webhook/whatsapp] Error:', err.message);
          try {
            await sendWhatsAppText(phoneNumberId, from, 'Hubo un error al generar el reporte. Intenta más tarde.', token);
          } catch (_) { }
        }
      }
    }
  }
}

/**
 * Construye el texto del reporte de cuentas por cobrar para un teléfono (remitente).
 * Busca store_users con ese teléfono y para cada tienda obtiene las receivables con total pagado.
 */
async function buildReceivablesReportForPhone(senderPhone) {
  const stores = await getStoreIdsByPhoneNumber(senderPhone);
  if (stores.length === 0) return '';

  const sections = [];
  for (const { storeId, storeName } of stores) {
    const all = await getReceivablesByStoreWithPayments(storeId);
    const receivables = all.filter((r) => r.status === 'pending');
    if (receivables.length === 0) {
      sections.push(`📌 *${storeName || storeId}*\nSin cuentas por cobrar pendientes.\n`);
      continue;
    }
    let block = `📌 *${storeName || storeId}*\n`;
    let totalAmount = 0;
    let totalPaid = 0;
    let totalPending = 0;
    for (const r of receivables) {
      const pending = Math.max(0, r.amount - r.totalPaid);
      totalAmount += r.amount;
      totalPaid += r.totalPaid;
      totalPending += pending;
      const num = r.receivableNumber != null ? `Cuenta #${r.receivableNumber} — ` : '';
      const cliente = r.customerName || r.customerPhone || '—';
      const tel = r.customerPhone ? ` — tel: ${r.customerPhone}` : '';
      block += `• ${num}${cliente}${tel}: ${r.amount} ${r.currency} (pagado: ${r.totalPaid.toFixed(2)}, pendiente: ${pending.toFixed(2)})\n`;
    }
    block += `_Total monto: ${totalAmount.toFixed(2)} | Cobrado: ${totalPaid.toFixed(2)} | Pendiente: ${totalPending.toFixed(2)}_\n`;
    sections.push(block);
  }
  return '📋 *Reporte de cuentas por cobrar (pendientes)*\n\n' + sections.join('\n');
}

/**
 * Construye el texto del reporte de pedidos pendientes para un teléfono (remitente).
 * Busca store_users con ese teléfono y para cada tienda obtiene los requests con status pending.
 */
async function buildOrdersReportForPhone(senderPhone) {
  const stores = await getStoreIdsByPhoneNumber(senderPhone);
  if (stores.length === 0) return '';

  const sections = [];
  for (const { storeId, storeName } of stores) {
    const { requests } = await getRequestsByStore(storeId, { status: 'pending' });
    if (!requests || requests.length === 0) {
      sections.push(`📌 *${storeName || storeId}*\nSin pedidos pendientes.\n`);
      continue;
    }
    let block = `📌 *${storeName || storeId}*\n`;
    let totalSum = 0;
    for (const r of requests) {
      const total = parseFloat(r.total) || 0;
      totalSum += total;
      const num = r.order_number != null ? `Pedido #${r.order_number} — ` : '';
      const cliente = r.customer_name || r.customer_phone || '—';
      const tel = r.customer_phone ? ` — tel: ${r.customer_phone}` : '';
      const fecha = r.created_at ? new Date(r.created_at).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
      block += `• ${num}${cliente}${tel}: ${total.toFixed(2)} ${r.currency || 'USD'} (${fecha})\n`;
    }
    block += `_Total: ${requests.length} pedido(s) | Monto: ${totalSum.toFixed(2)}_\n`;
    sections.push(block);
  }
  return '📋 *Reporte de pedidos pendientes*\n\n' + sections.join('\n');
}

/**
 * Envía un mensaje de texto por WhatsApp Cloud API.
 * @param {string} phoneNumberId - ID del número de negocio (ej. 917482631457452)
 * @param {string} to - Número del destinatario (sin +)
 * @param {string} text - Cuerpo del mensaje
 * @param {string} accessToken - Token Bearer (WS_token)
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
 * @param {string} to - Número del destinatario (sin +)
 * @param {string} bodyText - Texto del cuerpo del mensaje (máx 1024 caracteres)
 * @param {string} buttonLabel - Texto del botón (máx 20 caracteres)
 * @param {string} buttonUrl - URL del botón
 * @param {string} accessToken - Token Bearer (WS_token)
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
