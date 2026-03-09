/**
 * Controlador de cuentas por cobrar (receivables)
 */

import {
  createReceivable,
  createReceivableFromRequest,
  getReceivablesByStore,
  getPendingTotalByStore,
  getReceivableById,
  getReceivablesByIds,
  updateReceivable,
  reopenReceivable,
  updateReceivableItems,
  getPaymentsByReceivableId,
  createReceivablePayment,
  deleteReceivablePayment,
  getReceivablesLogs,
  insertReceivableLog,
} from '../services/receivableService.js';
import { getUserStoreById, getStoreNameAndPhone } from '../services/storeService.js';
import { sendWhatsAppTemplate } from '../services/whatsappService.js';
import { getRequestById } from '../services/requestService.js';
import { query } from '../config/database.js';
import {
  createAttachment,
  getAttachmentsByReceivableId,
  getAttachmentDownloadUrl,
} from '../services/receivableAttachmentService.js';
import {
  getRemindersByReceivable,
  getDefaultReminderData,
  createReminder,
  updateReminder,
  deleteReminder,
} from '../services/receivableReminderService.js';

/** Parsea initialPayment desde body (puede venir como objeto o JSON string en FormData) */
function parseInitialPayment(body) {
  let ip = body?.initialPayment;
  if (typeof ip === 'string') {
    try {
      ip = JSON.parse(ip);
    } catch {
      return null;
    }
  }
  return ip != null && ip.amount != null && ip.amount !== ''
    ? { amount: ip.amount, notes: ip.notes }
    : null;
}

/**
 * POST /api/receivables
 * Crear cuenta por cobrar manual: body { storeId, customerName?, customerPhone?, description?, amount, currency?, invoiceNumber? }
 */
