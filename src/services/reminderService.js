/**
 * Servicio de recordatorios de cuentas por cobrar.
 * - Configuración por usuario (días después de creación / después del último abono).
 * - Notificaciones in-app (reminder_notifications).
 * - Job que genera recordatorios para usuarios con reminders_enabled.
 */

import { query } from '../config/database.js';
import { getTodayCaracas, getDatePartsCaracas } from '../utils/timezone.js';
import { getUserById } from './authService.js';
import { sendEmail } from './emailService.js';
import { getUserStores } from './storeService.js';
import { getPendingReceivablesWithReferenceDates } from './receivableService.js';
import { sendWhatsAppText, sendWhatsAppTemplate } from './whatsappService.js';

const REMINDER_TYPES = Object.freeze({
  AFTER_CREATION: 'after_creation',
  AFTER_LAST_PAYMENT: 'after_last_payment',
  REPEAT: 'repeat',
});

/**
 * Obtener configuración de recordatorios del usuario.
 * @param {string} userId
 * @returns {Promise<{ reminders_enabled, reminder_days_after_creation, reminder_days_after_last_payment, reminder_interval_days } | null>}
 */
export async function getReminderSettings(userId) {
  const user = await getUserById(userId);
  if (!user) return null;
  return {
    reminders_enabled: Boolean(user.reminders_enabled),
    // Usamos reminder_days_after_creation como día del mes (1-31)
    reminder_days_after_creation: user.reminder_days_after_creation ?? 1,
    // Usamos estos campos como flags 0/1 para los canales
    reminder_days_after_last_payment: user.reminder_days_after_last_payment ?? 0,
    reminder_interval_days: user.reminder_interval_days ?? 0,
    // Días mínimos de antigüedad de la cuenta para incluirla en el reporte
    reminder_min_days_age: user.reminder_min_days_age ?? 30,
  };
}

/**
 * Obtener receivables que deben generar recordatorio para un usuario (sus tiendas, sus días).
 * No escribe en BD; solo calcula qué recordatorios faltan.
 * @param {string} userId
 * @returns {Promise<Array<{ receivableId, storeId, reminderType, referenceDate }>>}
 */
export async function getReceivablesDueForReminder(userId) {
  const user = await getUserById(userId);
  if (!user || !user.reminders_enabled) return [];

  const daysCreation = Math.max(1, Number(user.reminder_days_after_creation) || 30);
  const daysLastPayment = Math.max(1, Number(user.reminder_days_after_last_payment) || 15);
  const intervalDays = Math.max(1, Number(user.reminder_interval_days) || 7);
  const today = getTodayCaracas();

  const stores = await getUserStores(userId);
  const due = [];

  for (const store of stores) {
    const receivables = await getPendingReceivablesWithReferenceDates(store.id);
    if (receivables.length === 0) continue;

    const receivableIds = receivables.map((r) => r.id);
    const sentRows = await query(
      `SELECT receivable_id, reminder_type, reference_date, sent_at FROM receivable_reminder_sent WHERE receivable_id = ANY($1::uuid[])`,
      [receivableIds]
    );
    const sentMap = new Map();
    const lastSentMap = new Map();
    for (const row of sentRows.rows) {
      const key = `${row.receivable_id}_${row.reminder_type}`;
      const ref = row.reference_date ? (typeof row.reference_date === 'string' ? row.reference_date.slice(0, 10) : row.reference_date) : null;
      if (ref && (!sentMap.has(key) || ref > sentMap.get(key))) sentMap.set(key, ref);
      let sentAt = null;
      if (row.sent_at) {
        sentAt = typeof row.sent_at === 'string' ? row.sent_at.slice(0, 10) : row.sent_at.toISOString?.()?.slice(0, 10) ?? null;
      }
      if (sentAt && (!lastSentMap.has(row.receivable_id) || sentAt > lastSentMap.get(row.receivable_id))) {
        lastSentMap.set(row.receivable_id, sentAt);
      }
    }

    for (const rec of receivables) {
      const createdDate = rec.created_at ? (typeof rec.created_at === 'string' ? rec.created_at.slice(0, 10) : rec.created_at) : null;
      const lastPaymentDate = rec.last_payment_date ? (typeof rec.last_payment_date === 'string' ? rec.last_payment_date.slice(0, 10) : rec.last_payment_date) : null;
      if (!createdDate) continue;

      const creationReminderKey = `${rec.id}_${REMINDER_TYPES.AFTER_CREATION}`;
      const creationDeadline = addDays(createdDate, daysCreation);
      if (creationDeadline <= today && !sentMap.has(creationReminderKey)) {
        due.push({
          receivableId: rec.id,
          storeId: rec.store_id,
          reminderType: REMINDER_TYPES.AFTER_CREATION,
          referenceDate: createdDate,
        });
      }

      const refDate = lastPaymentDate || createdDate;
      const lastPaymentReminderKey = `${rec.id}_${REMINDER_TYPES.AFTER_LAST_PAYMENT}`;
      const lastPaymentDeadline = addDays(refDate, daysLastPayment);
      if (lastPaymentDeadline <= today) {
        const alreadySentRef = sentMap.get(lastPaymentReminderKey);
        if (!alreadySentRef || alreadySentRef < refDate) {
          due.push({
            receivableId: rec.id,
            storeId: rec.store_id,
            reminderType: REMINDER_TYPES.AFTER_LAST_PAYMENT,
            referenceDate: refDate,
          });
        }
      }
    }

    const dueReceivableIds = new Set(due.map((d) => d.receivableId));
    for (const rec of receivables) {
      if (dueReceivableIds.has(rec.id)) continue;
      const lastSent = lastSentMap.get(rec.id);
      if (!lastSent) continue;
      const repeatDeadline = addDays(lastSent, intervalDays);
      if (repeatDeadline <= today) {
        due.push({
          receivableId: rec.id,
          storeId: rec.store_id,
          reminderType: REMINDER_TYPES.REPEAT,
          referenceDate: lastSent,
        });
      }
    }
  }

  return due;
}

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Registrar que se envió un recordatorio (evitar duplicados).
 * @param {string} receivableId
 * @param {string} reminderType - 'after_creation' | 'after_last_payment' | 'repeat'
 * @param {string} referenceDate - YYYY-MM-DD
 */
