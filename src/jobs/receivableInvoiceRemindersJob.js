import { getRemindersToSendToday, markReminderSent } from '../services/receivableReminderService.js';
import { sendWhatsAppTemplate } from '../services/whatsappService.js';
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
    });
  } catch {
    return String(fecha);
  }
}

/**
 * Enviar recordatorios de factura programados para hoy usando la plantilla
 * recordatorio_factura_detalles_sin_boton_sin_monto.
 *
 * Template:
 * 1: customer_name
 * 2: store_name
 * 3: invoice_or_account
 * 4: fecha_vencimiento (humano)
 * 5: datos_pagomovil
 * 6: datos_transferencia
 * 7: datos_binance
 * 8: datos_contacto
 * 9: datos_contacto
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
      const invoiceOrAccount = (r.invoiceOrAccount || '').trim();
      const fechaHumana = formatFechaHumana(r.fechaVencimiento);

      const bodyParams = [
        customerName,                       // {{1}}
        storeName,                          // {{2}}
        invoiceOrAccount || 's/n',          // {{3}}
        fechaHumana || 'sin fecha',         // {{4}}
        r.datosPagomovil || '',             // {{5}}
        r.datosTransferencia || '',         // {{6}}
        r.datosBinance || '',               // {{7}}
        r.datosContacto || '',              // {{8}}
        r.datosContacto || '',              // {{9}}
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

