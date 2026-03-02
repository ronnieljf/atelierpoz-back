/**
 * Servicio de recordatorios de pagos recurrentes.
 * Un recordatorio puede tener muchos destinatarios (clientes).
 * Usa client_recurring_reminders y client_recurring_reminder_recipients.
 */

import { query } from '../config/database.js';

/**
 * Listar recordatorios de una tienda.
 * @param {string} storeId
 * @param {{ limit?: number; offset?: number }} params
 * @returns {Promise<{ reminders: Array; total: number }>}
 */
export async function getRemindersByStore(storeId, params = {}) {
  const { limit = 50, offset = 0 } = params;

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM client_recurring_reminders r WHERE r.store_id = $1`,
    [storeId]
  );
  const total = countResult.rows[0]?.total ?? 0;

  const result = await query(
    `SELECT r.id, r.store_id, r.amount, r.currency, r.next_due_at, r.due_day, r.contact_channel, r.contact, r.enabled,
      r.created_at, r.updated_at, s.name AS store_name
     FROM client_recurring_reminders r
     JOIN stores s ON s.id = r.store_id
     WHERE r.store_id = $1
     ORDER BY r.next_due_at ASC, r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [storeId, limit, offset]
  );

  const reminders = [];
  for (const row of result.rows) {
    const rec = mapReminderRow(row);
    const recipientsResult = await query(
      `SELECT rr.client_id, rr.service_started_at, c.name AS client_name, c.phone AS client_phone, c.email AS client_email
       FROM client_recurring_reminder_recipients rr
       JOIN clients c ON c.id = rr.client_id
       WHERE rr.client_recurring_reminder_id = $1`,
      [row.id]
    );
    rec.recipients = recipientsResult.rows.map((r) => ({
      clientId: r.client_id,
      clientName: r.client_name ?? null,
      clientPhone: r.client_phone ?? null,
      clientEmail: r.client_email ?? null,
      serviceStartedAt: r.service_started_at ?? null,
    }));
    rec.recipientCount = rec.recipients.length;
    reminders.push(rec);
  }

  return { reminders, total };
}

/**
 * Obtener un recordatorio por ID (verificando storeId).
 * @param {string} id
 * @param {string} storeId
 * @returns {Promise<Object|null>}
 */
export async function getReminderById(id, storeId) {
  const result = await query(
    `SELECT r.id, r.store_id, r.amount, r.currency, r.next_due_at, r.due_day, r.contact_channel, r.contact, r.enabled,
      r.created_at, r.updated_at, s.name AS store_name
     FROM client_recurring_reminders r
     JOIN stores s ON s.id = r.store_id
     WHERE r.id = $1 AND r.store_id = $2`,
    [id, storeId]
  );
  if (result.rows.length === 0) return null;

  const rec = mapReminderRow(result.rows[0]);
  const recipientsResult = await query(
    `SELECT rr.client_id, rr.service_started_at, c.name AS client_name, c.phone AS client_phone, c.email AS client_email
     FROM client_recurring_reminder_recipients rr
     JOIN clients c ON c.id = rr.client_id
     WHERE rr.client_recurring_reminder_id = $1`,
    [id]
  );
  rec.recipients = recipientsResult.rows.map((r) => ({
    clientId: r.client_id,
    clientName: r.client_name ?? null,
    clientPhone: r.client_phone ?? null,
    clientEmail: r.client_email ?? null,
    serviceStartedAt: r.service_started_at ?? null,
  }));
  rec.recipientCount = rec.recipients.length;
  return rec;
}

/**
 * Crear recordatorio recurrente con múltiples destinatarios.
 * @param {Object} data
 * @param {string[]} data.client_ids - IDs de clientes (destinatarios)
 * @returns {Promise<Object>}
 */
function deriveContactChannel(contact) {
  if (!contact || typeof contact !== 'string') return 'phone';
  return String(contact).trim().includes('@') ? 'email' : 'phone';
}

