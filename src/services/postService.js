/**
 * Servicio para gestionar posts
 */

import { query } from '../config/database.js';

/**
 * Obtener todos los posts de un usuario
 */
export async function getPostsByUser(userId) {
  const result = await query(
    `SELECT 
      id,
      title,
      description,
      hashtags,
      images,
      selected_products,
      platform,
      status,
      scheduled_at,
      store_id,
      created_at,
      updated_at
    FROM posts
    WHERE user_id = $1
    ORDER BY created_at DESC`,
    [userId]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    description: row.description || '',
    hashtags: row.hashtags || [],
    images: row.images || [],
    selectedProducts: row.selected_products || [],
    platform: row.platform,
    status: row.status,
    scheduledAt: row.scheduled_at ? row.scheduled_at.toISOString() : null,
    storeId: row.store_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

/**
 * Obtener todos los posts de una tienda
 */
export async function getPostsByStore(storeId) {
  const result = await query(
    `SELECT 
      id,
      title,
      description,
      hashtags,
      images,
      selected_products,
      platform,
      status,
      scheduled_at,
      user_id,
      created_at,
      updated_at
    FROM posts
    WHERE store_id = $1
    ORDER BY created_at DESC`,
    [storeId]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    description: row.description || '',
    hashtags: row.hashtags || [],
    images: row.images || [],
    selectedProducts: row.selected_products || [],
    platform: row.platform,
    status: row.status,
    scheduledAt: row.scheduled_at ? row.scheduled_at.toISOString() : null,
    userId: row.user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

/**
 * Obtener un post por ID
 */
export async function getPostById(postId, userId) {
  const result = await query(
    `SELECT 
      id,
      title,
      description,
      hashtags,
      images,
      selected_products,
      platform,
      status,
      scheduled_at,
      user_id,
      store_id,
      created_at,
      updated_at
    FROM posts
    WHERE id = $1 AND user_id = $2`,
    [postId, userId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    hashtags: row.hashtags || [],
    images: row.images || [],
    selectedProducts: row.selected_products || [],
    platform: row.platform,
    status: row.status,
    scheduledAt: row.scheduled_at ? row.scheduled_at.toISOString() : null,
    userId: row.user_id,
    storeId: row.store_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Crear un nuevo post
 */
export async function createPost(postData, userId, storeId) {
  const result = await query(
    `INSERT INTO posts (
      title,
      description,
      hashtags,
      images,
      selected_products,
      platform,
      status,
      scheduled_at,
      user_id,
      store_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING 
      id,
      title,
      description,
      hashtags,
      images,
      selected_products,
      platform,
      status,
      scheduled_at,
      created_at,
      updated_at`,
    [
      postData.title,
      postData.description || null,
      postData.hashtags || [],
      postData.images || [],
      postData.selectedProducts || [],
      postData.platform || 'instagram',
      postData.status || 'draft',
      postData.scheduledAt ? new Date(postData.scheduledAt) : null,
      userId,
      storeId,
    ]
  );
  
  const row = result.rows[0];
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    hashtags: row.hashtags || [],
    images: row.images || [],
    selectedProducts: row.selected_products || [],
    platform: row.platform,
    status: row.status,
    scheduledAt: row.scheduled_at ? row.scheduled_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Actualizar un post
 */
export async function updatePost(postId, postData, userId) {
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  if (postData.title !== undefined) {
    updates.push(`title = $${paramCount++}`);
    values.push(postData.title);
  }
  if (postData.description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(postData.description || null);
  }
  if (postData.hashtags !== undefined) {
    updates.push(`hashtags = $${paramCount++}`);
    values.push(postData.hashtags || []);
  }
  if (postData.images !== undefined) {
    updates.push(`images = $${paramCount++}`);
    values.push(postData.images || []);
  }
  if (postData.selectedProducts !== undefined) {
    updates.push(`selected_products = $${paramCount++}`);
    values.push(postData.selectedProducts || []);
  }
  if (postData.platform !== undefined) {
    updates.push(`platform = $${paramCount++}`);
    values.push(postData.platform);
  }
  if (postData.status !== undefined) {
    updates.push(`status = $${paramCount++}`);
    values.push(postData.status);
  }
  if (postData.scheduledAt !== undefined) {
    updates.push(`scheduled_at = $${paramCount++}`);
    values.push(postData.scheduledAt ? new Date(postData.scheduledAt) : null);
  }
  
  if (updates.length === 0) {
    // No hay cambios, retornar el post actual
    return await getPostById(postId, userId);
  }
  
  values.push(postId, userId);
  
  const result = await query(
    `UPDATE posts
    SET ${updates.join(', ')}
    WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
    RETURNING 
      id,
      title,
      description,
      hashtags,
      images,
      selected_products,
      platform,
      status,
      scheduled_at,
      created_at,
      updated_at`,
    values
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    hashtags: row.hashtags || [],
    images: row.images || [],
    selectedProducts: row.selected_products || [],
    platform: row.platform,
    status: row.status,
    scheduledAt: row.scheduled_at ? row.scheduled_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Eliminar un post
 */
export async function deletePost(postId, userId) {
  const result = await query(
    `DELETE FROM posts
    WHERE id = $1 AND user_id = $2
    RETURNING id`,
    [postId, userId]
  );
  
  return result.rows.length > 0;
}
