/**
 * Servicio de proveedores (vendors) — espejo de clientService
 */

import { query } from '../config/database.js';

function formatVendor(row) {
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name || null,
    phone: row.phone || null,
    email: row.email || null,
    address: row.address || null,
    identityDocument: row.identity_document || null,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getVendorsByStore(storeId, options = {}) {
  const { limit = 50, offset = 0, search } = options;
  const conditions = ['store_id = $1'];
  const params = [storeId];
  let idx = 2;

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(`(name ILIKE $${idx} OR phone ILIKE $${idx} OR email ILIKE $${idx} OR identity_document ILIKE $${idx})`);
    params.push(term);
    idx++;
  }

  const where = conditions.join(' AND ');

  const countRes = await query(`SELECT COUNT(*) FROM vendors WHERE ${where}`, params);
  const total = parseInt(countRes.rows[0].count, 10);

  params.push(parseInt(limit, 10) || 50);
  params.push(parseInt(offset, 10) || 0);

  const result = await query(
    `SELECT * FROM vendors WHERE ${where} ORDER BY COALESCE(name, '') ASC, created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return { vendors: result.rows.map(formatVendor), total };
}

export async function getVendorById(vendorId, storeId = null) {
  const result = storeId
    ? await query('SELECT * FROM vendors WHERE id = $1 AND store_id = $2', [vendorId, storeId])
    : await query('SELECT * FROM vendors WHERE id = $1', [vendorId]);
  return formatVendor(result.rows[0]);
}

export async function createVendor(data) {
  const { storeId, name, phone, email, address, identityDocument, notes } = data;

  const result = await query(
    `INSERT INTO vendors (store_id, name, phone, email, address, identity_document, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      storeId,
      name?.trim() || null,
      phone?.trim() || null,
      email?.trim() || null,
      address?.trim() || null,
      identityDocument?.trim() || null,
      notes?.trim() || null,
    ]
  );
  return formatVendor(result.rows[0]);
}

export async function updateVendor(vendorId, storeId, updates) {
  const setClauses = ['updated_at = CURRENT_TIMESTAMP'];
  const values = [];
  let idx = 1;

  const fields = { name: 'name', phone: 'phone', email: 'email', address: 'address', identityDocument: 'identity_document', notes: 'notes' };
  for (const [key, col] of Object.entries(fields)) {
    if (updates[key] !== undefined) {
      setClauses.push(`${col} = $${idx}`);
      values.push(updates[key]?.trim() || null);
      idx++;
    }
  }

  if (values.length === 0) return getVendorById(vendorId, storeId);

  values.push(vendorId);
  values.push(storeId);
  const result = await query(
    `UPDATE vendors SET ${setClauses.join(', ')} WHERE id = $${idx} AND store_id = $${idx + 1} RETURNING *`,
    values
  );
  return formatVendor(result.rows[0]);
}

export async function deleteVendor(vendorId, storeId) {
  const result = await query('DELETE FROM vendors WHERE id = $1 AND store_id = $2', [vendorId, storeId]);
  return result.rowCount > 0;
}
