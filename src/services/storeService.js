/**
 * Servicio de tiendas
 * Contiene la lógica de negocio para tiendas
 */

import { query } from '../config/database.js';

/**
 * Obtener todas las tiendas activas (público)
 * @returns {Promise<Array>} Array de tiendas activas
 */
export async function getAllActiveStores() {
  const result = await query(
    `SELECT 
      id,
      store_id,
      name,
      state,
      logo,
      instagram,
      tiktok,
      description,
      location,
      COALESCE(iva, 0) as iva,
      COALESCE(feature_send_reminder_receivables_whatsapp, false) as feature_send_reminder_receivables_whatsapp,
      created_at,
      updated_at
    FROM stores
    WHERE state = 'active'
    ORDER BY created_at DESC`,
    []
  );

  return result.rows.map(store => ({
    id: store.id,
    store_id: store.store_id ?? null,
    name: store.name,
    state: store.state,
    logo: store.logo ?? null,
    instagram: store.instagram ?? null,
    tiktok: store.tiktok ?? null,
    description: store.description ?? null,
    location: store.location ?? null,
    iva: parseFloat(store.iva) || 0,
    feature_send_reminder_receivables_whatsapp: store.feature_send_reminder_receivables_whatsapp ?? false,
    created_at: store.created_at,
    updated_at: store.updated_at,
  }));
}

/**
 * Obtener una tienda por ID o store_id (público, solo tiendas activas)
 * @param {string} identifier - UUID de la tienda o store_id (slug)
 * @returns {Promise<Object|null>} Tienda encontrada o null
 */
export async function getStoreByIdPublic(identifier) {
  // Verificar si parece un UUID (formato con guiones)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  
  let result;
  if (isUUID) {
    // Buscar por ID (UUID)
    result = await query(
      `SELECT 
        id,
        store_id,
        name,
        state,
        logo,
        instagram,
        tiktok,
        description,
        location,
        COALESCE(iva, 0) as iva,
        COALESCE(feature_send_reminder_receivables_whatsapp, false) as feature_send_reminder_receivables_whatsapp,
        created_at,
        updated_at
      FROM stores
      WHERE id = $1 AND state = 'active'`,
      [identifier]
    );
  } else {
    // Buscar por store_id (slug)
    const trimmed = identifier.trim();
    result = await query(
      `SELECT 
        id,
        store_id,
        name,
        state,
        logo,
        instagram,
        tiktok,
        description,
        location,
        COALESCE(iva, 0) as iva,
        COALESCE(feature_send_reminder_receivables_whatsapp, false) as feature_send_reminder_receivables_whatsapp,
        created_at,
        updated_at
      FROM stores
      WHERE store_id = $1 AND state = 'active'`,
      [trimmed]
    );
  }

  if (result.rows.length === 0) {
    return null;
  }

  const store = result.rows[0];
  return {
    id: store.id,
    store_id: store.store_id ?? null,
    name: store.name,
    state: store.state,
    logo: store.logo ?? null,
    instagram: store.instagram ?? null,
    tiktok: store.tiktok ?? null,
    description: store.description ?? null,
    location: store.location ?? null,
    iva: parseFloat(store.iva) || 0,
    feature_send_reminder_receivables_whatsapp: store.feature_send_reminder_receivables_whatsapp ?? false,
    created_at: store.created_at,
    updated_at: store.updated_at,
  };
}

/**
 * Verificar si una tienda tiene activa la función de recordatorio de cobranzas por WhatsApp
 * @param {string} identifier - UUID de la tienda o store_id (slug)
 * @returns {Promise<{ enabled: boolean }|null>} { enabled: true|false } o null si la tienda no existe o no está activa
 */
export async function getStoreFeatureSendReminderReceivablesWhatsapp(identifier) {
  const store = await getStoreByIdPublic(identifier);
  if (!store) return null;
  return {
    enabled: store.feature_send_reminder_receivables_whatsapp === true,
  };
}

/**
 * Obtener todas las tiendas a las que pertenece un usuario (como creador o como miembro)
 * Incluye tiendas donde el usuario está en store_users con cualquier rol
 * @param {string} userId - ID del usuario
 * @returns {Promise<Array>} Array de tiendas con información adicional (is_creator indica si es creador)
 */
