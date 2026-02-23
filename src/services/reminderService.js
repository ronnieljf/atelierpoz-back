/**
 * Servicio de recordatorios de cuentas por cobrar.
 * - Configuración por usuario (días después de creación / después del último abono).
 * - Notificaciones in-app (reminder_notifications).
 * - Job que genera recordatorios para usuarios con reminders_enabled.
 */

import { query } from '../config/database.js';
import { getUserById } from './authService.js';
import { getUserStores } from './storeService.js';
import { getPendingReceivablesWithReferenceDates } from './receivableService.js';
import { sendWhatsAppText } from './whatsappService.js';

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
    reminder_days_after_creation: user.reminder_days_after_creation ?? 30,
    reminder_days_after_last_payment: user.reminder_days_after_last_payment ?? 15,
    reminder_interval_days: user.reminder_interval_days ?? 7,
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
  const today = new Date().toISOString().slice(0, 10);

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
  const usersResult = await query(
    `SELECT id, reminder_days_after_creation, reminder_days_after_last_payment, reminder_interval_days FROM users WHERE reminders_enabled = true`,
    []
  );
  let remindersCreated = 0;
  let whatsappSent = 0;

  for (const u of usersResult.rows) {
    const due = await getReceivablesDueForReminder(u.id);
    const createdForUser = [];

    for (const item of due) {
      try {
        await recordReminderSent(item.receivableId, item.reminderType, item.referenceDate);
        await createReminderNotification(u.id, item.storeId, item.receivableId, item.reminderType);
        remindersCreated++;
        createdForUser.push(item);
      } catch (err) {
        console.error('Error creating reminder for receivable', item.receivableId, item.reminderType, err.message);
      }
    }

    if (createdForUser.length > 0) {
      const phone = await getUserPhoneForReminders(u.id);
      if (phone) {
        try {
          const ids = [...new Set(createdForUser.map((c) => c.receivableId))];
          const details = await getReceivableDetailsForMessage(ids);
          const lines = details.map((d) => {
            const tel = d.customer_phone ? ` - Tel: ${d.customer_phone}` : '';
            return `• ${d.store_name}: ${d.customer_name} - ${d.amount.toFixed(2)} ${d.currency} (#${d.receivable_number})${tel}`;
          });
          const totalsByCurrency = details.reduce((acc, d) => {
            const c = d.currency || 'USD';
            acc[c] = (acc[c] || 0) + d.amount;
            return acc;
          }, {});
          const totalLines = Object.entries(totalsByCurrency).map(([curr, sum]) => `Total ${curr}: ${sum.toFixed(2)}`);
          const totalBlock = totalLines.length > 0 ? `\n\n*${totalLines.join(' | ')}*` : '';
          const message = `🔔 *Recordatorios - Cuentas por cobrar*\n\nTienes ${details.length} cuenta(s) que requieren seguimiento:\n\n${lines.join('\n')}${totalBlock}`;
          await sendWhatsAppText(phone, message);
          whatsappSent++;
        } catch (err) {
          console.error('[Recordatorios] Error enviando WhatsApp al usuario', u.id, err?.message || err);
        }
      }
    }
  }

  return { usersProcessed: usersResult.rows.length, remindersCreated, whatsappSent };
}
