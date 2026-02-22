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
  updateReceivableItems,
  getPaymentsByReceivableId,
  createReceivablePayment,
  getReceivablesLogs,
} from '../services/receivableService.js';
import { getUserStoreById, getStoreNameAndPhone } from '../services/storeService.js';
import { sendWhatsAppTemplate } from '../services/whatsappService.js';
import { getRequestById } from '../services/requestService.js';
import { query } from '../config/database.js';

/**
 * POST /api/receivables
 * Crear cuenta por cobrar manual: body { storeId, customerName?, customerPhone?, description?, amount, currency? }
 */
export async function createReceivableHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId, customerName, customerPhone, description, amount, currency } = req.body;

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

    const initialPayment =
      req.body.initialPayment != null && req.body.initialPayment.amount != null && req.body.initialPayment.amount !== ''
        ? {
            amount: req.body.initialPayment.amount,
            notes: req.body.initialPayment.notes,
          }
        : null;
    if (initialPayment) {
      const abonoNum = parseFloat(initialPayment.amount);
      if (Number.isNaN(abonoNum) || abonoNum < 0) {
        return res.status(400).json({
          success: false,
          error: 'El abono inicial debe ser un número mayor o igual a 0.',
        });
      }
    }

    const receivable = await createReceivable({
      storeId,
      createdBy: userId,
      customerName: customerName?.trim() || null,
      customerPhone: customerPhone?.trim() || null,
      description: description?.trim() || null,
      amount: amountNum,
      currency: currency || 'USD',
      initialPayment,
    });

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
 * Crear cuenta por cobrar a partir de un pedido: body { storeId, requestId, description?, customerName?, customerPhone? }
 */
export async function createReceivableFromRequestHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId, requestId, description, customerName, customerPhone, amount } = req.body;

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

    const initialPayment =
      req.body.initialPayment != null && req.body.initialPayment.amount != null && req.body.initialPayment.amount !== ''
        ? {
            amount: req.body.initialPayment.amount,
            notes: req.body.initialPayment.notes,
          }
        : null;
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

    const receivable = await createReceivableFromRequest(requestId, storeId, userId, {
      description: description?.trim() || undefined,
      customerName: customerName !== undefined ? customerName : undefined,
      customerPhone: customerPhone !== undefined ? customerPhone : undefined,
      amount: amountNum,
      initialPayment,
    });

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
 * Listar cuentas por cobrar de una tienda. Query: storeId (requerido), status?, limit?, offset?, dateFrom? (YYYY-MM-DD), dateTo? (YYYY-MM-DD), search? (nombre o número de cliente/cuenta)
 */
export async function getReceivablesHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { storeId, status, limit, offset, dateFrom, dateTo, search } = req.query;

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
 * Registrar un abono. Body: { storeId, amount, currency?, notes? }
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
 * Construye el detalle de productos para el template recordatorio_estado_de_cuenta (body {{4}}).
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
 * Envía recordatorios por WhatsApp usando el template recordatorio_estado_de_cuenta.
 * Body: { storeId, recipients: [ { phone, receivableIds: string[] } ] }
 * Template: recordatorio_estado_de_cuenta
 *   Header: {{1}} nombre de la tienda
 *   Body: {{1}} nombre cliente, {{2}} nombre tienda, {{3}} teléfono tienda, {{4}} detalle productos (cantidad nombre ($precio)), {{5}} total a pagar, {{6}} nombre tienda, {{7}} teléfono tienda, {{8}} teléfono tienda
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
          customerName,       // {{1}} nombre del cliente
          storeName,          // {{2}} nombre de la tienda
          storePhoneStr,      // {{3}} teléfono de la tienda
          productDetails,     // {{4}} detalle productos (cantidad nombre ($precio))
          totalAmountUsd,     // {{5}} total a pagar
          storeName,          // {{6}} nombre de la tienda
          storePhoneStr,      // {{7}} teléfono de la tienda
          storePhoneStr,      // {{8}} teléfono de la tienda
        ];

        const templateName = 'recordatorio_estado_de_cuenta';
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
            [storeId, phoneStr, 'recordatorio_estado_de_cuenta', JSON.stringify(ids), err?.message ?? 'Error al enviar']
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