export async function getUserStores(userId) {
  const result = await query(
    `SELECT 
      s.id,
      s.store_id,
      s.name,
      s.state,
      s.logo,
      s.instagram,
      s.tiktok,
      s.description,
      s.location,
      COALESCE(s.iva, 0) as iva,
      COALESCE(s.feature_send_reminder_receivables_whatsapp, false) as feature_send_reminder_receivables_whatsapp,
      s.created_at,
      s.updated_at,
      su.is_creator,
      su.phone_number,
      su.created_at as joined_at
    FROM stores s
    INNER JOIN store_users su ON s.id = su.store_id
    WHERE su.user_id = $1
    ORDER BY su.is_creator DESC, (s.state = 'active') DESC, s.created_at DESC`,
    [userId]
  );

  return result.rows.map(store => ({
    id: store.id,
    store_id: store.store_id ?? null,
    name: store.name,
    state: store.state,
    logo: store.logo ?? null,
    instagram: store.instagram ?? null,
    tiktok: store.tiktok ?? null,
    description: store.description ?? null,
    location: store.location ?? null,
    iva: parseFloat(store.iva) || 0,
    feature_send_reminder_receivables_whatsapp: store.feature_send_reminder_receivables_whatsapp ?? false,
    is_creator: store.is_creator,
    phone_number: store.phone_number,
    created_at: store.created_at,
    updated_at: store.updated_at,
    joined_at: store.joined_at,
  }));
}

/**
 * Obtener una tienda por ID (solo si el usuario pertenece a ella)
 * @param {string} storeId - ID de la tienda
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object|null>} Tienda encontrada o null
 */
