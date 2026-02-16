/**
 * Servicio de categorías (globales)
 * Contiene la lógica de negocio para categorías
 */

import { query } from '../config/database.js';

/**
 * Obtener todas las categorías
 * @returns {Promise<Array>} Array de categorías
 */
export async function getAllCategories() {
  const result = await query(
    `SELECT id, name, slug, store_id, created_at, updated_at
     FROM categories
     ORDER BY name ASC`
  );

  return result.rows;
}

/**
 * Obtener categorías de una tienda (store_id = storeId)
 * @param {string} storeId - ID de la tienda
 * @returns {Promise<Array>} Array de categorías de la tienda
 */
export async function getCategoriesByStoreId(storeId) {
  const result = await query(
    `SELECT id, name, slug, store_id, created_at, updated_at
     FROM categories
     WHERE store_id = $1
     ORDER BY name ASC`,
    [storeId]
  );
  return result.rows;
}

/**
 * Obtener una categoría por ID
 * @param {string} categoryId - ID de la categoría
 * @returns {Promise<Object|null>} Categoría encontrada o null
 */
export async function getCategoryById(categoryId) {
  const result = await query(
    `SELECT id, name, slug, store_id, created_at, updated_at
     FROM categories
     WHERE id = $1`,
    [categoryId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Obtener una categoría por tienda y slug (para validar duplicados por tienda)
 * @param {string} storeId - ID de la tienda
 * @param {string} slug - Slug de la categoría
 * @returns {Promise<Object|null>} Categoría encontrada o null
 */
export async function getCategoryByStoreAndSlug(storeId, slug) {
  if (!slug || !slug.trim()) return null;
  const result = await query(
    `SELECT id, name, slug, store_id, created_at, updated_at
     FROM categories
     WHERE store_id IS NOT DISTINCT FROM $1 AND slug = $2`,
    [storeId ?? null, slug.trim()]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Crear una nueva categoría
 * El slug solo debe ser único dentro de la misma tienda (mismo slug permitido en distintas tiendas).
 * @param {Object} categoryData - Datos de la categoría
 * @param {string} categoryData.name - Nombre de la categoría
 * @param {string} categoryData.slug - Slug de la categoría
 * @param {string|null} [categoryData.store_id] - ID de la tienda (opcional, null = global)
 * @returns {Promise<Object>} Categoría creada
 */
export async function createCategory(categoryData) {
  const { name, slug, store_id } = categoryData;
  const slugVal = (slug && String(slug).trim()) || '';
  const storeIdVal = store_id ?? null;

  const existing = await getCategoryByStoreAndSlug(storeIdVal, slugVal);
  if (existing) {
    const err = new Error('El slug ya existe en esta tienda. Usa otro nombre.');
    err.code = 'DUPLICATE_SLUG_IN_STORE';
    throw err;
  }

  const result = await query(
    `INSERT INTO categories (name, slug, store_id)
     VALUES ($1, $2, $3)
     RETURNING id, name, slug, store_id, created_at, updated_at`,
    [name, slugVal, storeIdVal]
  );

  return result.rows[0];
}

/**
 * Actualizar una categoría
 * Si se actualiza slug, se valida que no esté duplicado en la misma tienda (excluyendo esta categoría).
 * @param {string} categoryId - ID de la categoría
 * @param {Object} updates - Campos a actualizar
 * @returns {Promise<Object|null>} Categoría actualizada o null
 */
export async function updateCategory(categoryId, updates) {
  const { name, slug, store_id } = updates;
  const fields = [];
  const values = [];
  let paramCount = 1;

  if (slug !== undefined) {
    const existing = await getCategoryById(categoryId);
    if (existing) {
      const slugVal = String(slug).trim();
      const other = await query(
        `SELECT id FROM categories WHERE store_id IS NOT DISTINCT FROM $1 AND slug = $2 AND id != $3`,
        [existing.store_id, slugVal, categoryId]
      );
      if (other.rows.length > 0) {
        const err = new Error('El slug ya existe en esta tienda. Usa otro nombre.');
        err.code = 'DUPLICATE_SLUG_IN_STORE';
        throw err;
      }
    }
  }

  if (name !== undefined) {
    fields.push(`name = $${paramCount++}`);
    values.push(name);
  }

  if (slug !== undefined) {
    fields.push(`slug = $${paramCount++}`);
    values.push(slug);
  }

  if (store_id !== undefined) {
    fields.push(`store_id = $${paramCount++}`);
    values.push(store_id === null || store_id === '' ? null : store_id);
  }

  if (fields.length === 0) {
    return getCategoryById(categoryId);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(categoryId);

  const result = await query(
    `UPDATE categories
     SET ${fields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING id, name, slug, store_id, created_at, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Eliminar una categoría
 * @param {string} categoryId - ID de la categoría
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
export async function deleteCategory(categoryId) {
  const result = await query(
    `DELETE FROM categories WHERE id = $1`,
    [categoryId]
  );

  return result.rowCount > 0;
}
