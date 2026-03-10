/**
 * Servicio de consultas directas para tiendas por WhatsApp.
 * Responde sin usar IA para ahorrar tokens.
 * Solo consultas de cuentas por cobrar: cuentas, recordatorios, abonos, detalle cuenta.
 */

import { getStoreIdsByPhoneNumber } from './storeService.js';
import {
  getReceivablesByStoreWithPayments,
  getReceivableByStoreAndReceivableNumber,
  getPaymentsByReceivableId,
  getRecentPaymentsByStore,
} from './receivableService.js';
import { getRequestById } from './requestService.js';
import { getRemindersByStore } from './receivableReminderService.js';

/** Palabras clave para detectar cada tipo de consulta (normalizadas a minúsculas) */
const KEYWORDS = {
  cuentas: ['cuentas', 'cuenta', 'cobrar', 'cobranzas', 'quien me debe', 'cuánto me deben', 'cuanto me deben', 'dame el total', 'el total', 'cuánto es el total', 'cuanto es el total', 'total a cobrar'],
  recordatorios: ['recordatorios', 'recordatorio', 'recordatorios pendientes', 'avisos programados'],
  abonos: ['abonos', 'abono', 'pagos recibidos', 'cuánto he cobrado', 'cuanto he cobrado'],
};

/**
 * Detecta si el mensaje pide detalle de una cuenta por número (ej. "detalle cuenta 3", "cuenta #5").
 * @returns {{ isDetail: boolean, receivableNumber?: number }}
 */
function detectReceivableDetailRequest(messageText) {
  const text = String(messageText || '').trim();
  const match = text.match(/(?:detalle\s+)?(?:cuenta\s+)?#?\s*(\d+)/i) || text.match(/cuenta\s+(\d+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!Number.isNaN(num) && num > 0) return { isDetail: true, receivableNumber: num };
  }
  return { isDetail: false };
}

/**
 * Detecta si el mensaje es una consulta conocida y devuelve el tipo.
 * @param {string} messageText - Mensaje normalizado (trim, lowercase)
 * @returns {string|null} - 'cuentas' | 'recordatorios' | 'abonos' | 'detalleCuenta' | null
 */
export function detectStoreQueryType(messageText) {
  const text = String(messageText || '').trim().toLowerCase();
  if (!text) return null;

  const detail = detectReceivableDetailRequest(messageText);
  if (detail.isDetail) return 'detalleCuenta';

  for (const [type, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => text.includes(w))) return type;
  }
  return null;
}

/**
 * Construye el reporte de recordatorios programados por tienda.
 */
async function buildRemindersReport(senderPhone) {
  const stores = await getStoreIdsByPhoneNumber(senderPhone);
  if (stores.length === 0) return '';

  const sections = [];
  for (const { storeId, storeName } of stores) {
    const reminders = await getRemindersByStore(storeId);
    const pending = reminders.filter((r) => r.status === 'pending' && !r.sent_at);
    if (pending.length === 0) {
      sections.push(`📌 *${storeName || storeId}*\nSin recordatorios pendientes.\n`);
      continue;
    }
    let block = `📌 *${storeName || storeId}*\n`;
    for (const r of pending) {
      const tipo = r.es_mora ? 'Mora' : 'Aviso';
      const fecha = r.fecha_envio ? new Date(r.fecha_envio).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
      const cuenta = r.receivable_number != null ? `Cuenta #${r.receivable_number}` : '—';
      const cliente = r.customer_name || '—';
      block += `• ${cuenta} — ${cliente} (${tipo}, ${fecha})\n`;
    }
    block += `_Total: ${pending.length} recordatorio(s) pendiente(s)_\n`;
    sections.push(block);
  }
  return '📋 *Recordatorios programados*\n\n' + sections.join('\n');
}

/**
 * Construye el detalle de una cuenta por cobrar por número.
 */
async function buildReceivableDetailReport(senderPhone, receivableNumber) {
  const stores = await getStoreIdsByPhoneNumber(senderPhone);
  if (stores.length === 0) return null;

  for (const { storeId, storeName } of stores) {
    const rec = await getReceivableByStoreAndReceivableNumber(storeId, receivableNumber);
    if (!rec) continue;

    const paymentsData = await getPaymentsByReceivableId(rec.id, storeId);
    const totalPaid = paymentsData?.totalPaid ?? 0;
    const pendiente = Math.max(0, (rec.amount || 0) - totalPaid);

    let block = `💰 *Cuenta #${rec.receivableNumber}* — ${storeName || storeId}\n\n`;
    block += `👤 Cliente: ${rec.customerName || '—'}\n`;
    if (rec.customerPhone) block += `📱 Tel: ${rec.customerPhone}\n`;
    if (rec.description) block += `📝 ${rec.description}\n`;
    block += `💵 Total: ${rec.amount} ${rec.currency || 'USD'}\n`;
    block += `✅ Pagado: ${totalPaid.toFixed(2)}\n`;
    block += `⏳ Pendiente: ${pendiente.toFixed(2)}\n`;

    if (paymentsData?.payments?.length) {
      block += `\n*Abonos:*\n`;
      for (const p of paymentsData.payments) {
        block += `• ${p.amount} ${p.currency}${p.notes ? ` — ${p.notes}` : ''} (${p.createdAt ? new Date(p.createdAt).toLocaleDateString('es') : ''})\n`;
      }
    }

    if (rec.requestId) {
      const request = await getRequestById(rec.requestId, storeId);
      let items = request?.items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch { items = []; }
      }
      if (Array.isArray(items) && items.length > 0) {
        block += `\n*Pedido #${request.order_number} — Productos:*\n`;
        for (const it of items) {
          const qty = it.quantity || 1;
          block += `• ${it.productName || '—'} x${qty} = ${(it.totalPrice || 0).toFixed(2)}\n`;
        }
      }
    }
    return block;
  }
  return null;
}