export async function getUserStoreById(storeId, userId) {
  const result = await query(
    `SELECT 
      s.id,
      s.store_id,
      s.name,
      s.state,
      s.logo,
      s.instagram,
      s.tiktok,
      s.description,
      s.location,
      COALESCE(s.iva, 0) as iva,
      COALESCE(s.feature_send_reminder_receivables_whatsapp, false) as feature_send_reminder_receivables_whatsapp,
      s.created_at,
      s.updated_at,
      su.is_creator,
      su.phone_number,
      su.created_at as joined_at
    FROM stores s
    INNER JOIN store_users su ON s.id = su.store_id
    WHERE s.id = $1 AND su.user_id = $2`,
    [storeId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const store = result.rows[0];
  return {
    id: store.id,
    store_id: store.store_id ?? null,
    name: store.name,
    state: store.state,
    logo: store.logo ?? null,
    instagram: store.instagram ?? null,
    tiktok: store.tiktok ?? null,
    description: store.description ?? null,
    location: store.location ?? null,
    iva: parseFloat(store.iva) || 0,
    feature_send_reminder_receivables_whatsapp: store.feature_send_reminder_receivables_whatsapp ?? false,
    is_creator: store.is_creator,
    phone_number: store.phone_number,
    created_at: store.created_at,
    updated_at: store.updated_at,
    joined_at: store.joined_at,
  };
}

/**
 * Obtener nombre y teléfono de una tienda (para recordatorios WhatsApp).
 * Usa el teléfono del creador o el primer usuario con teléfono.
 * @param {string} storeId - ID de la tienda
 * @returns {Promise<{ name: string, phoneNumber: string | null }>}
 */
export async function getStoreNameAndPhone(storeId) {
  const result = await query(
    `SELECT s.name,
      (SELECT su.phone_number FROM store_users su
       WHERE su.store_id = s.id AND su.phone_number IS NOT NULL AND su.phone_number != ''
       ORDER BY su.is_creator DESC NULLS LAST
       LIMIT 1) as phone_number
     FROM stores s
     WHERE s.id = $1`,
    [storeId]
  );
  if (result.rows.length === 0) return { name: 'la tienda', phoneNumber: null };
  const row = result.rows[0];
  return {
    name: row.name || 'la tienda',
    phoneNumber: row.phone_number?.trim() || null,
  };
}

/**
 * Verificar si un usuario ya tiene una tienda como creador
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} true si el usuario ya tiene una tienda como creador
 */
export async function userHasStoreAsCreator(userId) {
  const count = await getUserStoreCountAsCreator(userId);
  return count > 0;
}

/**
 * Obtener la cantidad de tiendas que un usuario ha creado
 * @param {string} userId - ID del usuario
 * @returns {Promise<number>} Cantidad de tiendas creadas
 */
export async function getUserStoreCountAsCreator(userId) {
  const result = await query(
    `SELECT COUNT(*) as count
     FROM stores s
     INNER JOIN store_users su ON s.id = su.store_id
     WHERE su.user_id = $1 AND su.is_creator = true AND s.state = 'active'`,
    [userId]
  );

  return parseInt(result.rows[0].count);
}

/**
 * Obtener el límite de tiendas permitido para un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<number>} Límite de tiendas
 */
export async function getUserStoreLimit(userId) {
  const result = await query(
    'SELECT number_stores FROM users WHERE id = $1',
    [userId]
  );
  return result.rows.length > 0 ? (parseInt(result.rows[0].number_stores) || 1) : 1;
}

/**
 * Crear una nueva tienda
 * @param {Object} storeData - Datos de la tienda
 * @param {string} storeData.name - Nombre de la tienda
 * @param {string} storeData.state - Estado de la tienda (default: 'active')
 * @param {string} creatorUserId - ID del usuario creador (opcional)
 * @param {boolean} createStoreUser - Si se debe crear el registro en store_users (default: false)
 * @returns {Promise<Object>} Tienda creada
 */
export async function createStore(storeData, creatorUserId = null, createStoreUser = false) {
  const { name, state = 'active', store_id: storeIdSlug, instagram, tiktok, description, location, iva } = storeData;

  // Si se proporciona store_id, validar que sea único
  if (storeIdSlug != null && String(storeIdSlug).trim()) {
    const slug = String(storeIdSlug).trim();
    const existing = await query(
      'SELECT id FROM stores WHERE store_id = $1',
      [slug]
    );
    if (existing.rows.length > 0) {
      throw new Error('Este store_id ya está en uso por otra tienda');
    }
  }

  // Si se proporciona Instagram, validar que sea único (case-insensitive)
  if (instagram && instagram.trim()) {
    const instagramLower = instagram.trim().toLowerCase();
    const existingStore = await query(
      'SELECT id FROM stores WHERE LOWER(instagram) = $1',
      [instagramLower]
    );

    if (existingStore.rows.length > 0) {
      throw new Error('Este Instagram ya está en uso por otra tienda');
    }
  }

  // Si se proporciona TikTok, validar que sea único (case-insensitive)
  if (tiktok && tiktok.trim()) {
    const tiktokLower = tiktok.trim().toLowerCase();
    const existingStore = await query(
      'SELECT id FROM stores WHERE LOWER(tiktok) = $1',
      [tiktokLower]
    );

    if (existingStore.rows.length > 0) {
      throw new Error('Este TikTok ya está en uso por otra tienda');
    }
  }

  // Crear la tienda
  const storeIdValue = storeIdSlug != null && String(storeIdSlug).trim() ? String(storeIdSlug).trim() : null;
  const instagramValue = instagram && instagram.trim() ? instagram.trim().toLowerCase() : null;
  const tiktokValue = tiktok && tiktok.trim() ? tiktok.trim().toLowerCase() : null;
  const descriptionValue = description && String(description).trim() ? String(description).trim() : null;
  const locationValue = location && String(location).trim() ? String(location).trim() : null;
  const ivaValue = iva != null && !Number.isNaN(parseFloat(iva)) ? Math.max(0, Math.min(100, parseFloat(iva))) : 0;
  const storeResult = await query(
    `INSERT INTO stores (name, state, created_by, store_id, instagram, tiktok, description, location, iva)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, store_id, name, state, logo, instagram, tiktok, description, location, COALESCE(iva, 0) as iva, COALESCE(feature_send_reminder_receivables_whatsapp, false) as feature_send_reminder_receivables_whatsapp, created_at, updated_at`,
    [name, state, creatorUserId, storeIdValue, instagramValue, tiktokValue, descriptionValue, locationValue, ivaValue]
  );

  const store = storeResult.rows[0];

  // Solo crear el registro en store_users si se solicita explícitamente
  if (createStoreUser && creatorUserId) {
    await query(
      `INSERT INTO store_users (store_id, user_id, is_creator)
       VALUES ($1, $2, true)`,
      [store.id, creatorUserId]
    );
  }

  return {
    id: store.id,
    store_id: store.store_id ?? null,
    name: store.name,
    state: store.state,
    logo: store.logo ?? null,
    instagram: store.instagram ?? null,
    tiktok: store.tiktok ?? null,
    description: store.description ?? null,
    location: store.location ?? null,
    iva: parseFloat(store.iva) || 0,
    feature_send_reminder_receivables_whatsapp: store.feature_send_reminder_receivables_whatsapp ?? false,
    created_at: store.created_at,
    updated_at: store.updated_at,
    is_creator: createStoreUser,
    phone_number: null,
    joined_at: store.created_at,
  };
}

/**
 * Actualizar una tienda (solo para admins)
 * @param {string} storeId - ID de la tienda a actualizar
 * @param {Object} storeData - Datos a actualizar
 * @param {string} [storeData.name] - Nuevo nombre
 * @param {string} [storeData.state] - Nuevo estado
 * @param {string} [storeData.logo] - URL del logo (p. ej. desde upload)
 * @param {string} [storeData.instagram] - Usuario de Instagram (único, se convierte a lowercase)
 * @returns {Promise<Object>} Tienda actualizada
 */
export async function updateStore(storeId, storeData) {
  const { name, state, logo, store_id: storeIdSlug, instagram, tiktok, description, location, iva, feature_send_reminder_receivables_whatsapp } = storeData;
  const updates = [];
  const values = [];
  let paramIndex = 1;

  // Verificar que la tienda existe
  const result = await query(
    'SELECT id, name, state, logo, store_id, instagram, tiktok, description, location, COALESCE(iva, 0) as iva, COALESCE(feature_send_reminder_receivables_whatsapp, false) as feature_send_reminder_receivables_whatsapp, created_at, updated_at FROM stores WHERE id = $1',
    [storeId]
  );

  if (result.rows.length === 0) {
    throw new Error('Tienda no encontrada');
  }

  if (name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    values.push(name);
    paramIndex++;
  }

  if (state !== undefined) {
    updates.push(`state = $${paramIndex}`);
    values.push(state);
    paramIndex++;
  }

  if (logo !== undefined) {
    updates.push(`logo = $${paramIndex}`);
    values.push(logo);
    paramIndex++;
  }

  if (storeIdSlug !== undefined) {
    const slug = storeIdSlug != null && String(storeIdSlug).trim() ? String(storeIdSlug).trim() : null;
    if (slug !== null) {
      const existing = await query(
        'SELECT id FROM stores WHERE store_id = $1 AND id != $2',
        [slug, storeId]
      );
      if (existing.rows.length > 0) {
        throw new Error('Este store_id ya está en uso por otra tienda');
      }
    }
    updates.push(`store_id = $${paramIndex}`);
    values.push(slug);
    paramIndex++;
  }

  if (instagram !== undefined) {
    // Convertir a lowercase y validar unicidad
    const instagramLower = instagram ? instagram.trim().toLowerCase() : null;
    
    // Si se proporciona un valor (no null ni vacío), validar unicidad
    if (instagramLower && instagramLower.length > 0) {
      const existingStore = await query(
        'SELECT id FROM stores WHERE LOWER(instagram) = $1 AND id != $2',
        [instagramLower, storeId]
      );
      
      if (existingStore.rows.length > 0) {
        throw new Error('El usuario de Instagram ya está en uso por otra tienda');
      }
    }
    
    updates.push(`instagram = $${paramIndex}`);
    values.push(instagramLower);
    paramIndex++;
  }

  if (tiktok !== undefined) {
    const tiktokValue = tiktok ? tiktok.trim().toLowerCase() : null;

    // Si se proporciona un valor (no null ni vacío), validar unicidad
    if (tiktokValue && tiktokValue.length > 0) {
      const existingStore = await query(
        'SELECT id FROM stores WHERE LOWER(tiktok) = $1 AND id != $2',
        [tiktokValue, storeId]
      );

      if (existingStore.rows.length > 0) {
        throw new Error('El usuario de TikTok ya está en uso por otra tienda');
      }
    }

    updates.push(`tiktok = $${paramIndex}`);
    values.push(tiktokValue);
    paramIndex++;
  }

  if (description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    values.push(description && String(description).trim() ? String(description).trim() : null);
    paramIndex++;
  }

  if (location !== undefined) {
    updates.push(`location = $${paramIndex}`);
    values.push(location && String(location).trim() ? String(location).trim() : null);
    paramIndex++;
  }

  if (iva !== undefined) {
    const ivaNum = iva != null && !Number.isNaN(parseFloat(iva)) ? Math.max(0, Math.min(100, parseFloat(iva))) : 0;
    updates.push(`iva = $${paramIndex}`);
    values.push(ivaNum);
    paramIndex++;
  }

  if (feature_send_reminder_receivables_whatsapp !== undefined) {
    updates.push(`feature_send_reminder_receivables_whatsapp = $${paramIndex}`);
    values.push(Boolean(feature_send_reminder_receivables_whatsapp));
    paramIndex++;
  }

  if (updates.length === 0) {
    const row = result.rows[0];
    return {
      id: row.id,
      store_id: row.store_id ?? null,
      name: row.name,
      state: row.state,
      logo: row.logo ?? null,
      instagram: row.instagram ?? null,
      tiktok: row.tiktok ?? null,
      description: row.description ?? null,
      location: row.location ?? null,
      iva: parseFloat(row.iva) || 0,
      feature_send_reminder_receivables_whatsapp: row.feature_send_reminder_receivables_whatsapp ?? false,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(storeId);

  const updateResult = await query(
    `UPDATE stores
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING id, store_id, name, state, logo, instagram, tiktok, description, location, COALESCE(iva, 0) as iva, COALESCE(feature_send_reminder_receivables_whatsapp, false) as feature_send_reminder_receivables_whatsapp, created_at, updated_at`,
    values
  );

  const row = updateResult.rows[0];
  return {
    id: row.id,
    store_id: row.store_id ?? null,
    name: row.name,
    state: row.state,
    logo: row.logo ?? null,
    instagram: row.instagram ?? null,
    tiktok: row.tiktok ?? null,
    description: row.description ?? null,
    location: row.location ?? null,
    iva: parseFloat(row.iva) || 0,
    feature_send_reminder_receivables_whatsapp: row.feature_send_reminder_receivables_whatsapp ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Verificar si un usuario es el creador de una tienda
 * @param {string} storeId - ID de la tienda
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} true si el usuario es el creador
 */
export async function isStoreCreator(storeId, userId) {
  const result = await query(
    `SELECT is_creator 
     FROM store_users 
     WHERE store_id = $1 AND user_id = $2 AND is_creator = true`,
    [storeId, userId]
  );

  return result.rows.length > 0;
}

/**
 * Buscar un usuario por email
 * @param {string} email - Email del usuario
 * @returns {Promise<Object|null>} Usuario encontrado o null
 */
export async function findUserByEmail(email) {
  const result = await query(
    `SELECT id, email, name, role 
     FROM users 
     WHERE email = $1`,
    [email]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    id: result.rows[0].id,
    email: result.rows[0].email,
    name: result.rows[0].name,
    role: result.rows[0].role,
  };
}

/**
 * Verificar si un usuario ya está en una tienda
 * @param {string} storeId - ID de la tienda
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} true si el usuario ya está en la tienda
 */
export async function userExistsInStore(storeId, userId) {
  const result = await query(
    `SELECT id 
     FROM store_users 
     WHERE store_id = $1 AND user_id = $2`,
    [storeId, userId]
  );

  return result.rows.length > 0;
}

/**
 * Agregar un usuario a una tienda
 * @param {string} storeId - ID de la tienda
 * @param {string} userId - ID del usuario a agregar
 * @param {boolean} isCreator - Si el usuario es creador de la tienda (default: false)
 * @returns {Promise<Object>} Registro creado en store_users
 */
export async function addUserToStore(storeId, userId, isCreator = false) {
  // Verificar que la tienda existe
  const storeResult = await query(
    'SELECT id FROM stores WHERE id = $1',
    [storeId]
  );

  if (storeResult.rows.length === 0) {
    throw new Error('Tienda no encontrada');
  }

  // Verificar que el usuario no esté ya en la tienda
  const exists = await userExistsInStore(storeId, userId);
  if (exists) {
    throw new Error('El usuario ya está agregado a esta tienda');
  }

  // Crear el registro en store_users con el tipo especificado
  const result = await query(
    `INSERT INTO store_users (store_id, user_id, is_creator)
     VALUES ($1, $2, $3)
     RETURNING id, store_id, user_id, is_creator, phone_number, created_at`,
    [storeId, userId, isCreator]
  );

  return {
    id: result.rows[0].id,
    storeId: result.rows[0].store_id,
    userId: result.rows[0].user_id,
    isCreator: result.rows[0].is_creator,
    phoneNumber: result.rows[0].phone_number,
    createdAt: result.rows[0].created_at,
  };
}

/**
 * Eliminar un usuario de una tienda
 * Solo debe llamarse si el solicitante es creador de la tienda (validado en el controlador).
 * No se puede eliminar al único creador de la tienda.
 * @param {string} storeId - ID de la tienda
 * @param {string} userIdToRemove - ID del usuario a eliminar de la tienda
 * @returns {Promise<{ removed: boolean }>}
 */
export async function removeUserFromStore(storeId, userIdToRemove) {
  const storeResult = await query('SELECT id FROM stores WHERE id = $1', [storeId]);
  if (storeResult.rows.length === 0) {
    throw new Error('Tienda no encontrada');
  }

  const userInStore = await query(
    'SELECT is_creator FROM store_users WHERE store_id = $1 AND user_id = $2',
    [storeId, userIdToRemove]
  );
  if (userInStore.rows.length === 0) {
    throw new Error('El usuario no está en esta tienda');
  }

  const isCreatorToRemove = userInStore.rows[0].is_creator;
  if (isCreatorToRemove) {
    const creatorCount = await query(
      'SELECT COUNT(*) as count FROM store_users WHERE store_id = $1 AND is_creator = true',
      [storeId]
    );
    if (parseInt(creatorCount.rows[0].count) <= 1) {
      throw new Error('No puedes eliminar al único creador de la tienda');
    }
  }

  await query(
    'DELETE FROM store_users WHERE store_id = $1 AND user_id = $2',
    [storeId, userIdToRemove]
  );

  return { removed: true };
}

/**
 * Actualizar el número de teléfono de un usuario en una tienda
 * @param {string} storeId - ID de la tienda
 * @param {string} userId - ID del usuario
 * @param {string} phoneNumber - Nuevo número de teléfono
 * @returns {Promise<Object>} Registro actualizado en store_users
 */
export async function updateUserPhoneNumber(storeId, userId, phoneNumber) {
  // Verificar que la tienda existe
  const storeResult = await query(
    'SELECT id FROM stores WHERE id = $1',
    [storeId]
  );

  if (storeResult.rows.length === 0) {
    throw new Error('Tienda no encontrada');
  }

  // Verificar que el usuario esté en la tienda
  const userExists = await userExistsInStore(storeId, userId);
  if (!userExists) {
    throw new Error('El usuario no está asociado a esta tienda');
  }

  // Actualizar el número de teléfono
  const result = await query(
    `UPDATE store_users 
     SET phone_number = $1
     WHERE store_id = $2 AND user_id = $3
     RETURNING id, store_id, user_id, is_creator, phone_number, created_at`,
    [phoneNumber || null, storeId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('No se pudo actualizar el número de teléfono');
  }

  return {
    id: result.rows[0].id,
    storeId: result.rows[0].store_id,
    userId: result.rows[0].user_id,
    isCreator: result.rows[0].is_creator,
    phoneNumber: result.rows[0].phone_number,
    createdAt: result.rows[0].created_at,
    updatedAt: null, // La tabla store_users no tiene updated_at
  };
}

/**
 * Obtener todos los usuarios de una tienda
 * @param {string} storeId - ID de la tienda
 * @returns {Promise<Array>} Array de usuarios de la tienda
 */
export async function getStoreUsers(storeId) {
  // Verificar que la tienda existe
  const storeResult = await query(
    'SELECT id FROM stores WHERE id = $1',
    [storeId]
  );

  if (storeResult.rows.length === 0) {
    throw new Error('Tienda no encontrada');
  }

  // Obtener todos los usuarios de la tienda
  const result = await query(
    `SELECT 
      su.id,
      su.store_id,
      su.user_id,
      su.is_creator,
      su.phone_number,
      su.created_at,
      u.email,
      u.name,
      u.role
    FROM store_users su
    INNER JOIN users u ON su.user_id = u.id
    WHERE su.store_id = $1
    ORDER BY su.is_creator DESC, su.created_at ASC`,
    [storeId]
  );

  // Permisos por usuario (solo no creadores; los creadores tienen todos implícitos)
  const permResult = await query(
    `SELECT sup.user_id, p.code
     FROM store_user_permissions sup
     INNER JOIN permissions p ON p.id = sup.permission_id
     WHERE sup.store_id = $1`,
    [storeId]
  );
  const permissionsByUser = {};
  for (const row of permResult.rows) {
    if (!permissionsByUser[row.user_id]) permissionsByUser[row.user_id] = [];
    permissionsByUser[row.user_id].push(row.code);
  }

  return result.rows.map(row => ({
    id: row.id,
    storeId: row.store_id,
    userId: row.user_id,
    isCreator: row.is_creator,
    phoneNumber: row.phone_number,
    createdAt: row.created_at,
    updatedAt: null,
    userEmail: row.email,
    userName: row.name,
    userRole: row.role,
    permissionCodes: row.is_creator ? null : (permissionsByUser[row.user_id] || []),
  }));
}

/**
 * Obtener store_ids de tiendas donde algún store_user tiene el teléfono dado.
 * Compara solo dígitos (ignora +, espacios, guiones) para hacer match.
 * @param {string} phoneNumber - Teléfono del remitente (ej. wa_id de WhatsApp)
 * @returns {Promise<Array<{storeId: string, storeName?: string}>>}
 */
export async function getStoreIdsByPhoneNumber(phoneNumber) {
  const digits = String(phoneNumber || '').replace(/\D/g, '');
  if (!digits) return [];

  const result = await query(
    `SELECT DISTINCT su.store_id, s.name as store_name
     FROM store_users su
     INNER JOIN stores s ON s.id = su.store_id AND s.state = 'active'
     WHERE su.phone_number IS NOT NULL
       AND su.phone_number != ''
       AND REGEXP_REPLACE(su.phone_number, '[^0-9]', '', 'g') = $1`,
    [digits]
  );

  return result.rows.map((r) => ({
    storeId: r.store_id,
    storeName: r.store_name,
  }));
}

/**
 * Igual que getStoreIdsByPhoneNumber pero incluye user_id para cada tienda (para webhook/acciones que requieren createdBy).
 * @param {string} phoneNumber - Teléfono (ej. wa_id de WhatsApp)
 * @returns {Promise<Array<{storeId: string, storeName?: string, userId: string}>>}
 */
export async function getStoresWithUserIdByPhoneNumber(phoneNumber) {
  const digits = String(phoneNumber || '').replace(/\D/g, '');
  if (!digits) return [];

  const result = await query(
    `SELECT DISTINCT su.store_id, s.name as store_name, su.user_id
     FROM store_users su
     INNER JOIN stores s ON s.id = su.store_id AND s.state = 'active'
     WHERE su.phone_number IS NOT NULL
       AND su.phone_number != ''
       AND REGEXP_REPLACE(su.phone_number, '[^0-9]', '', 'g') = $1`,
    [digits]
  );

  return result.rows.map((r) => ({
    storeId: r.store_id,
    storeName: r.store_name,
    userId: r.user_id,
  }));
}
