/**
 * Servicio de categorías financieras (income_categories y expense_categories).
 * CRUD genérico parametrizado por tabla.
 */

import { query } from '../config/database.js';

function formatCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    description: row.description || null,
    color: row.color || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TABLES = {
  income: 'income_categories',
  expense: 'expense_categories',
};

function tableName(type) {
  const t = TABLES[type];
  if (!t) throw new Error(`Tipo de categoría inválido: ${type}`);
  return t;
}

export async function getCategories(type, storeId) {
  const result = await query(
    `SELECT * FROM ${tableName(type)} WHERE store_id = $1 ORDER BY name ASC`,
    [storeId]
  );
  return result.rows.map(formatCategory);
}

export async function getCategoryById(type, categoryId) {
  const result = await query(
    `SELECT * FROM ${tableName(type)} WHERE id = $1`,
    [categoryId]
  );
  return formatCategory(result.rows[0]);
}

export async function createCategory(type, data) {
  const { storeId, name, description, color } = data;
  if (!name || !name.trim()) throw new Error('El nombre es requerido');

  const dup = await query(
    `SELECT id FROM ${tableName(type)} WHERE store_id = $1 AND LOWER(name) = LOWER($2)`,
    [storeId, name.trim()]
  );
  if (dup.rows.length > 0) throw new Error('Ya existe una categoría con ese nombre');

  const result = await query(
    `INSERT INTO ${tableName(type)} (store_id, name, description, color)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [storeId, name.trim(), description?.trim() || null, color?.trim() || null]
  );
  return formatCategory(result.rows[0]);
}

export async function updateCategory(type, categoryId, updates) {
  const setClauses = ['updated_at = CURRENT_TIMESTAMP'];
  const values = [];
  let idx = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${idx}`);
    values.push(updates.name.trim());
    idx++;
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${idx}`);
    values.push(updates.description?.trim() || null);
    idx++;
  }
  if (updates.color !== undefined) {
    setClauses.push(`color = $${idx}`);
    values.push(updates.color?.trim() || null);
    idx++;
  }

  if (values.length === 0) return getCategoryById(type, categoryId);

  values.push(categoryId);
  const result = await query(
    `UPDATE ${tableName(type)} SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return formatCategory(result.rows[0]);
}

export async function deleteCategory(type, categoryId) {
  await query(`DELETE FROM ${tableName(type)} WHERE id = $1`, [categoryId]);
}