export async function createReminder(data) {
  const {
    store_id,
    amount,
    currency = 'USD',
    next_due_at,
    due_day,
    contact,
    contact_channel: contactChannelParam,
    enabled = true,
    client_ids = [],
    service_started_at_by_client_id = {},
  } = data;

  const contactVal = contact != null && String(contact).trim() ? String(contact).trim() : null;
  const contact_channel = contactChannelParam || (contactVal ? deriveContactChannel(contactVal) : 'phone');
  const dueDayVal = due_day != null ? Math.min(31, Math.max(1, parseInt(due_day, 10) || 1)) : null;

  const result = await query(
    `INSERT INTO client_recurring_reminders
      (store_id, amount, currency, next_due_at, due_day, contact_channel, contact, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, store_id, amount, currency, next_due_at, due_day, contact_channel, contact, enabled, created_at, updated_at`,
    [store_id, parseFloat(amount), currency, next_due_at, dueDayVal, contact_channel, contactVal, enabled]
  );
  const reminderId = result.rows[0].id;

  const startedMap = typeof service_started_at_by_client_id === 'object' && service_started_at_by_client_id !== null
    ? service_started_at_by_client_id
    : {};

  for (const clientId of client_ids) {
    if (clientId) {
      const startedAt = startedMap[clientId];
      const startedAtVal = startedAt && String(startedAt).trim() ? String(startedAt).trim() : null;
      await query(
        `INSERT INTO client_recurring_reminder_recipients (client_recurring_reminder_id, client_id, service_started_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (client_recurring_reminder_id, client_id) DO UPDATE SET service_started_at = EXCLUDED.service_started_at`,
        [reminderId, clientId, startedAtVal]
      );
    }
  }

  return getReminderById(reminderId, store_id);
}

/**
 * Actualizar recordatorio.
 * @param {string} id
 * @param {string} storeId
 * @param {Object} data
 * @param {string[]} [data.client_ids] - si se pasa, reemplaza los destinatarios
 * @returns {Promise<Object|null>}
 */
export async function updateReminder(id, storeId, data) {
  const existing = await query('SELECT id FROM client_recurring_reminders WHERE id = $1 AND store_id = $2', [id, storeId]);
  if (existing.rows.length === 0) return null;

  const fields = [];
  const values = [];
  let idx = 1;

  const allowed = ['amount', 'currency', 'next_due_at', 'due_day', 'contact_channel', 'contact', 'enabled'];
  for (const key of allowed) {
    const snake = key;
    if (data[snake] !== undefined) {
      if (snake === 'amount') {
        fields.push(`${snake} = $${idx++}`);
        values.push(parseFloat(data[snake]));
      } else if (snake === 'next_due_at') {
        fields.push(`${snake} = $${idx++}`);
        values.push(data[snake]);
      } else if (snake === 'due_day') {
        fields.push(`${snake} = $${idx++}`);
        const v = data[snake];
        values.push(v != null ? Math.min(31, Math.max(1, parseInt(v, 10) || 1)) : null);
      } else if (snake === 'enabled') {
        fields.push(`${snake} = $${idx++}`);
        values.push(Boolean(data[snake]));
      } else {
        fields.push(`${snake} = $${idx++}`);
        values.push(data[snake] ?? null);
      }
    }
  }

  if (fields.length > 0) {
    values.push(id);
    await query(
      `UPDATE client_recurring_reminders SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx}`,
      values
    );
  }

  if (Array.isArray(data.client_ids)) {
    const startedMap = typeof data.service_started_at_by_client_id === 'object' && data.service_started_at_by_client_id !== null
      ? data.service_started_at_by_client_id
      : {};
    await query('DELETE FROM client_recurring_reminder_recipients WHERE client_recurring_reminder_id = $1', [id]);
    for (const clientId of data.client_ids) {
      if (clientId) {
        const startedAt = startedMap[clientId];
        const startedAtVal = startedAt && String(startedAt).trim() ? String(startedAt).trim() : null;
        await query(
          `INSERT INTO client_recurring_reminder_recipients (client_recurring_reminder_id, client_id, service_started_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (client_recurring_reminder_id, client_id) DO UPDATE SET service_started_at = EXCLUDED.service_started_at`,
          [id, clientId, startedAtVal]
        );
      }
    }
  }

  return getReminderById(id, storeId);
}

/**
 * Eliminar recordatorio.
 * @param {string} id
 * @param {string} storeId
 * @returns {Promise<boolean>}
 */
export async function deleteReminder(id, storeId) {
  const result = await query('DELETE FROM client_recurring_reminders WHERE id = $1 AND store_id = $2', [id, storeId]);
  return (result.rowCount ?? 0) > 0;
}

function mapReminderRow(row) {
  return {
    id: row.id,
    storeId: row.store_id,
    amount: parseFloat(row.amount ?? 0),
    currency: row.currency ?? 'USD',
    nextDueAt: row.next_due_at,
    dueDay: row.due_day != null ? row.due_day : null,
    contactChannel: row.contact_channel ?? 'phone',
    contact: row.contact ?? null,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storeName: row.store_name ?? null,
  };
}