/**
 * Construye el reporte de cuentas por cobrar pendientes.
 */
async function buildReceivablesReport(senderPhone) {
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
      const pending = Math.max(0, r.amount - (r.totalPaid || 0));
      totalAmount += r.amount;
      totalPaid += r.totalPaid || 0;
      totalPending += pending;
      const num = r.receivableNumber != null ? `Cuenta #${r.receivableNumber} — ` : '';
      const cliente = r.customerName || r.customerPhone || '—';
      const tel = r.customerPhone ? ` — tel: ${r.customerPhone}` : '';
      block += `• ${num}${cliente}${tel}: ${r.amount} ${r.currency} (pagado: ${(r.totalPaid || 0).toFixed(2)}, pendiente: ${pending.toFixed(2)})\n`;
    }
    block += `_Total monto: ${totalAmount.toFixed(2)} | Cobrado: ${totalPaid.toFixed(2)} | Pendiente: ${totalPending.toFixed(2)}_\n`;
    sections.push(block);
  }
  return '📋 *Reporte de cuentas por cobrar (pendientes)*\n\n' + sections.join('\n');
}

/**
 * Construye el reporte de abonos recientes (últimos 15 por tienda).
 */
async function buildAbonosReport(senderPhone) {
  const stores = await getStoreIdsByPhoneNumber(senderPhone);
  if (stores.length === 0) return '';

  const sections = [];
  for (const { storeId, storeName } of stores) {
    const payments = await getRecentPaymentsByStore(storeId, 15);
    if (!payments || payments.length === 0) {
      sections.push(`📌 *${storeName || storeId}*\nSin abonos registrados.\n`);
      continue;
    }
    let block = `📌 *${storeName || storeId}*\n`;
    let totalSum = 0;
    for (const p of payments) {
      const amt = parseFloat(p.amount) || 0;
      totalSum += amt;
      const cuenta = p.receivable_number != null ? `Cuenta #${p.receivable_number}` : '—';
      const fecha = p.created_at ? new Date(p.created_at).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      block += `• ${cuenta}: ${amt.toFixed(2)} ${p.currency || 'USD'}${p.notes ? ` — ${p.notes}` : ''} (${fecha})\n`;
    }
    block += `_Total: ${payments.length} abono(s) | Suma: ${totalSum.toFixed(2)}_\n`;
    sections.push(block);
  }
  return '📋 *Abonos recientes*\n\n' + sections.join('\n');
}

/**
 * Intenta responder con una consulta directa (sin IA).
 * @param {string} phone - Teléfono del remitente (store_user)
 * @param {string} messageText - Mensaje del usuario
 * @returns {{ handled: boolean, response?: string }} - handled=true si respondió directamente
 */
export async function tryStoreDirectQuery(phone, messageText) {
  const queryType = detectStoreQueryType(messageText);
  if (!queryType) return { handled: false };

  let response = '';
  const detailReq = detectReceivableDetailRequest(messageText);

  switch (queryType) {
    case 'detalleCuenta':
      if (detailReq.receivableNumber) {
        response = await buildReceivableDetailReport(String(phone), detailReq.receivableNumber);
        if (!response) response = `No se encontró la cuenta #${detailReq.receivableNumber}. Escribe *cuentas* para ver el listado.`;
      }
      break;
    case 'cuentas':
      response = await buildReceivablesReport(String(phone));
      break;
    case 'recordatorios':
      response = await buildRemindersReport(String(phone));
      break;
    case 'abonos':
      response = await buildAbonosReport(String(phone));
      break;
    default:
      return { handled: false };
  }

  const emptyMessages = {
    cuentas: 'No tienes cuentas por cobrar pendientes.',
    recordatorios: 'No tienes recordatorios pendientes.',
    abonos: 'No tienes abonos registrados.',
  };

  const finalResponse = response.trim() || emptyMessages[queryType] || 'No hay datos para mostrar.';
  return { handled: true, response: finalResponse };
}
