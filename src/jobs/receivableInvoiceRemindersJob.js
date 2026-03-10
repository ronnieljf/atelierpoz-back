import { getRemindersToSendToday, markReminderSent } from '../services/receivableReminderService.js';
import { sendWhatsAppTemplate } from '../services/whatsappService.js';
import { getRequestById } from '../services/requestService.js';
import { query } from '../config/database.js';

function formatFechaHumana(fecha) {
  if (!fecha) return '';
  try {
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return String(fecha);
    const year = d.getUTCFullYear();
    // Si el año luce raro, devolver el valor original para no confundir
    if (year < 2000 || year > 2100) return String(fecha);
    // Ej: 1 de marzo de 2026
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

/**
 * Construir variable {{8}}: lista de productos del pedido o descripcion de la cuenta.
 * Formato productos: "cant nombre ($precio) • ...". Máx ~900 chars para WhatsApp.
 */
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

/**
 * Enviar recordatorios de factura programados para hoy usando la plantilla
 * recordatorio_factura_detalles_sin_boton_sin_monto.
 *
 * Template (10 variables):
 * 1: nombre del cliente
 * 2: nombre de la tienda
 * 3: cuenta/factura + numero factura si tiene, sino la cuenta
 * 4: fecha vencimiento si tiene, sino guion
 * 5: pagomovil
 * 6: transferencia
 * 7: binance
 * 8: lista de productos si tiene, sino descripcion de la cuenta + total de la cuenta
 * 9: datos contacto
 * 10: datos contacto
 */
export async function sendDueInvoiceReminders(storeId = null) {
  const reminders = await getRemindersToSendToday(storeId);
  if (!Array.isArray(reminders) || reminders.length === 0) {
    return { total: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const r of reminders) {
    const phoneRaw = (r.customerPhone || '').trim();
    if (!phoneRaw) {
      failed += 1;
      // No hay teléfono del cliente, no se puede enviar
      // Continuar con el siguiente
      continue;
    }

    try {
      const customerName = (r.customerName || 'Cliente').trim();
      const storeName = (r.storeName || 'Tienda').trim();
      const fechaHumana = formatFechaHumana(r.fechaVencimiento);

      // {{3}} Factura #numero si tiene factura, sino Cuenta #numero
      let var3 = '';
      if (r.receivableInvoiceNumber) {
        var3 = `su factura #${r.receivableInvoiceNumber}`;
      } else if (r.receivableNumber != null) {
        var3 = `su cuenta #${r.receivableNumber}`;
      } else {
        var3 = (r.invoiceOrAccount || '').trim() || 's/n';
      }

      // {{8}} lista de productos si tiene, sino descripcion de la cuenta + total de la cuenta
      let var8 = await buildProductListOrDescription(
        r.requestId,
        r.storeId,
        r.receivableDescription
      );
      const amount = r.receivableAmount != null ? parseFloat(r.receivableAmount) : null;
      const currency = r.receivableCurrency || 'USD';
      const totalStr = amount != null && !Number.isNaN(amount) ? `Total: $${amount.toFixed(2)} ${currency}` : '';
      if (totalStr) {
        var8 = var8 ? `${var8} — ${totalStr}` : totalStr;
      }

      const bodyParams = [
        customerName,              // {{1}} nombre del cliente
        storeName,                 // {{2}} nombre de la tienda
        var3,                      // {{3}} cuenta/factura + factura
        fechaHumana || '-',        // {{4}} fecha vencimiento o guion
        r.datosPagomovil || '',    // {{5}} pagomovil
        r.datosTransferencia || '', // {{6}} transferencia
        r.datosBinance || '',      // {{7}} binance
        var8,                      // {{8}} productos o descripcion
        r.datosContacto || '',     // {{9}} datos contacto
        r.datosContacto || '',     // {{10}} datos contacto
      ];

      const sendResult = await sendWhatsAppTemplate(
        phoneRaw,
        'recordatorio_factura_detalles_sin_boton_sin_monto',
        bodyParams,
        'es',
        null,
        null
      );

      // Log en whatsapp_message_logs (éxito)
      try {
        await query(
          `INSERT INTO whatsapp_message_logs (store_id, phone, template_name, receivable_ids, message_id, success, error_message)
           VALUES ($1, $2, $3, $4::jsonb, $5, true, NULL)`,
          [
            r.storeId,
            phoneRaw,
            'recordatorio_factura_detalles_sin_boton_sin_monto',
            JSON.stringify([r.receivableId]),
            sendResult?.messageId ?? null,
          ]
        );
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error('[whatsapp_message_logs] Error guardando registro de recordatorio de factura:', logErr?.message || logErr);
      }

      await markReminderSent(r.id);
      sent += 1;
    } catch (err) {
      // Loguear pero no romper el loop
      // eslint-disable-next-line no-console
      console.error('[InvoiceRemindersJob] Error enviando recordatorio', r.id, err?.message || err);

      // Log en whatsapp_message_logs (fallo)
      try {
        await query(
          `INSERT INTO whatsapp_message_logs (store_id, phone, template_name, receivable_ids, message_id, success, error_message)
           VALUES ($1, $2, $3, $4::jsonb, NULL, false, $5)`,
          [
            r.storeId,
            (r.customerPhone || '').trim() || '(sin teléfono)',
            'recordatorio_factura_detalles_sin_boton_sin_monto',
            JSON.stringify([r.receivableId]),
            err?.message ?? 'Error al enviar recordatorio de factura',
          ]
        );
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error('[whatsapp_message_logs] Error guardando registro de fallo de recordatorio de factura:', logErr?.message || logErr);
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

