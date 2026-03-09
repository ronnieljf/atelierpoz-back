/**
 * Servicio de clientes (cartera por tienda)
 */

import { query } from '../config/database.js';

/**
 * Normalizar teléfono a solo dígitos (para búsquedas internas).
 */
function normalizePhone(phone) {
  if (phone == null || typeof phone !== 'string') return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/**
 * Formatear teléfono para almacenamiento / uso en WhatsApp:
 * - Elimina espacios, guiones, paréntesis y símbolos.
 * - Si no tiene código de país, asume Venezuela (58).
 *   Regla:
 *   - Si ya empieza por 58 -> se deja igual (solo dígitos).
 *   - Si no, se quitan ceros a la izquierda y se antepone 58.
 * - Devuelve solo dígitos, sin "+" ni "00".
 */
function formatPhoneForWhatsApp(phone) {
  if (phone == null) return null;
  let raw = String(phone).trim();
  if (!raw) return null;

  // Solo dígitos
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Quitar prefijo internacional "00" si viene así
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // Si ya trae 58 como código de país, lo dejamos así
  if (digits.startsWith('58')) {
    return digits;
  }

  // Si no tiene código de país, asumimos número local: quitar ceros a la izquierda y anteponer 58
  digits = digits.replace(/^0+/, '');
  if (!digits) return null;
  return `58${digits}`;
}

/**
 * @param {string} storeId
 * @param {string} phone - teléfono (se normaliza para buscar)
 * @returns {Promise<Object|null>}
 */
export async function findClientByStoreAndPhone(storeId, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const result = await query(
    `SELECT id, name, phone, email, address, identity_document, store_id, created_at, updated_at
     FROM clients
     WHERE store_id = $1 AND phone IS NOT NULL
       AND REPLACE(REPLACE(REPLACE(COALESCE(phone,''), ' ', ''), '-', ''), '+', '') = $2`,
    [storeId, normalized]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

/**
 * Buscar tiendas que tienen un cliente con el teléfono dado (para webhook WhatsApp).
 * @param {string} phone - Teléfono (se normaliza a solo dígitos)
 * @returns {Promise<Array<{ storeId: string, storeName: string }>>}
 */
export async function findStoresByClientPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  const result = await query(
    `SELECT DISTINCT c.store_id, s.name as store_name
     FROM clients c
     INNER JOIN stores s ON s.id = c.store_id AND s.state = 'active'
     WHERE c.phone IS NOT NULL
       AND REPLACE(REPLACE(REPLACE(COALESCE(c.phone,''), ' ', ''), '-', ''), '+', '') = $1`,
    [normalized]
  );
  return result.rows.map((r) => ({ storeId: r.store_id, storeName: r.store_name }));
}

/**
 * Crear o actualizar cliente a partir de un pedido.
 * - Si hay teléfono: busca por store_id + phone. Si no existe crea; si existe y (nombre vacío o "cliente") actualiza nombre (y email si viene).
 * - Si no hay teléfono, no hace nada.
 * @param {string} storeId
 * @param {{ name?: string, phone?: string, email?: string }} data
 * @returns {Promise<Object|null>} cliente creado o actualizado, o null si no hay phone
 */
export async function upsertClientFromOrder(storeId, data) {
  const phone = data?.phone != null && String(data.phone).trim() !== '' ? String(data.phone).trim() : null;
  if (!phone) return null;

  const name = data?.name != null ? String(data.name).trim() : null;
  const email = data?.email != null && String(data.email).trim() !== '' ? String(data.email).trim() : null;

  const formattedPhone = formatPhoneForWhatsApp(phone);

  // Intentar encontrar cliente tanto por el formato nuevo (58...) como por el antiguo (solo dígitos locales)
  let existing =
    (formattedPhone && (await findClientByStoreAndPhone(storeId, formattedPhone))) ||
    (await findClientByStoreAndPhone(storeId, phone));
  if (!existing) {
    const insert = await query(
      `INSERT INTO clients (name, phone, email, identity_document, store_id)
       VALUES ($1, $2, $3, NULL, $4)
       RETURNING id, name, phone, email, address, identity_document, store_id, created_at, updated_at`,
      [name || null, formattedPhone || normalizePhone(phone), email || null, storeId]
    );
    return insert.rows[0] || null;
  }

  const currentName = existing.name != null ? String(existing.name).trim() : '';
  const isEmptyOrCliente = !currentName || currentName.toLowerCase() === 'cliente';
  if (isEmptyOrCliente && (name || email !== undefined)) {
    const updates = [];
    const values = [];
    let idx = 1;
    if (name !== undefined && name !== null) {
      updates.push(`name = $${idx++}`);
      values.push(name || null);
    }
    if (email !== undefined) {
      updates.push(`email = $${idx++}`);
      values.push(email || null);
    }
    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(existing.id);
      await query(
        `UPDATE clients SET ${updates.join(', ')} WHERE id = $${idx}`,
        values
      );
      const updated = await query(
        `SELECT id, name, phone, email, address, identity_document, store_id, created_at, updated_at FROM clients WHERE id = $1`,
        [existing.id]
      );
      return updated.rows[0] || existing;
    }
  }
  return existing;
}

/**
 * Crear cliente manual. identity_document (cédula) es obligatorio.
 */
export async function createClient(data) {
  const { name, phone, email, address, identity_document, store_id } = data;
  const cedula = identity_document != null ? String(identity_document).trim() : '';
  if (!cedula) {
    const err = new Error('La cédula de identidad es obligatoria');
    err.code = 'VALIDATION';
    throw err;
  }
  const formattedPhone = phone ? formatPhoneForWhatsApp(phone) : null;

  const result = await query(
    `INSERT INTO clients (name, phone, email, address, identity_document, store_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, phone, email, address, identity_document, store_id, created_at, updated_at`,
    [name || null, formattedPhone || null, email || null, address || null, cedula || null, store_id]
  );
  return result.rows[0];
}

/**
 * Listar clientes de una tienda con paginación y búsqueda
 */
export async function getClientsByStore(storeId, options = {}) {
  const { limit = 20, offset = 0, search } = options;
  const params = [storeId];
  let where = 'WHERE store_id = $1';
  if (search != null && String(search).trim() !== '') {
    const term = `%${String(search).trim()}%`;
    params.push(term);
    where += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length} OR identity_document ILIKE $${params.length})`;
  }

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM clients ${where}`,
    params
  );
  const total = countResult.rows[0]?.total ?? 0;

  const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 1000);
  const offsetNum = Math.max(0, parseInt(offset) || 0);
  params.push(limitNum, offsetNum);
  const result = await query(
    `SELECT id, name, phone, email, address, identity_document, store_id, created_at, updated_at
     FROM clients
     ${where}
     ORDER BY updated_at DESC, created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { clients: result.rows, total };
}

/**
 * Obtener un cliente por ID (y opcionalmente validar store_id)
 */
export async function getClientById(clientId, storeId = null) {
  let sql = 'SELECT id, name, phone, email, address, identity_document, store_id, created_at, updated_at FROM clients WHERE id = $1';
  const params = [clientId];
  if (storeId) {
    params.push(storeId);
    sql += ` AND store_id = $${params.length}`;
  }
  const result = await query(sql, params);
  return result.rows[0] || null;
}

/**
 * Obtener clientes por IDs (misma tienda). ids: array de UUID.
 * @param {string} storeId
 * @param {string[]} ids
 * @returns {Promise<Object[]>}
 */
export async function getClientsByIds(storeId, ids) {
  if (!ids || ids.length === 0) return [];
  const validIds = ids.filter((id) => id && typeof id === 'string').slice(0, 500);
  if (validIds.length === 0) return [];
  const placeholders = validIds.map((_, i) => `$${i + 2}`).join(', ');
  const result = await query(
    `SELECT id, name, phone, email, address, identity_document, store_id, created_at, updated_at
     FROM clients
     WHERE store_id = $1 AND id IN (${placeholders})`,
    [storeId, ...validIds]
  );
  return result.rows;
}

/**
 * Actualizar cliente
 */
export async function updateClient(clientId, storeId, updates) {
  const { name, phone, email, address, identity_document } = updates;
  const fields = [];
  const values = [];
  let idx = 1;
  if (name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(name === null || name === '' ? null : String(name).trim());
  }
  if (phone !== undefined) {
    const formattedPhone =
      phone === null || phone === ''
        ? null
        : formatPhoneForWhatsApp(String(phone));
    fields.push(`phone = $${idx++}`);
    values.push(formattedPhone);
  }
  if (email !== undefined) {
    fields.push(`email = $${idx++}`);
    values.push(email === null || email === '' ? null : String(email).trim());
  }
  if (address !== undefined) {
    fields.push(`address = $${idx++}`);
    values.push(address === null || address === '' ? null : String(address).trim());
  }
  if (identity_document !== undefined) {
    fields.push(`identity_document = $${idx++}`);
    values.push(identity_document === null || identity_document === '' ? null : String(identity_document).trim());
  }
  if (fields.length === 0) return getClientById(clientId, storeId);
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(clientId, storeId);
  const result = await query(
    `UPDATE clients SET ${fields.join(', ')} WHERE id = $${idx++} AND store_id = $${idx}
     RETURNING id, name, phone, email, address, identity_document, store_id, created_at, updated_at`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Eliminar cliente
 */
export async function deleteClient(clientId, storeId) {
  const result = await query(
    'DELETE FROM clients WHERE id = $1 AND store_id = $2',
    [clientId, storeId]
  );
  return result.rowCount > 0;
}