export async function createReceivableHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId, customerName, customerPhone, description, amount, currency, invoiceNumber, dueDate } = req.body;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Falta indicar la tienda (storeId).',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const amountNum = amount != null && amount !== '' ? parseFloat(amount) : NaN;
    if (Number.isNaN(amountNum) || amountNum < 0) {
      return res.status(400).json({
        success: false,
        error: 'El monto debe ser un número mayor o igual a 0.',
      });
    }

    const initialPayment = parseInitialPayment(req.body);
    if (initialPayment) {
      const abonoNum = parseFloat(initialPayment.amount);
      if (Number.isNaN(abonoNum) || abonoNum < 0) {
        return res.status(400).json({
          success: false,
          error: 'El abono inicial debe ser un número mayor o igual a 0.',
        });
      }
    }

    const { receivable, initialPaymentId } = await createReceivable({
      storeId,
      createdBy: userId,
      customerName: customerName?.trim() || null,
      customerPhone: customerPhone?.trim() || null,
      description: description?.trim() || null,
      amount: amountNum,
      currency: currency || 'USD',
      invoiceNumber: typeof invoiceNumber === 'string' && invoiceNumber.trim() ? invoiceNumber.trim() : null,
      initialPayment,
      dueDate: dueDate && String(dueDate).trim() ? String(dueDate).trim().slice(0, 10) : null,
    });

    // Si se subió comprobante (abono inicial o general), crear adjunto
    if (req.file && req.file.buffer) {
      await createAttachment({
        receivableId: receivable.id,
        paymentId: initialPaymentId || null,
        file: req.file,
        createdBy: userId,
      });
    }

    return res.status(201).json({
      success: true,
      receivable,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/receivables/from-request
 * Crear cuenta por cobrar a partir de un pedido: body { storeId, requestId, description?, customerName?, customerPhone?, amount?, invoiceNumber? }
 */
export async function createReceivableFromRequestHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId, requestId, description, customerName, customerPhone, amount, invoiceNumber, dueDate } = req.body;

    if (!storeId || !requestId) {
      return res.status(400).json({
        success: false,
        error: 'Faltan storeId o requestId.',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const initialPayment = parseInitialPayment(req.body);
    if (initialPayment) {
      const abonoNum = parseFloat(initialPayment.amount);
      if (Number.isNaN(abonoNum) || abonoNum < 0) {
        return res.status(400).json({
          success: false,
          error: 'El abono inicial debe ser un número mayor o igual a 0.',
        });
      }
    }

    const amountNum =
      amount !== undefined && amount !== null && amount !== ''
        ? parseFloat(amount)
        : undefined;
    if (amountNum !== undefined && (Number.isNaN(amountNum) || amountNum < 0)) {
      return res.status(400).json({
        success: false,
        error: 'El monto debe ser un número mayor o igual a 0.',
      });
    }

    const { receivable, initialPaymentId } = await createReceivableFromRequest(requestId, storeId, userId, {
      description: description?.trim() || undefined,
      customerName: customerName !== undefined ? customerName : undefined,
      customerPhone: customerPhone !== undefined ? customerPhone : undefined,
      amount: amountNum,
      invoiceNumber: typeof invoiceNumber === 'string' && invoiceNumber.trim() ? invoiceNumber.trim() : undefined,
      initialPayment,
      dueDate: dueDate && String(dueDate).trim() ? String(dueDate).trim().slice(0, 10) : undefined,
    });

    // Si se subió comprobante para el abono inicial, crear adjunto
    if (req.file && req.file.buffer) {
      await createAttachment({
        receivableId: receivable.id,
        paymentId: initialPaymentId || null,
        file: req.file,
        createdBy: userId,
      });
    }

    return res.status(201).json({
      success: true,
      receivable,
    });
  } catch (error) {
    if (error.message && error.message.includes('Pedido no encontrado')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * GET /api/receivables
 * Listar cuentas por cobrar de una tienda.
 * Query: storeId (requerido), status?, limit?, offset?, dateFrom? (YYYY-MM-DD), dateTo? (YYYY-MM-DD),
 * search? (nombre o número de cliente/cuenta o producto),
 * invoiceNumber? (string parcial o completo),
 * source? ('manual' | 'request') para filtrar por origen (manual vs desde pedido).
 */
export async function getReceivablesHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId, status, limit, offset, dateFrom, dateTo, search, invoiceNumber, source } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const result = await getReceivablesByStore(storeId, {
      status: status || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      dateFrom: dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : undefined,
      dateTo: dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : undefined,
      search: typeof search === 'string' && search.trim() ? search.trim() : undefined,
      invoiceNumber: typeof invoiceNumber === 'string' && invoiceNumber.trim() ? invoiceNumber.trim() : undefined,
      source: source === 'manual' || source === 'request' ? source : undefined,
    });

    return res.json({
      success: true,
      receivables: result.receivables,
      total: result.total,
      totalAmountByCurrency: result.totalAmountByCurrency ?? {},
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/receivables/pending-total
 * Total pendiente por cobrar (solo cuentas pending, restando abonos). Query: storeId (requerido)
 */
export async function getPendingTotalHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const result = await getPendingTotalByStore(storeId);
    return res.json({
      success: true,
      byCurrency: result.byCurrency,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/receivables/:id
 * Obtener una cuenta por cobrar. Query: storeId (requerido)
 */
export async function getReceivableByIdHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const receivable = await getReceivableById(id, storeId);
    if (!receivable) {
      return res.status(404).json({
        success: false,
        error: 'Cuenta por cobrar no encontrada',
      });
    }

    return res.json({
      success: true,
      receivable,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/receivables/:id/payments/:paymentId
 * Eliminar un abono. Solo cuentas manuales. Query: storeId (requerido)
 */
export async function deleteReceivablePaymentHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id, paymentId } = req.params;
    const storeId = req.query.storeId || req.body?.storeId;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const result = await deleteReceivablePayment(id, paymentId, storeId, userId);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Abono o cuenta por cobrar no encontrados',
      });
    }

    return res.json({
      success: true,
      receivable: result.receivable,
      payments: result.payments,
      totalPaid: result.totalPaid,
    });
  } catch (error) {
    if (error.message && error.message.includes('Solo se pueden eliminar abonos')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * GET /api/receivables/:id/logs
 * Trazabilidad de acciones sobre la cuenta por cobrar.
 */
export async function getReceivableLogsHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const logs = await getReceivablesLogs(id, storeId);
    if (logs === null) {
      return res.status(404).json({ success: false, error: 'Cuenta por cobrar no encontrada' });
    }
    return res.json({ success: true, logs });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/receivables/:id/reopen
 * Reabrir una cuenta por cobrar cobrada (solo cuentas manuales). Body: { storeId }
 */
export async function reopenReceivableHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { storeId } = req.body;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const receivable = await reopenReceivable(id, storeId, userId);
    if (!receivable) {
      return res.status(404).json({
        success: false,
        error: 'Cuenta por cobrar no encontrada',
      });
    }

    return res.json({
      success: true,
      receivable,
    });
  } catch (error) {
    if (error.message && error.message.includes('Solo se puede reabrir')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * PUT /api/receivables/:id
 * Actualizar cuenta por cobrar (editar campos o marcar como cobrada/cancelada).
 * Body: { storeId, customerName?, customerPhone?, description?, amount?, currency?, status? }
 */
export async function updateReceivableHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { storeId, ...updates } = req.body;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const receivable = await updateReceivable(id, storeId, updates, req.user.id);
    if (!receivable) {
      return res.status(404).json({
        success: false,
        error: 'Cuenta por cobrar no encontrada',
      });
    }

    return res.json({
      success: true,
      receivable,
    });
  } catch (error) {
    if (error.message && error.message.includes('Estado debe ser')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message && error.message.includes('monto')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * PUT /api/receivables/:id/items
 * Cambiar los productos de una cuenta por cobrar creada desde un pedido.
 * Restaura stock de los productos viejos y descuenta el de los nuevos. Actualiza el monto de la cuenta al nuevo total.
 * Body: { storeId, items, total }
 */
export async function updateReceivableItemsHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { storeId, items, total } = req.body;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'items debe ser un array con al menos un producto',
      });
    }
    const totalNum = total != null && total !== '' ? parseFloat(total) : NaN;
    if (Number.isNaN(totalNum) || totalNum < 0) {
      return res.status(400).json({
        success: false,
        error: 'total debe ser un número mayor o igual a 0',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const result = await updateReceivableItems(id, storeId, items, totalNum, { updateAmount: true, updatedByUserId: req.user.id });
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Cuenta por cobrar no encontrada',
      });
    }

    return res.json({
      success: true,
      receivable: result.receivable,
      request: result.request,
    });
  } catch (error) {
    if (error.message && (error.message.includes('Solo se pueden cambiar') || error.message.includes('Pedido no encontrado'))) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message && (error.message.includes('ítems') || error.message.includes('total'))) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * GET /api/receivables/:id/payments
 * Listar abonos de una cuenta por cobrar. Query: storeId (requerido)
 */
export async function getReceivablePaymentsHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const result = await getPaymentsByReceivableId(id, storeId);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Cuenta por cobrar no encontrada',
      });
    }

    return res.json({
      success: true,
      receivable: result.receivable,
      payments: result.payments,
      totalPaid: result.totalPaid,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/receivables/:id/payments
 * Registrar un abono. Body/multipart: { storeId, amount, currency?, notes? }, opcional: file (comprobante)
 */
export async function createReceivablePaymentHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { storeId, amount, currency, notes } = req.body;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const result = await createReceivablePayment(id, storeId, {
      amount,
      currency: currency || undefined,
      notes: notes || undefined,
    }, userId);

    // Si se subió un comprobante, crear adjunto vinculado al último abono
    if (req.file && req.file.buffer && result.payments && result.payments.length > 0) {
      const lastPayment = result.payments[result.payments.length - 1];
      await createAttachment({
        receivableId: id,
        paymentId: lastPayment.id,
        file: req.file,
        createdBy: userId,
      });
    }

    return res.status(201).json({
      success: true,
      receivable: result.receivable,
      payments: result.payments,
      totalPaid: result.totalPaid,
    });
  } catch (error) {
    if (error.message && (error.message.includes('no encontrada') || error.message.includes('pendientes'))) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message && error.message.includes('monto')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Construye el detalle de productos para el template notificacion_pago_pendiente (body {{4}}).
 * Formato por línea: cantidad nombre ($precio). Nombre máx 20 caracteres. Total máx ~900 chars.
 */
async function buildProductDetailsForTemplate(receivables, storeId) {
  const lines = [];
  const seen = new Map(); // key: "productName|variantKey" -> { qty, total }

  for (const rec of receivables) {
    if (!rec.requestId) continue;
    const req = await getRequestById(rec.requestId, storeId);
    if (!req || !Array.isArray(req.items) || req.items.length === 0) continue;

    for (const item of req.items) {
      const name = (item.productName || 'Producto').trim().slice(0, 20);
      const variantKey = Array.isArray(item.selectedVariants) && item.selectedVariants.length > 0
        ? item.selectedVariants.map((v) => v.variantValue || v.variantName || '').filter(Boolean).join(', ')
        : '';
      const key = `${name}|${variantKey}`;
      const qty = typeof item.quantity === 'number' ? item.quantity : 1;
      const total = typeof item.totalPrice === 'number' ? item.totalPrice : (item.basePrice || 0) * qty;

      if (seen.has(key)) {
        const prev = seen.get(key);
        prev.qty += qty;
        prev.total += total;
      } else {
        seen.set(key, { qty, total });
      }
    }
  }

  for (const [key, { qty, total }] of seen) {
    const [name] = key.split('|');
    lines.push(`${qty} ${name} ($${total.toFixed(2)})`);
  }

  // WhatsApp no permite \n, \t ni más de 4 espacios seguidos en params de template
  const text = lines.join(' • ');
  return text.length > 900 ? text.slice(0, 897) + '...' : text || 'Cuenta pendiente';
}

/**
 * POST /api/receivables/send-reminders
 * Envía recordatorios por WhatsApp usando el template notificacion_pago_pendiente.
 * Body: { storeId, recipients: [ { phone, receivableIds: string[] } ] }
 * Template: notificacion_pago_pendiente
 *   Header: {{1}} nombre de la tienda
 *   Body: {{1}} nombre del cliente que debe, {{2}} nombre de la tienda, {{3}} monto que debe, {{4}} detalle de lo que debe, {{5}} número de teléfono de la tienda
 */
export async function sendReceivableRemindersHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId, recipients } = req.body;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Falta storeId.',
      });
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'recipients debe ser un array con al menos un elemento { phone, receivableIds }.',
      });
    }

    const store = await getUserStoreById(storeId, userId);
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }
    if (!store.feature_send_reminder_receivables_whatsapp) {
      return res.status(400).json({
        success: false,
        error: 'Esta tienda no tiene activo el envío de recordatorios por WhatsApp.',
      });
    }

    const { name: storeName, phoneNumber: storePhone } = await getStoreNameAndPhone(storeId);
    const storePhoneStr = storePhone ? String(storePhone).replace(/^\s*\+/, '').trim() : '';

    // Teléfono de contacto: priorizar el número del usuario que envía, y si no tiene, usar el de la tienda.
    const userPhoneResult = await query(
      `SELECT phone_number
       FROM store_users
       WHERE user_id = $1 AND phone_number IS NOT NULL AND TRIM(phone_number) != ''
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    const rawUserPhone = userPhoneResult.rows[0]?.phone_number;
    const userPhoneStr = rawUserPhone ? String(rawUserPhone).replace(/^\s*\+/, '').trim() : '';
    const contactPhoneStr = userPhoneStr || storePhoneStr;

    const headerParams = [storeName];

    let sent = 0;
    const failed = [];

    for (let i = 0; i < recipients.length; i++) {
      const { phone, receivableIds } = recipients[i];
      const phoneStr = typeof phone === 'string' ? String(phone).trim() : '';
      const ids = Array.isArray(receivableIds) ? receivableIds.filter((id) => typeof id === 'string' && id.trim()) : [];

      if (!phoneStr) {
        failed.push({ index: i, phone: '(vacío)', error: 'Teléfono vacío' });
        continue;
      }
      if (ids.length === 0) {
        failed.push({ index: i, phone: phoneStr, error: 'No hay cuentas válidas' });
        continue;
      }

      try {
        const receivables = await getReceivablesByIds(ids, storeId);
        if (receivables.length === 0) {
          failed.push({ index: i, phone: phoneStr, error: 'Cuentas no encontradas' });
          continue;
        }

        const first = receivables[0];
        const customerName = (first.customerName || 'Cliente').trim();

        const totalByCurrency = {};
        for (const r of receivables) {
          const c = r.currency || 'USD';
          totalByCurrency[c] = (totalByCurrency[c] || 0) + Number(r.amount || 0);
        }
        const totalAmountUsd = totalByCurrency.USD != null
          ? `$${Number(totalByCurrency.USD).toFixed(2)}`
          : Object.entries(totalByCurrency)
              .map(([curr, amt]) => `${curr} ${Number(amt).toFixed(2)}`)
              .join(', ') || '0.00';

        const productDetails = await buildProductDetailsForTemplate(receivables, storeId);

        const bodyParams = [
          customerName,       // {{1}} nombre del cliente que debe
          storeName,          // {{2}} nombre de la tienda
          totalAmountUsd,     // {{3}} monto que debe
          productDetails,     // {{4}} detalle de lo que debe
          contactPhoneStr,    // {{5}} número de teléfono de contacto (usuario que envía, o tienda como fallback)
        ];

        const templateName = 'notificacion_pago_pendiente';
        const sendResult = await sendWhatsAppTemplate(phoneStr, templateName, bodyParams, 'es', headerParams);
        sent++;
        try {
          await query(
            `INSERT INTO whatsapp_message_logs (store_id, phone, template_name, receivable_ids, message_id, success, error_message)
             VALUES ($1, $2, $3, $4::jsonb, $5, true, NULL)`,
            [storeId, phoneStr, templateName, JSON.stringify(ids), sendResult?.messageId ?? null]
          );
        } catch (logErr) {
          console.error('[whatsapp_message_logs] Error guardando registro:', logErr.message);
        }
        for (const recId of ids) {
          try {
            await insertReceivableLog(recId, userId, 'reminder_sent', {
              phone: phoneStr,
              template: templateName,
              messageId: sendResult?.messageId ?? null,
            });
          } catch (logErr) {
            console.error('[receivables_logs] Error guardando log reminder_sent:', logErr.message);
          }
        }
      } catch (err) {
        failed.push({
          index: i,
          phone: phoneStr,
          error: err.message || 'Error al enviar',
        });
        try {
          await query(
            `INSERT INTO whatsapp_message_logs (store_id, phone, template_name, receivable_ids, message_id, success, error_message)
             VALUES ($1, $2, $3, $4::jsonb, NULL, false, $5)`,
            [storeId, phoneStr, 'notificacion_pago_pendiente', JSON.stringify(ids), err?.message ?? 'Error al enviar']
          );
        } catch (logErr) {
          console.error('[whatsapp_message_logs] Error guardando registro de fallo:', logErr.message);
        }
      }
    }

    return res.json({
      success: true,
      sent,
      failed: failed.length,
      failedDetails: failed.length > 0 ? failed : undefined,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/receivables/bulk-update-status
 * Actualiza el estado de varias cuentas por cobrar en lote.
 * Solo se actualizan las que están en estado 'pending'.
 * Body: { storeId, receivableIds: string[], newStatus: 'paid' | 'cancelled' }
 */
export async function bulkUpdateReceivableStatusHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId, receivableIds, newStatus } = req.body;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Falta storeId.',
      });
    }

    if (!Array.isArray(receivableIds) || receivableIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'receivableIds debe ser un array con al menos un ID.',
      });
    }

    if (newStatus !== 'paid' && newStatus !== 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'newStatus debe ser "paid" o "cancelled".',
      });
    }

    const store = await getUserStoreById(storeId, userId);
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const receivables = await getReceivablesByIds(receivableIds, storeId);
    const pendingOnly = receivables.filter((r) => r.status === 'pending');
    const skipped = receivables.length - pendingOnly.length;

    let updated = 0;
    for (const rec of pendingOnly) {
      try {
        await updateReceivable(rec.id, storeId, { status: newStatus }, req.user.id);
        updated++;
      } catch (err) {
        console.error(`[bulk-update] Error actualizando ${rec.id}:`, err.message);
      }
    }

    return res.json({
      success: true,
      updated,
      skipped,
      total: receivables.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/receivables/:id/attachments
 * Listar adjuntos (comprobantes) de una cuenta por cobrar. Query: storeId
 */
export async function getReceivableAttachmentsHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const attachments = await getAttachmentsByReceivableId(id, storeId);
    return res.json({ success: true, attachments });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/receivables/:id/attachments
 * Subir comprobante. Multipart: file, body: storeId, paymentId? (opcional, para vincular a un abono)
 */
export async function createReceivableAttachmentHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const storeId = req.body?.storeId;
    const paymentId = req.body?.paymentId || null;

    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'Debes subir un archivo (imagen o PDF)' });
    }

    const attachment = await createAttachment({
      receivableId: id,
      paymentId: paymentId || null,
      file: req.file,
      createdBy: userId,
    });

    return res.status(201).json({ success: true, attachment });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/receivables/:id/attachments/:attachmentId/download
 * Obtener URL firmada para descargar el archivo. Query: storeId
 * Retorna { downloadUrl } para que el frontend abra la URL (no requiere auth la URL firmada)
 */
export async function getReceivableAttachmentDownloadHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id, attachmentId } = req.params;
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const url = await getAttachmentDownloadUrl(attachmentId, id, storeId);
    if (!url) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
    }

    return res.json({ success: true, downloadUrl: url });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/receivables/:id/reminders
 * Listar recordatorios de una cuenta por cobrar. Query: storeId
 */
export async function getReceivableRemindersHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const receivable = await getReceivableById(id, storeId);
    if (!receivable) {
      return res.status(404).json({ success: false, error: 'Cuenta por cobrar no encontrada' });
    }

    const reminders = await getRemindersByReceivable(id, storeId);
    return res.json({ success: true, reminders });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/receivables/:id/reminders/defaults
 * Obtener datos prellenados para crear un recordatorio. Query: storeId
 */
export async function getReceivableReminderDefaultsHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const defaults = await getDefaultReminderData(id, storeId);
    if (!defaults) {
      return res.status(404).json({ success: false, error: 'Cuenta por cobrar no encontrada' });
    }

    return res.json({ success: true, defaults });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/receivables/:id/reminders
 * Crear recordatorio. Body: { storeId, fechaEnvio, ...otros campos opcionales }
 */
export async function createReceivableReminderHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      storeId,
      fechaEnvio,
      customerName,
      storeName,
      invoiceOrAccount,
      fechaVencimiento,
      datosPagomovil,
      datosTransferencia,
      datosBinance,
      datosContacto,
      esMora,
      repetirVeces,
      repetirCadaDias,
    } = req.body;

    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    if (!fechaEnvio) {
      return res.status(400).json({ success: false, error: 'La fecha de envío es requerida' });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const reminders = await createReminder({
      receivableId: id,
      storeId,
      fechaEnvio,
      customerName: customerName || undefined,
      storeName: storeName || undefined,
      invoiceOrAccount: invoiceOrAccount || undefined,
      fechaVencimiento: fechaVencimiento || undefined,
      datosPagomovil: datosPagomovil || undefined,
      datosTransferencia: datosTransferencia || undefined,
      datosBinance: datosBinance || undefined,
      datosContacto: datosContacto || undefined,
      esMora: esMora === true,
      repetirVeces: repetirVeces != null ? Number(repetirVeces) : undefined,
      repetirCadaDias: repetirCadaDias != null ? Number(repetirCadaDias) : undefined,
    });
    return res.json({ success: true, reminders });
  } catch (error) {
    if (error.message?.includes('Cuenta por cobrar no encontrada')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    next(error);
  }
}

/**
 * PUT /api/receivables/:id/reminders/:reminderId
 * Actualizar recordatorio. Body: { storeId, ...campos a actualizar }
 */
export async function updateReceivableReminderHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id, reminderId } = req.params;
    const { storeId, ...data } = req.body;

    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const receivable = await getReceivableById(id, storeId);
    if (!receivable) {
      return res.status(404).json({ success: false, error: 'Cuenta por cobrar no encontrada' });
    }

    const reminder = await updateReminder(reminderId, storeId, {
      customerName: data.customerName,
      storeName: data.storeName,
      invoiceOrAccount: data.invoiceOrAccount,
      fechaVencimiento: data.fechaVencimiento,
      datosPagomovil: data.datosPagomovil,
      datosTransferencia: data.datosTransferencia,
      datosBinance: data.datosBinance,
      datosContacto: data.datosContacto,
      fechaEnvio: data.fechaEnvio,
      esMora: data.esMora,
      repetirVeces: data.repetirVeces,
      repetirCadaDias: data.repetirCadaDias,
      status: data.status,
    });
    if (!reminder) {
      return res.status(404).json({ success: false, error: 'Recordatorio no encontrado' });
    }
    return res.json({ success: true, reminder });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/receivables/:id/reminders/:reminderId
 * Eliminar recordatorio. Query: storeId
 */
export async function deleteReceivableReminderHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { id, reminderId } = req.params;
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }

    const receivable = await getReceivableById(id, storeId);
    if (!receivable) {
      return res.status(404).json({ success: false, error: 'Cuenta por cobrar no encontrada' });
    }

    const deleted = await deleteReminder(reminderId, storeId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Recordatorio no encontrado' });
    }
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
}