export async function recordReminderSent(receivableId, reminderType, referenceDate) {
  await query(
    `INSERT INTO receivable_reminder_sent (receivable_id, reminder_type, reference_date) VALUES ($1, $2, $3::date)`,
    [receivableId, reminderType, referenceDate]
  );
}

/**
 * Crear notificación in-app de recordatorio para un usuario.
 * @param {string} userId
 * @param {string} storeId
 * @param {string} receivableId
 * @param {string} reminderType
 */
export async function createReminderNotification(userId, storeId, receivableId, reminderType) {
  await query(
    `INSERT INTO reminder_notifications (user_id, store_id, receivable_id, reminder_type) VALUES ($1, $2, $3, $4)`,
    [userId, storeId, receivableId, reminderType]
  );
}

/**
 * Listar notificaciones de recordatorio del usuario (no descartadas).
 * @param {string} userId
 * @returns {Promise<Array<{ id, store_id, store_name, receivable_id, receivable_number, customer_name, reminder_type, created_at }>>}
 */
export async function getReminderNotifications(userId) {
  const result = await query(
    `SELECT rn.id, rn.store_id, rn.receivable_id, rn.reminder_type, rn.created_at,
      s.name AS store_name,
      r.receivable_number, r.customer_name
     FROM reminder_notifications rn
     JOIN stores s ON s.id = rn.store_id
     JOIN receivables r ON r.id = rn.receivable_id
     WHERE rn.user_id = $1 AND rn.dismissed_at IS NULL
     ORDER BY rn.created_at DESC`,
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    store_id: row.store_id,
    store_name: row.store_name,
    receivable_id: row.receivable_id,
    receivable_number: row.receivable_number,
    customer_name: row.customer_name,
    reminder_type: row.reminder_type,
    created_at: row.created_at,
  }));
}

/**
 * Marcar una notificación como descartada.
 * @param {string} notificationId
 * @param {string} userId
 * @returns {Promise<boolean>} true si se actualizó
 */
