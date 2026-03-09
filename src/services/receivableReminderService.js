/**
 * Servicio de recordatorios programables por cuenta por cobrar.
 * Cada recordatorio tiene: nombre cliente, tienda, factura/cuenta, fecha vencimiento,
 * datos de pago (PagoMovil, transferencia, Binance), datos de contacto, y fecha de envío.
 */

import { query, getClient } from '../config/database.js';
import { getReceivableById } from './receivableService.js';
import { getStoreNameAndPhone } from './storeService.js';
import { createPaymentOption, getPaymentOptionsByStore } from './storePaymentOptionService.js';

function toIsoDateString(value) {
  if (!value) return null;
  // Si viene como Date, usar toISOString; si es string, normalizar a los primeros 10 caracteres (YYYY-MM-DD)
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  // Intentar detectar formato ISO con año al inicio
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  // Fallback: crear Date y devolver YYYY-MM-DD
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return s;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizePaymentData(value) {
  if (value == null) return null;
  let s = String(value);
  // Reemplazar saltos de línea por coma+espacio
  s = s.replace(/\r\n|\r|\n/g, ', ');
  // Colapsar comas repetidas y espacios extra
  s = s.replace(/,\s*,+/g, ', ');
  s = s.replace(/\s{2,}/g, ' ');
  s = s.trim();
  return s || null;
}

function formatReminder(row) {
  if (!row) return null;
  return {
    id: row.id,
    receivableId: row.receivable_id,
    storeId: row.store_id,
    customerPhone: row.customer_phone || null,
    customerName: row.customer_name || null,
    storeName: row.store_name || null,
    invoiceOrAccount: row.invoice_or_account || null,
    fechaVencimiento: toIsoDateString(row.fecha_vencimiento),
    // String vacío si no hay datos, para que el template no dé error
    datosPagomovil: (row.datos_pagomovil != null && String(row.datos_pagomovil).trim()) ? String(row.datos_pagomovil) : '',
    datosTransferencia: (row.datos_transferencia != null && String(row.datos_transferencia).trim()) ? String(row.datos_transferencia) : '',
    datosBinance: (row.datos_binance != null && String(row.datos_binance).trim()) ? String(row.datos_binance) : '',
    datosContacto: (row.datos_contacto != null && String(row.datos_contacto).trim()) ? String(row.datos_contacto) : '',
    fechaEnvio: toIsoDateString(row.fecha_envio),
    esMora: row.es_mora === true,
    repetirVeces: typeof row.repetir_veces === 'number' ? row.repetir_veces : 0,
    repetirCadaDias: typeof row.repetir_cada_dias === 'number' ? row.repetir_cada_dias : 0,
    status: row.status || 'pending',
    sentAt: row.sent_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Obtener datos base de la cuenta para prellenar un recordatorio.
 * @param {string} receivableId
 * @param {string} storeId
 * @returns {Promise<Object|null>} Objeto con datos prellenados o null
 */
export async function getDefaultReminderData(receivableId, storeId) {
  const [receivable, storeInfo] = await Promise.all([
    getReceivableById(receivableId, storeId),
    getStoreNameAndPhone(storeId),
  ]);
  if (!receivable) return null;

  const invoiceOrAccount = receivable.invoiceNumber
    ? String(receivable.invoiceNumber)
    : receivable.receivableNumber
      ? String(receivable.receivableNumber)
      : null;

  return {
    customerName: receivable.customerName || null,
    storeName: storeInfo?.name || receivable.storeName || null,
    invoiceOrAccount,
    fechaVencimiento: receivable.dueDate ? String(receivable.dueDate).slice(0, 10) : null,
    datosContacto: storeInfo?.phoneNumber ? storeInfo.phoneNumber.trim() : null,
  };
}

/**
 * Listar recordatorios de una cuenta por cobrar
 * @param {string} receivableId
 * @param {string} storeId
 * @returns {Promise<Array>}
 */
export async function getRemindersByReceivable(receivableId, storeId) {
  const result = await query(
    `SELECT rr.id, rr.receivable_id, rr.store_id, rr.customer_name, rr.store_name, rr.invoice_or_account,
       rr.fecha_vencimiento, rr.datos_pagomovil, rr.datos_transferencia, rr.datos_binance, rr.datos_contacto,
       rr.fecha_envio, rr.status, rr.sent_at, rr.created_at, rr.updated_at, r.customer_phone
     FROM receivable_reminders rr
     INNER JOIN receivables r ON r.id = rr.receivable_id AND r.store_id = rr.store_id
     WHERE rr.receivable_id = $1 AND rr.store_id = $2
     ORDER BY rr.fecha_envio ASC, rr.created_at ASC`,
    [receivableId, storeId]
  );
  return result.rows.map(formatReminder);
}

/**
 * Crear recordatorio. Los campos no enviados se prellenan desde la cuenta.
 * @param {Object} data
 * @param {string} data.receivableId
 * @param {string} data.storeId
 * @param {string} [data.customerName]
 * @param {string} [data.storeName]
 * @param {string} [data.invoiceOrAccount]
 * @param {string} [data.fechaVencimiento] YYYY-MM-DD
 * @param {string} [data.datosPagomovil]
 * @param {string} [data.datosTransferencia]
 * @param {string} [data.datosBinance]
 * @param {string} [data.datosContacto]
 * @param {boolean} [data.esMora] - Indica si es recordatorio por mora
 * @param {number} [data.repetirVeces] - Cuántas veces se repetirá (0 = no repetir)
 * @param {number} [data.repetirCadaDias] - Cada cuántos días se repetirá (0 = no repetir)
 * @param {string} data.fechaEnvio YYYY-MM-DD (requerido)
 */
export async function createReminder(data) {
  const {
    receivableId,
    storeId,
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
    fechaEnvio,
  } = data;

  if (!fechaEnvio) {
    throw new Error('La fecha de envío es requerida');
  }
  if (!fechaVencimiento) {
    throw new Error('La fecha de vencimiento es requerida');
  }

  const defaults = await getDefaultReminderData(receivableId, storeId);
  if (!defaults) {
    throw new Error('Cuenta por cobrar no encontrada');
  }

  const storeInfo = await getStoreNameAndPhone(storeId);
  const storePhone = storeInfo?.phoneNumber?.trim() || null;

  const normPagomovil = normalizePaymentData(datosPagomovil);
  const normTransferencia = normalizePaymentData(datosTransferencia);
  const normBinance = normalizePaymentData(datosBinance);
  const safeEsMora = esMora === true;
  const repetir = Math.max(1, Math.floor(Number(repetirVeces) || 1));
  const dias = Math.max(0, Math.floor(Number(repetirCadaDias) || 0));

  // Cuántos registros crear: 1 si repetir<=1 o días<=0; si no, repetir registros
  const count = repetir > 1 && dias > 0 ? repetir : 1;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const rows = [];
    for (let i = 0; i < count; i++) {
      const fechaEnvioI = i === 0 ? toIsoDateString(fechaEnvio) : addDays(fechaEnvio, i * dias);
      const result = await client.query(
        `INSERT INTO receivable_reminders (
          receivable_id, store_id, customer_name, store_name, invoice_or_account,
          fecha_vencimiento, datos_pagomovil, datos_transferencia, datos_binance, datos_contacto,
          fecha_envio, status, es_mora, repetir_veces, repetir_cada_dias
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, 'pending', $12, 0, 0)
        RETURNING id, receivable_id, store_id, customer_name, store_name, invoice_or_account,
          fecha_vencimiento, datos_pagomovil, datos_transferencia, datos_binance, datos_contacto,
          fecha_envio, status, sent_at, created_at, updated_at, es_mora, repetir_veces, repetir_cada_dias`,
        [
          receivableId,
          storeId,
          customerName ?? defaults.customerName,
          storeName ?? defaults.storeName,
          invoiceOrAccount ?? defaults.invoiceOrAccount,
          fechaVencimiento,
          normPagomovil,
          normTransferencia,
          normBinance,
          datosContacto || storePhone,
          fechaEnvioI,
          safeEsMora,
        ]
      );
      rows.push(result.rows[0]);
    }

    await client.query('COMMIT');

    const existingOpts = await getPaymentOptionsByStore(storeId);
    for (const [type, data] of [
      ['pagomovil', normPagomovil],
      ['transferencia', normTransferencia],
      ['binance', normBinance],
    ]) {
      const trimmed = (data || '').trim();
      if (!trimmed) continue;
      const opts = existingOpts[type];
      const alreadyExists = opts.some((o) => o.data === trimmed);
      if (!alreadyExists) {
        try {
          await createPaymentOption({ storeId, type, data: trimmed });
        } catch {
          // ignorar si falla al guardar la opción
        }
      }
    }

    return rows.map(formatReminder);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

/**
 * Actualizar recordatorio
 * @param {string} reminderId
 * @param {string} storeId
 * @param {Object} data - Campos a actualizar
 */
export async function updateReminder(reminderId, storeId, data) {
  const {
    customerName,
    storeName,
    invoiceOrAccount,
    fechaVencimiento,
    datosPagomovil,
    datosTransferencia,
    datosBinance,
    datosContacto,
    fechaEnvio,
    status,
    esMora,
    repetirVeces,
    repetirCadaDias,
  } = data;

  const setClauses = [];
  const params = [];
  let idx = 1;

  if (customerName !== undefined) {
    setClauses.push(`customer_name = $${idx++}`);
    params.push(customerName || null);
  }
  if (storeName !== undefined) {
    setClauses.push(`store_name = $${idx++}`);
    params.push(storeName || null);
  }
  if (invoiceOrAccount !== undefined) {
    setClauses.push(`invoice_or_account = $${idx++}`);
    params.push(invoiceOrAccount || null);
  }
  if (fechaVencimiento !== undefined) {
    setClauses.push(`fecha_vencimiento = $${idx++}::date`);
    params.push(fechaVencimiento || null);
  }
  if (datosPagomovil !== undefined) {
    setClauses.push(`datos_pagomovil = $${idx++}`);
    params.push(normalizePaymentData(datosPagomovil));
  }
  if (datosTransferencia !== undefined) {
    setClauses.push(`datos_transferencia = $${idx++}`);
    params.push(normalizePaymentData(datosTransferencia));
  }
  if (datosBinance !== undefined) {
    setClauses.push(`datos_binance = $${idx++}`);
    params.push(normalizePaymentData(datosBinance));
  }
  if (datosContacto !== undefined) {
    const storeInfo = await getStoreNameAndPhone(storeId);
    const storePhone = storeInfo?.phoneNumber?.trim() || null;
    setClauses.push(`datos_contacto = $${idx++}`);
    params.push(datosContacto || storePhone);
  }
  if (esMora !== undefined) {
    setClauses.push(`es_mora = $${idx++}`);
    params.push(esMora === true);
  }
  if (repetirVeces !== undefined) {
    setClauses.push(`repetir_veces = $${idx++}`);
    const safe = typeof repetirVeces === 'number' && repetirVeces > 0 ? Math.floor(repetirVeces) : 0;
    params.push(safe);
  }
  if (repetirCadaDias !== undefined) {
    setClauses.push(`repetir_cada_dias = $${idx++}`);
    const safe = typeof repetirCadaDias === 'number' && repetirCadaDias > 0 ? Math.floor(repetirCadaDias) : 0;
    params.push(safe);
  }
  if (fechaEnvio !== undefined) {
    setClauses.push(`fecha_envio = $${idx++}::date`);
    params.push(fechaEnvio);
  }
  if (status !== undefined && ['pending', 'sent', 'cancelled'].includes(status)) {
    setClauses.push(`status = $${idx++}`);
    params.push(status);
  }

  if (setClauses.length === 0) {
    const existing = await getReminderById(reminderId, storeId);
    return existing;
  }

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(reminderId, storeId);

  const result = await query(
    `UPDATE receivable_reminders SET ${setClauses.join(', ')}
     WHERE id = $${idx} AND store_id = $${idx + 1}
     RETURNING id, receivable_id, store_id, customer_name, store_name, invoice_or_account,
       fecha_vencimiento, datos_pagomovil, datos_transferencia, datos_binance, datos_contacto,
       fecha_envio, status, sent_at, created_at, updated_at`,
    params
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  if (datosPagomovil !== undefined || datosTransferencia !== undefined || datosBinance !== undefined) {
    const existingOpts = await getPaymentOptionsByStore(storeId);
    for (const [type, data] of [
      ['pagomovil', normalizePaymentData(datosPagomovil)],
      ['transferencia', normalizePaymentData(datosTransferencia)],
      ['binance', normalizePaymentData(datosBinance)],
    ]) {
      const trimmed = (data || '').trim();
      if (!trimmed) continue;
      const opts = existingOpts[type];
      const alreadyExists = opts.some((o) => o.data === trimmed);
      if (!alreadyExists) {
        try {
          await createPaymentOption({ storeId, type, data: trimmed });
        } catch {
          // ignorar
        }
      }
    }
  }

  return formatReminder(row);
}

/**
 * Obtener un recordatorio por ID
 */
export async function getReminderById(reminderId, storeId) {
  const result = await query(
    `SELECT rr.id, rr.receivable_id, rr.store_id, rr.customer_name, rr.store_name, rr.invoice_or_account,
       rr.fecha_vencimiento, rr.datos_pagomovil, rr.datos_transferencia, rr.datos_binance, rr.datos_contacto,
       rr.fecha_envio, rr.status, rr.sent_at, rr.created_at, rr.updated_at
     FROM receivable_reminders rr
     WHERE rr.id = $1 AND rr.store_id = $2`,
    [reminderId, storeId]
  );
  if (result.rows.length === 0) return null;
  return formatReminder(result.rows[0]);
}

/**
 * Eliminar recordatorio
 */
export async function deleteReminder(reminderId, storeId) {
  const result = await query(
    `DELETE FROM receivable_reminders WHERE id = $1 AND store_id = $2 RETURNING id`,
    [reminderId, storeId]
  );
  return result.rowCount > 0;
}

/**
 * Obtener recordatorios pendientes para enviar hoy (para job/cron)
 * @param {string} [storeId] - Opcional: filtrar por tienda
 * @returns {Promise<Array>}
 */
export async function getRemindersToSendToday(storeId = null) {
  let sql = `
    SELECT rr.id, rr.receivable_id, rr.store_id, rr.customer_name, rr.store_name, rr.invoice_or_account,
       rr.fecha_vencimiento, rr.datos_pagomovil, rr.datos_transferencia, rr.datos_binance, rr.datos_contacto,
       rr.fecha_envio, r.customer_phone
     FROM receivable_reminders rr
     INNER JOIN receivables r ON r.id = rr.receivable_id AND r.store_id = rr.store_id
     WHERE rr.status = 'pending' AND rr.sent_at IS NULL
       AND rr.fecha_envio = CURRENT_DATE
       AND r.status = 'pending'
  `;
  const params = [];
  if (storeId) {
    params.push(storeId);
    sql += ` AND rr.store_id = $${params.length}`;
  }
  sql += ` ORDER BY rr.fecha_envio, rr.created_at`;

  const result = await query(sql, params);
  return result.rows.map(formatReminder);
}

/**
 * Marcar recordatorio como enviado
 */
export async function markReminderSent(reminderId) {
  await query(
    `UPDATE receivable_reminders SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [reminderId]
  );
}
