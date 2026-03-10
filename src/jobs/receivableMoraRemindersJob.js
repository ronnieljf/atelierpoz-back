/**
 * Job para enviar recordatorios de mora (interés por días vencidos).
 * Usa template notificacion_pago_negocio_sin_boton.
 *
 * Template (9 variables):
 * 1: nombre del cliente
 * 2: nombre de la tienda
 * 3: Factura #numero o Cuenta #numero
 * 4: fecha de vencimiento
 * 5: monto original de la cuenta
 * 6: monto nuevo (con interés calculado)
 * 7: lista de productos o descripción de la cuenta
 * 8: correo contacto
 * 9: teléfono contacto
 */

import { getRemindersToSendTodayMora, markReminderSent } from '../services/receivableReminderService.js';
import { sendWhatsAppTemplate } from '../services/whatsappService.js';
import { getRequestById } from '../services/requestService.js';
import { getStoreContact } from '../services/storeService.js';
import { computeInterestForReceivable } from '../services/receivableService.js';
import { query } from '../config/database.js';

function formatFechaHumana(fecha) {
  if (!fecha) return '';
  try {
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return String(fecha);
    const year = d.getUTCFullYear();
    if (year < 2000 || year > 2100) return String(fecha);
    return d.toLocaleDateString('es-VE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Caracas',
    });
  } catch {
    return String(fecha);
  }
}

async function buildProductListOrDescription(requestId, storeId, description) {
  if (requestId && storeId) {
    const req = await getRequestById(requestId, storeId);
    if (req && Array.isArray(req.items) && req.items.length > 0) {
      const lines = req.items.map((it) => {
        const name = (it.productName || 'Producto').trim().slice(0, 30);
        const qty = typeof it.quantity === 'number' ? it.quantity : 1;
        const total = typeof it.totalPrice === 'number' ? it.totalPrice : (it.basePrice || 0) * qty;
        return `${qty} ${name} ($${total.toFixed(2)})`;
      });
      const text = lines.join(' • ');
      return text.length > 900 ? text.slice(0, 897) + '...' : text;
    }
  }
  return (description && String(description).trim()) || '';
}

export async function sendDueMoraReminders(storeId = null) {
  const reminders = await getRemindersToSendTodayMora(storeId);
  if (!Array.isArray(reminders) || reminders.length === 0) {
    return { total: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const r of reminders) {
    const phoneRaw = (r.customerPhone || '').trim();
    if (!phoneRaw) {
      failed += 1;
      continue;
    }

    try {
      const customerName = (r.customerName || 'Cliente').trim();
      const storeName = (r.storeName || 'Tienda').trim();
      const fechaHumana = formatFechaHumana(r.fechaVencimiento || r.dueDate);

      // {{3}} Factura #numero o Cuenta #numero
      let var3 = '';
      if (r.receivableInvoiceNumber) {
        var3 = `Factura #${r.receivableInvoiceNumber}`;
      } else if (r.receivableNumber != null) {
        var3 = `Cuenta #${r.receivableNumber}`;
      } else {
        var3 = (r.invoiceOrAccount || '').trim() || 's/n';
      }

      // Monto original de la cuenta, saldo pendiente e interés
      const amount = r.amount;
      const totalPaid = r.totalPaid || 0;
      const balance = Math.max(0, amount - totalPaid);

      // Si interest_cada_dias, interest_tipo o interest_monto son null, 0 o < 1 → monto mora = monto original (no interés)
      const hasValidInterest = r.interestCadaDias != null && r.interestCadaDias >= 1
        && (r.interestTipo === 'fijo' || r.interestTipo === 'porcentaje')
        && r.interestMonto != null && r.interestMonto >= 1;

      const interestConfig = hasValidInterest
        ? { cadaDias: r.interestCadaDias, tipo: r.interestTipo, monto: r.interestMonto }
        : null;

      const computed = interestConfig && r.dueDate
        ? computeInterestForReceivable(interestConfig, amount, r.dueDate)
        : null;

      const montoOriginalStr = `$${amount.toFixed(2)}`; // monto original de la cuenta
      const rawMontoNuevo = computed
        ? balance + computed.interestAmount
        : balance;
      // El monto con mora siempre es >= monto original, nunca menor. Si no hay interés, deben ser iguales.
      const montoNuevo = Math.round(Math.max(amount, rawMontoNuevo) * 100) / 100;
      const montoNuevoStr = `$${montoNuevo.toFixed(2)}`;

      // {{7}} Productos o descripción
      const var7 = await buildProductListOrDescription(
        r.requestId,
        r.storeId,
        r.receivableDescription
      );

      // {{8}} correo contacto (de tienda), {{9}} teléfono datos_contacto (del recordatorio)
      const storeContact = await getStoreContact(r.storeId);
      const correoContacto = storeContact.email || '';
      const telefonoContacto = (r.datosContacto || '').trim() || storeContact.phoneNumber || '';

      const bodyParams = [
        customerName,       // {{1}} nombre del cliente
        storeName,          // {{2}} nombre de la tienda
        var3,               // {{3}} Factura # o Cuenta #
        fechaHumana || '-', // {{4}} fecha vencimiento
        montoOriginalStr,   // {{5}} monto original
        montoNuevoStr,      // {{6}} monto con interés
        var7,               // {{7}} productos o descripción
        correoContacto,     // {{8}} correo contacto
        telefonoContacto,   // {{9}} teléfono contacto
      ];

      const sendResult = await sendWhatsAppTemplate(
        phoneRaw,
        'notificacion_pago_negocio_sin_boton',
        bodyParams,
        'es',
        null,
        null
      );

      try {
        await query(
          `INSERT INTO whatsapp_message_logs (store_id, phone, template_name, receivable_ids, message_id, success, error_message)
           VALUES ($1, $2, $3, $4::jsonb, $5, true, NULL)`,
          [
            r.storeId,
            phoneRaw,
            'notificacion_pago_negocio_sin_boton',
            JSON.stringify([r.receivableId]),
            sendResult?.messageId ?? null,
          ]
        );
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error('[whatsapp_message_logs] Error guardando mora:', logErr?.message || logErr);
      }

      await markReminderSent(r.id);
      sent += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[MoraRemindersJob] Error enviando recordatorio mora', r.id, err?.message || err);

      try {
        await query(
          `INSERT INTO whatsapp_message_logs (store_id, phone, template_name, receivable_ids, message_id, success, error_message)
           VALUES ($1, $2, $3, $4::jsonb, NULL, false, $5)`,
          [
            r.storeId,
            (r.customerPhone || '').trim() || '(sin teléfono)',
            'notificacion_pago_negocio_sin_boton',
            JSON.stringify([r.receivableId]),
            err?.message ?? 'Error al enviar recordatorio mora',
          ]
        );
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error('[whatsapp_message_logs] Error guardando fallo mora:', logErr?.message || logErr);
      }

      failed += 1;
    }
  }

  return {
    total: reminders.length,
    sent,
    failed,
  };
}