export async function dismissReminderNotification(notificationId, userId) {
  const result = await query(
    `UPDATE reminder_notifications SET dismissed_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND dismissed_at IS NULL`,
    [notificationId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Obtener teléfono del usuario (desde store_users; primer número no vacío).
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function getUserPhoneForReminders(userId) {
  const result = await query(
    `SELECT phone_number FROM store_users WHERE user_id = $1 AND phone_number IS NOT NULL AND TRIM(phone_number) != '' LIMIT 1`,
    [userId]
  );
  const phone = result.rows[0]?.phone_number?.trim();
  return phone || null;
}

/**
 * Obtener detalles de receivables para armar mensaje (store_name, customer_name, amount, currency, receivable_number).
 * @param {string[]} receivableIds
 * @returns {Promise<Array<{ id, store_name, customer_name, amount, currency, receivable_number }>>}
 */
async function getReceivableDetailsForMessage(receivableIds) {
  if (!receivableIds?.length) return [];
  const result = await query(
    `SELECT r.id, r.customer_name, r.customer_phone, r.amount, r.currency, r.receivable_number, s.name AS store_name
     FROM receivables r
     JOIN stores s ON s.id = r.store_id
     WHERE r.id = ANY($1::uuid[])`,
    [receivableIds]
  );
  return result.rows.map((row) => ({
    id: row.id,
    store_name: row.store_name || 'Tienda',
    customer_name: row.customer_name || 'Sin nombre',
    customer_phone: row.customer_phone?.trim() || null,
    amount: parseFloat(row.amount) || 0,
    currency: row.currency || 'USD',
    receivable_number: row.receivable_number,
  }));
}

/**
 * Job: para cada usuario con reminders_enabled, calcular receivables debido, crear
 * receivable_reminder_sent + reminder_notifications y enviar un WhatsApp con el resumen.
 * @returns {Promise<{ usersProcessed: number, remindersCreated: number, whatsappSent: number }>}
 */
export async function runReceivableRemindersJob() {
  // Job mensual: para cada usuario con reminders_enabled,
  // si hoy es el día configurado, enviar un reporte con las
  // cuentas por cobrar con más de 30 días de creadas.
  const usersResult = await query(
    `SELECT id,
            email,
            reminders_enabled,
            reminder_days_after_creation,
            reminder_days_after_last_payment,
            reminder_interval_days,
            reminder_min_days_age
     FROM users
     WHERE reminders_enabled = true`,
    []
  );

  let usersProcessed = 0;
  let reportsSentWhatsApp = 0;
  let reportsSentEmail = 0;

  const { year, month, day: currentDay } = getDatePartsCaracas();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (const u of usersResult.rows) {
    usersProcessed++;

    const rawDay = Number(u.reminder_days_after_creation) || 1;
    const configuredDay = Math.max(1, Math.min(31, rawDay));
    const effectiveDay = Math.min(configuredDay, daysInMonth);

    const sendEmailFlag = (Number(u.reminder_days_after_last_payment) || 0) > 0;
    const sendPhoneFlag = (Number(u.reminder_interval_days) || 0) > 0;

    if (currentDay !== effectiveDay) {
      continue;
    }

    if (!sendEmailFlag && !sendPhoneFlag) {
      continue;
    }

    const stores = await getUserStores(u.id);
    if (!stores.length) continue;

    const minDays = Math.max(1, Math.min(365, Number(u.reminder_min_days_age) || 30));
    const todayCaracas = getTodayCaracas();
    const thresholdDate = new Date(todayCaracas + 'T12:00:00');
    thresholdDate.setDate(thresholdDate.getDate() - minDays);
    const threshold = thresholdDate.toISOString().slice(0, 10);

    const receivableIds = [];

    for (const store of stores) {
      const receivables = await getPendingReceivablesWithReferenceDates(store.id);
      for (const rec of receivables) {
        const createdDate =
          rec.created_at && typeof rec.created_at === 'string'
            ? rec.created_at.slice(0, 10)
            : rec.created_at?.toISOString?.().slice(0, 10) ?? null;
        if (!createdDate) continue;
        if (createdDate <= threshold) {
          receivableIds.push(rec.id);
          // Creamos también una notificación in-app sencilla
          try {
            await createReminderNotification(u.id, rec.store_id, rec.id, REMINDER_TYPES.REPEAT);
          } catch (err) {
            console.error('Error creating monthly reminder notification for receivable', rec.id, err?.message || err);
          }
        }
      }
    }

    if (!receivableIds.length) continue;

    const details = await getReceivableDetailsForMessage([...new Set(receivableIds)]);
    if (!details.length) continue;

    const storeNames = [...new Set(details.map((d) => d.store_name).filter(Boolean))];
    const nombreTienda = storeNames.length === 1 ? storeNames[0] : storeNames.length > 1 ? 'Tus tiendas' : 'Tienda';
    const cantidadCuentas = String(details.length || 0);

    const lines = details.map((d) => {
      const tel = d.customer_phone ? ` Tel: ${d.customer_phone}` : '';
      const base = `${d.customer_name} - ${d.amount.toFixed(2)} ${d.currency} (#${d.receivable_number})${tel}`;
      // Si hay más de una tienda, incluimos el nombre de la tienda en cada línea.
      return storeNames.length > 1 ? `${d.store_name}: ${base}` : base;
    });

    const totalsByCurrency = details.reduce((acc, d) => {
      const c = d.currency || 'USD';
      acc[c] = (acc[c] || 0) + d.amount;
      return acc;
    }, {});
    const montoTotal =
      Object.entries(totalsByCurrency)
        .map(([curr, sum]) => `${curr} ${sum.toFixed(2)}`)
        .join(' | ') || '0';

    // Enviar por WhatsApp si está habilitado y hay teléfono
    if (sendPhoneFlag) {
      const phone = await getUserPhoneForReminders(u.id);
      if (phone) {
        try {
          const listaDeClientes = lines.map((l) => `• ${l}`).join('\n');
          const bodyParams = [nombreTienda, cantidadCuentas, listaDeClientes, montoTotal];
          await sendWhatsAppTemplate(
            phone,
            'recordatorio_de_cuentas_por_cobrar_pendientes',
            bodyParams,
            'es',
            null,
            null
          );
          reportsSentWhatsApp++;
        } catch (err) {
          console.error('[Recordatorios] Error enviando WhatsApp mensual al usuario', u.id, err?.message || err);
        }
      }
    }

    // Enviar por correo si está habilitado y hay email
    if (sendEmailFlag && u.email) {
      try {
        const subject = 'Recordatorio de Cuentas por Cobrar';
        const textLines = [
          `Hola ${nombreTienda},`,
          '',
          `Tienes ${cantidadCuentas} cuenta(s) que requieren seguimiento:`,
          '',
          ...lines.map((l) => `• ${l}`),
          '',
          `📊 Resumen financiero:`,
          `Total por cobrar: ${montoTotal}`,
          '',
          'Mantengamos el flujo de caja saludable. ¡Mucho éxito con el seguimiento hoy!',
        ];
        const text = textLines.join('\n');
        const result = await sendEmail({
          to: u.email,
          subject,
          text,
          html: undefined,
        });
        if (result.success) {
          reportsSentEmail++;
        }
      } catch (err) {
        console.error('[Recordatorios] Error enviando email mensual al usuario', u.id, err?.message || err);
      }
    }
  }

  return {
    usersProcessed,
    remindersCreated: 0,
    whatsappSent: reportsSentWhatsApp,
    emailSent: reportsSentEmail,
  };
}

/**
 * Ejecutar el job de recordatorios solo para un usuario concreto (ejecución manual).
 * Respeta la configuración del usuario (día del mes, canales, días mínimos).
 * @param {string} userId
 */
export async function runReceivableRemindersJobForUser(userId) {
  const { year, month, day: currentDay } = getDatePartsCaracas();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const { rows } = await query(
    `SELECT id,
            email,
            reminders_enabled,
            reminder_days_after_creation,
            reminder_days_after_last_payment,
            reminder_interval_days,
            reminder_min_days_age
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (!rows.length) {
    return { usersProcessed: 0, remindersCreated: 0, whatsappSent: 0, emailSent: 0 };
  }

  const u = rows[0];
  if (!u.reminders_enabled) {
    return { usersProcessed: 0, remindersCreated: 0, whatsappSent: 0, emailSent: 0 };
  }

  const rawDay = Number(u.reminder_days_after_creation) || 1;
  const configuredDay = Math.max(1, Math.min(31, rawDay));
  const effectiveDay = Math.min(configuredDay, daysInMonth);

  const sendEmailFlag = (Number(u.reminder_days_after_last_payment) || 0) > 0;
  const sendPhoneFlag = (Number(u.reminder_interval_days) || 0) > 0;

  if (!sendEmailFlag && !sendPhoneFlag) {
    return { usersProcessed: 1, remindersCreated: 0, whatsappSent: 0, emailSent: 0 };
  }

  // Permitir ejecutar manualmente aunque hoy no sea el día exacto, pero
  // respetando el resto de filtros (antigüedad, canales).
  // Si quisieras forzar a que solo funcione el día configurado, descomenta:
  // if (currentDay !== effectiveDay) return { usersProcessed: 1, remindersCreated: 0, whatsappSent: 0, emailSent: 0 };

  const stores = await getUserStores(u.id);
  if (!stores.length) {
    return { usersProcessed: 1, remindersCreated: 0, whatsappSent: 0, emailSent: 0 };
  }

  const minDays = Math.max(1, Math.min(365, Number(u.reminder_min_days_age) || 30));
  const todayCaracas = getTodayCaracas();
  const thresholdDate = new Date(todayCaracas + 'T12:00:00');
  thresholdDate.setDate(thresholdDate.getDate() - minDays);
  const threshold = thresholdDate.toISOString().slice(0, 10);

  const receivableIds = [];

  for (const store of stores) {
    const receivables = await getPendingReceivablesWithReferenceDates(store.id);
    for (const rec of receivables) {
      const createdDate =
        rec.created_at && typeof rec.created_at === 'string'
          ? rec.created_at.slice(0, 10)
          : rec.created_at?.toISOString?.().slice(0, 10) ?? null;
      if (!createdDate) continue;
      if (createdDate <= threshold) {
        receivableIds.push(rec.id);
        try {
          await createReminderNotification(u.id, rec.store_id, rec.id, REMINDER_TYPES.REPEAT);
        } catch (err) {
          console.error(
            'Error creating monthly reminder notification for receivable (manual run)',
            rec.id,
            err?.message || err
          );
        }
      }
    }
  }

  if (!receivableIds.length) {
    return { usersProcessed: 1, remindersCreated: 0, whatsappSent: 0, emailSent: 0 };
  }

  const details = await getReceivableDetailsForMessage([...new Set(receivableIds)]);
  if (!details.length) {
    return { usersProcessed: 1, remindersCreated: 0, whatsappSent: 0, emailSent: 0 };
  }

  const storeNames = [...new Set(details.map((d) => d.store_name).filter(Boolean))];
  const nombreTienda = storeNames.length === 1 ? storeNames[0] : storeNames.length > 1 ? 'Tus tiendas' : 'Tienda';
  const cantidadCuentas = String(details.length || 0);

  const lines = details.map((d) => {
    const tel = d.customer_phone ? ` Tel: ${d.customer_phone}` : '';
    const base = `${d.customer_name} - ${d.amount.toFixed(2)} ${d.currency} (#${d.receivable_number})${tel}`;
    return storeNames.length > 1 ? `${d.store_name}: ${base}` : base;
  });

  const totalsByCurrency = details.reduce((acc, d) => {
    const c = d.currency || 'USD';
    acc[c] = (acc[c] || 0) + d.amount;
    return acc;
  }, {});
  const montoTotal =
    Object.entries(totalsByCurrency)
      .map(([curr, sum]) => `${curr} ${sum.toFixed(2)}`)
      .join(' | ') || '0';

  let whatsappSent = 0;
  let emailSent = 0;

  if (sendPhoneFlag) {
    const phone = await getUserPhoneForReminders(u.id);
    if (phone) {
      try {
        const listaDeClientes = lines.map((l) => `• ${l}`).join('\n');
        const bodyParams = [nombreTienda, cantidadCuentas, listaDeClientes, montoTotal];
        await sendWhatsAppTemplate(
          phone,
          'recordatorio_de_cuentas_por_cobrar_pendientes',
          bodyParams,
          'es',
          null,
          'https://atelierpoz.com/admin'
        );
        whatsappSent++;
      } catch (err) {
        console.error('[Recordatorios] Error enviando WhatsApp mensual (manual) al usuario', u.id, err?.message || err);
      }
    }
  }

  if (sendEmailFlag && u.email) {
    try {
      const subject = 'Recordatorio de Cuentas por Cobrar';
      const textLines = [
        `Hola ${nombreTienda},`,
        '',
        `Tienes ${cantidadCuentas} cuenta(s) que requieren seguimiento:`,
        '',
        ...lines.map((l) => `• ${l}`),
        '',
        `📊 Resumen financiero:`,
        `Total por cobrar: ${montoTotal}`,
        '',
        'Mantengamos el flujo de caja saludable. ¡Mucho éxito con el seguimiento hoy!',
      ];
      const text = textLines.join('\n');
      const result = await sendEmail({
        to: u.email,
        subject,
        text,
        html: undefined,
      });
      if (result.success) {
        emailSent++;
      }
    } catch (err) {
      console.error('[Recordatorios] Error enviando email mensual (manual) al usuario', u.id, err?.message || err);
    }
  }

  return {
    usersProcessed: 1,
    remindersCreated: receivableIds.length,
    whatsappSent,
    emailSent,
  };
}
