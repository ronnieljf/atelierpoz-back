/**
 * Servicio de consultas directas para tiendas por WhatsApp.
 * Responde sin usar IA para ahorrar tokens.
 * Solo consultas: pedidos, cuentas por cobrar, ventas, compras, cuentas por pagar.
 */

import { getStoreIdsByPhoneNumber } from './storeService.js';
import {
  getReceivablesByStoreWithPayments,
  getReceivableByStoreAndReceivableNumber,
  getPaymentsByReceivableId,
} from './receivableService.js';
import { getRequestById } from './requestService.js';
import { getRequestsByStore } from './requestService.js';
import { getSalesByStore } from './saleService.js';
import { getPurchasesByStore } from './purchaseService.js';
import { getExpensesByStore, getPendingTotalByStore } from './expenseService.js';

/** Palabras clave para detectar cada tipo de consulta (normalizadas a minúsculas) */
const KEYWORDS = {
  pedidos: ['pedidos', 'pedido', 'ordenes', 'órdenes', 'orden'],
  cuentas: ['cuentas', 'cuenta', 'cobrar', 'cobranzas', 'quien me debe', 'cuánto me deben', 'cuanto me deben', 'dame el total', 'el total', 'cuánto es el total', 'cuanto es el total', 'total a cobrar'],
  ventas: ['ventas', 'venta', 'ventas del dia', 'ventas de hoy', 'facturado'],
  compras: ['compras', 'compra', 'compras realizadas'],
  cuentasPorPagar: ['cuentas por pagar', 'cuentas a pagar', 'gastos', 'gasto', 'por pagar', 'pendiente de pago'],
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
 * @returns {string|null} - 'pedidos' | 'cuentas' | 'ventas' | 'compras' | 'cuentasPorPagar' | 'detalleCuenta' | null
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
 * Construye el reporte de pedidos pendientes para un teléfono.
 */
async function buildOrdersReport(senderPhone) {
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
 * Construye el reporte de ventas recientes (últimas 15).
 */
async function buildSalesReport(senderPhone) {
  const stores = await getStoreIdsByPhoneNumber(senderPhone);
  if (stores.length === 0) return '';

  const sections = [];
  for (const { storeId, storeName } of stores) {
    const { sales, total } = await getSalesByStore(storeId, { limit: 15, offset: 0 });
    if (!sales || sales.length === 0) {
      sections.push(`📌 *${storeName || storeId}*\nSin ventas registradas.\n`);
      continue;
    }
    let block = `📌 *${storeName || storeId}*\n`;
    let totalSum = 0;
    for (const s of sales) {
      const t = parseFloat(s.total) || 0;
      totalSum += t;
      const num = s.saleNumber != null ? `Venta #${s.saleNumber} — ` : '';
      const cliente = s.clientName || s.clientPhone || '—';
      const tel = s.clientPhone ? ` — tel: ${s.clientPhone}` : '';
      const fecha = s.createdAt ? new Date(s.createdAt).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      block += `• ${num}${cliente}${tel}: ${t.toFixed(2)} ${s.currency || 'USD'} (${fecha})\n`;
    }
    block += `_Mostrando ${sales.length} de ${total} | Total: ${totalSum.toFixed(2)}_\n`;
    sections.push(block);
  }
  return '📋 *Reporte de ventas*\n\n' + sections.join('\n');
}

/**
 * Construye el reporte de compras recientes (últimas 15).
 */
async function buildPurchasesReport(senderPhone) {
  const stores = await getStoreIdsByPhoneNumber(senderPhone);
  if (stores.length === 0) return '';

  const sections = [];
  for (const { storeId, storeName } of stores) {
    const { purchases, total } = await getPurchasesByStore(storeId, { limit: 15, offset: 0 });
    if (!purchases || purchases.length === 0) {
      sections.push(`📌 *${storeName || storeId}*\nSin compras registradas.\n`);
      continue;
    }
    let block = `📌 *${storeName || storeId}*\n`;
    let totalSum = 0;
    for (const p of purchases) {
      const t = parseFloat(p.total) || 0;
      totalSum += t;
      const num = p.purchaseNumber != null ? `Compra #${p.purchaseNumber} — ` : '';
      const proveedor = p.vendorName || p.vendorPhone || '—';
      const fecha = p.createdAt ? new Date(p.createdAt).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
      block += `• ${num}${proveedor}: ${t.toFixed(2)} ${p.currency || 'USD'} (${fecha})\n`;
    }
    block += `_Mostrando ${purchases.length} de ${total} | Total: ${totalSum.toFixed(2)}_\n`;
    sections.push(block);
  }
  return '📋 *Reporte de compras*\n\n' + sections.join('\n');
}

/**
 * Construye el reporte de cuentas por pagar (gastos pendientes).
 */
async function buildExpensesReport(senderPhone) {
  const stores = await getStoreIdsByPhoneNumber(senderPhone);
  if (stores.length === 0) return '';

  const sections = [];
  for (const { storeId, storeName } of stores) {
    const { expenses, total } = await getExpensesByStore(storeId, { status: 'pending', limit: 20, offset: 0 });
    const pendingTotals = await getPendingTotalByStore(storeId);
    if (!expenses || expenses.length === 0) {
      sections.push(`📌 *${storeName || storeId}*\nSin cuentas por pagar pendientes.\n`);
      continue;
    }
    let block = `📌 *${storeName || storeId}*\n`;
    for (const e of expenses) {
      const pendiente = Math.max(0, (e.amount || 0) - (e.totalPaid || 0));
      if (pendiente <= 0) continue;
      const num = e.expenseNumber != null ? `Gasto #${e.expenseNumber} — ` : '';
      const desc = e.description || e.vendorName || e.vendorPhone || '—';
      block += `• ${num}${desc}: ${e.amount} ${e.currency || 'USD'} (pagado: ${(e.totalPaid || 0).toFixed(2)}, pendiente: ${pendiente.toFixed(2)})\n`;
    }
    const totalPendiente = pendingTotals.map((t) => `${t.total.toFixed(2)} ${t.currency}`).join(', ');
    block += `_Total pendiente por pagar: ${totalPendiente || '0'}_\n`;
    sections.push(block);
  }
  return '📋 *Reporte de cuentas por pagar (pendientes)*\n\n' + sections.join('\n');
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
    case 'pedidos':
      response = await buildOrdersReport(String(phone));
      break;
    case 'cuentas':
      response = await buildReceivablesReport(String(phone));
      break;
    case 'ventas':
      response = await buildSalesReport(String(phone));
      break;
    case 'compras':
      response = await buildPurchasesReport(String(phone));
      break;
    case 'cuentasPorPagar':
      response = await buildExpensesReport(String(phone));
      break;
    default:
      return { handled: false };
  }

  const emptyMessages = {
    pedidos: 'No tienes pedidos pendientes.',
    cuentas: 'No tienes cuentas por cobrar pendientes.',
    ventas: 'No tienes ventas registradas.',
    compras: 'No tienes compras registradas.',
    cuentasPorPagar: 'No tienes cuentas por pagar pendientes.',
  };

  const finalResponse = response.trim() || emptyMessages[queryType] || 'No hay datos para mostrar.';
  return { handled: true, response: finalResponse };
}
