/**
 * Job: invitación a usar cuentas por cobrar.
 * - Se ejecuta diariamente a las 11:00.
 * - Para cada tienda activa con teléfono:
 *   - Si han pasado 7 días desde la creación de la tienda y tiene 0 receivables → enviar template invitacion_cuentas_por_cobrar (1ª vez).
 *   - Si ya se envió la 1ª y han pasado 15 días desde ese envío y sigue con 0 receivables → enviar 2ª vez.
 * - Máximo 2 mensajes por tienda; si la tienda crea al menos una cuenta por cobrar, no se envía más.
 */

import { query } from '../config/database.js';
import { sendWhatsAppTemplate } from './whatsappService.js';

const TEMPLATE_NAME = 'invitacion_cuentas_por_cobrar';
const LANGUAGE = 'es';
const DAYS_BEFORE_FIRST = 7;
const DAYS_BEFORE_SECOND = 15;

/**
 * Obtiene tiendas activas que tienen al menos un teléfono (store_users.phone_number).
 * @returns {Promise<Array<{ id: string, name: string, created_at: string, phone: string }>>}
 */
async function getActiveStoresWithPhone() {
  const result = await query(
    `SELECT s.id, s.name, s.created_at,
       (SELECT su.phone_number FROM store_users su
        WHERE su.store_id = s.id AND su.phone_number IS NOT NULL AND TRIM(su.phone_number) != ''
        ORDER BY su.is_creator DESC NULLS LAST
        LIMIT 1) AS phone
     FROM stores s
     WHERE s.state = 'active'
       AND EXISTS (
         SELECT 1 FROM store_users su2
         WHERE su2.store_id = s.id AND su2.phone_number IS NOT NULL AND TRIM(su2.phone_number) != ''
       )`,
    []
  );

  return result.rows
    .filter((row) => row.phone && String(row.phone).trim())
    .map((row) => ({
      id: row.id,
      name: row.name || 'Tienda',
      created_at: row.created_at,
      phone: String(row.phone).trim(),
    }));
}

/**
 * Cuenta receivables de una tienda.
 * @param {string} storeId
 * @returns {Promise<number>}
 */
async function getReceivableCountByStore(storeId) {
  const result = await query(
    'SELECT COUNT(*)::int AS total FROM receivables WHERE store_id = $1',
    [storeId]
  );
  return result.rows[0]?.total ?? 0;
}

/**
 * Obtiene los envíos de invitación ya realizados para una tienda (1 y/o 2).
 * @param {string} storeId
 * @returns {Promise<Array<{ invitation_number: number, sent_at: Date }>>}
 */
async function getInvitationSentForStore(storeId) {
  const result = await query(
    `SELECT invitation_number, sent_at FROM store_receivable_invitation_sent WHERE store_id = $1 ORDER BY invitation_number`,
    [storeId]
  );
  return result.rows.map((row) => ({
    invitation_number: row.invitation_number,
    sent_at: row.sent_at,
  }));
}

/**
 * Registra que se envió una invitación.
 * @param {string} storeId
 * @param {number} invitationNumber - 1 o 2
 */
async function recordInvitationSent(storeId, invitationNumber) {
  await query(
    `INSERT INTO store_receivable_invitation_sent (store_id, invitation_number) VALUES ($1, $2)
     ON CONFLICT (store_id, invitation_number) DO NOTHING`,
    [storeId, invitationNumber]
  );
}

/**
 * Fecha en YYYY-MM-DD a medianoche (para comparar días).
 */
function toDateOnly(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

/**
 * Suma días a una fecha (string YYYY-MM-DD o Date).
 */
function addDays(date, days) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00Z') : new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

/**
 * Job principal.
 * @returns {Promise<{ storesChecked: number, invitationsSent: number }>}
 */
export async function runReceivableInvitationJob() {
  const today = toDateOnly(new Date());
  const stores = await getActiveStoresWithPhone();
  let invitationsSent = 0;

  for (const store of stores) {
    try {
      const receivableCount = await getReceivableCountByStore(store.id);
      if (receivableCount > 0) continue;

      const sent = await getInvitationSentForStore(store.id);
      const storeCreated = toDateOnly(store.created_at);

      if (sent.length >= 2) continue;

      if (sent.length === 0) {
        const deadlineFirst = addDays(storeCreated, DAYS_BEFORE_FIRST);
        if (deadlineFirst > today) continue;
        await sendWhatsAppTemplate(store.phone, TEMPLATE_NAME, [store.name], LANGUAGE);
        await recordInvitationSent(store.id, 1);
        invitationsSent++;
        continue;
      }

      if (sent.length === 1 && sent[0].invitation_number === 1) {
        const firstSentAt = toDateOnly(sent[0].sent_at);
        const deadlineSecond = addDays(firstSentAt, DAYS_BEFORE_SECOND);
        if (deadlineSecond > today) continue;
        await sendWhatsAppTemplate(store.phone, TEMPLATE_NAME, [store.name], LANGUAGE);
        await recordInvitationSent(store.id, 2);
        invitationsSent++;
      }
    } catch (err) {
      console.error('[Invitación cuentas por cobrar] Error para tienda', store.id, store.name, err?.message || err);
    }
  }

  return { storesChecked: stores.length, invitationsSent };
}
