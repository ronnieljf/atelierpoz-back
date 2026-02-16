/**
 * Servicio de productos
 * Contiene la lógica de negocio para productos
 */

import { query } from '../config/database.js';

/**
 * Obtener todos los productos de una tienda
 * @param {string} storeIdentifier - UUID de la tienda o store_id (slug)
 * @param {Object} options - Opciones de filtrado
 * @returns {Promise<Array>} Array de productos
 */
export async function getProductsByStore(storeIdentifier, options = {}) {
  const { categoryId, limit, offset, search, minPrice, maxPrice } = options;
  // Verificar si parece un UUID (formato con guiones)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeIdentifier);
  
  let storeCondition;
  const params = [];
  let paramIdx = 1;
  
  if (isUUID) {
    // Buscar por ID (UUID)
    storeCondition = `p.store_id = $${paramIdx}`;
    params.push(storeIdentifier);
  } else {
    // Buscar por store_id (slug)
    const slug = storeIdentifier.trim();
    storeCondition = `s.store_id = $${paramIdx}`;
    params.push(slug);
  }
  
  paramIdx++;
  
  const baseFrom = `
    FROM products p
    INNER JOIN categories c ON p.category_id = c.id
    INNER JOIN stores s ON p.store_id = s.id
    WHERE ${storeCondition} AND s.state = 'active' AND p.visible_in_store = true
  `;
  
  const extraWhere = [];

  if (categoryId) {
    extraWhere.push(`p.category_id = $${paramIdx}`);
    params.push(categoryId);
    paramIdx++;
  }

  if (minPrice != null && minPrice !== '' && !Number.isNaN(Number(minPrice))) {
    extraWhere.push(`p.base_price >= $${paramIdx}`);
    params.push(Number(minPrice));
    paramIdx++;
  }

  if (maxPrice != null && maxPrice !== '' && !Number.isNaN(Number(maxPrice))) {
    extraWhere.push(`p.base_price <= $${paramIdx}`);
    params.push(Number(maxPrice));
    paramIdx++;
  }

  if (search && search.trim()) {
    const searchVal = `%${search.trim()}%`;
    extraWhere.push(`(p.name ILIKE $${paramIdx} OR p.sku ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx} OR c.slug ILIKE $${paramIdx})`);
    params.push(searchVal);
    paramIdx++;
  }

  const whereSuffix = extraWhere.length ? ` AND ${extraWhere.join(' AND ')}` : '';
  const countParams = [...params];

  const countSql = `SELECT COUNT(*)::int as total ${baseFrom}${whereSuffix}`;
  const countResult = await query(countSql, countParams);
  const total = (countResult.rows[0] && countResult.rows[0].total) || 0;

  let dataSql = `
    SELECT
      p.id, p.name, p.description, p.base_price, p.currency, p.stock, p.sku,
      p.category_id, p.store_id, p.images, p.attributes, p.combinations, p.rating, p.review_count, p.tags,
      p.visible_in_store, p.hide_price, p.sort_order, COALESCE(p.iva, 0) as iva, p.created_at, p.updated_at,
      c.name as category_name, c.slug as category_slug,
      s.name as store_name, s.store_id as store_slug, s.state as store_state,
      s.created_at as store_created_at, s.updated_at as store_updated_at
    ${baseFrom}${whereSuffix}
    ORDER BY p.sort_order ASC NULLS LAST, p.updated_at DESC
  `;
  if (limit != null && limit > 0) {
    dataSql += ` LIMIT $${paramIdx++}`;
    params.push(limit);
    if (offset != null && offset > 0) {
      dataSql += ` OFFSET $${paramIdx++}`;
      params.push(offset);
    }
  }

  const result = await query(dataSql, params);

  // Si no hay productos, retornar vacío
  if (result.rows.length === 0) {
    return {
      products: [],
      total: 0,
    };
  }

  // Obtener el store_id del primer producto (todos los productos tienen el mismo store_id)
  const actualStoreId = result.rows[0].store_id;

  // Obtener store_users con phone_number (solo los que tienen teléfono)
  const storeUsersResult = await query(
    `SELECT 
      su.id,
      su.user_id,
      su.is_creator,
      su.phone_number,
      su.created_at,
      u.name as user_name,
      u.email as user_email
    FROM store_users su
    INNER JOIN users u ON su.user_id = u.id
    WHERE su.store_id = $1 
      AND su.phone_number IS NOT NULL 
      AND su.phone_number != ''
    ORDER BY su.is_creator DESC, su.created_at ASC`,
    [actualStoreId]
  );
  
  // Formatear store_users para el frontend (solo los que tienen phone_number)
  const formattedStoreUsers = storeUsersResult.rows
    .filter(su => su.phone_number && su.phone_number.trim() !== '')
    .map(su => ({
      id: su.id,
      userId: su.user_id,
      isCreator: su.is_creator,
      phoneNumber: su.phone_number,
      createdAt: su.created_at,
      userName: su.user_name,
      userEmail: su.user_email,
    }));
  
  // Usar el phone_number del creador o el primero disponible
  const storePhoneNumber = storeUsersResult.rows.find(su => su.is_creator && su.phone_number)?.phone_number 
    || storeUsersResult.rows.find(su => su.phone_number)?.phone_number 
    || null;
  
  // Agregar store_users y phone_number a cada producto
  result.rows.forEach(product => {
    product.store_users = formattedStoreUsers;
    product.store_phone_number = storePhoneNumber;
  });

  return {
    products: result.rows.map(formatProduct),
    total,
  };
}

export async function getProductsByStoreAdmin(storeIdentifier, options = {}) {
  const { categoryId, limit, offset, search, minPrice, maxPrice } = options;
  // Verificar si parece un UUID (formato con guiones)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeIdentifier);
  
  let storeCondition;
  const params = [];
  let paramIdx = 1;
  
  if (isUUID) {
    // Buscar por ID (UUID)
    storeCondition = `p.store_id = $${paramIdx}`;
    params.push(storeIdentifier);
  } else {
    // Buscar por store_id (slug)
    const slug = storeIdentifier.trim();
    storeCondition = `s.store_id = $${paramIdx}`;
    params.push(slug);
  }
  
  paramIdx++;
  
  const baseFrom = `
    FROM products p
    INNER JOIN categories c ON p.category_id = c.id
    INNER JOIN stores s ON p.store_id = s.id
    WHERE ${storeCondition} AND s.state = 'active'
  `;
  
  const extraWhere = [];

  if (categoryId) {
    extraWhere.push(`p.category_id = $${paramIdx}`);
    params.push(categoryId);
    paramIdx++;
  }

  if (minPrice != null && minPrice !== '' && !Number.isNaN(Number(minPrice))) {
    extraWhere.push(`p.base_price >= $${paramIdx}`);
    params.push(Number(minPrice));
    paramIdx++;
  }

  if (maxPrice != null && maxPrice !== '' && !Number.isNaN(Number(maxPrice))) {
    extraWhere.push(`p.base_price <= $${paramIdx}`);
    params.push(Number(maxPrice));
    paramIdx++;
  }

  if (search && search.trim()) {
    const searchVal = `%${search.trim()}%`;
    extraWhere.push(`(p.name ILIKE $${paramIdx} OR p.sku ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx} OR c.slug ILIKE $${paramIdx})`);
    params.push(searchVal);
    paramIdx++;
  }

  const whereSuffix = extraWhere.length ? ` AND ${extraWhere.join(' AND ')}` : '';
  const countParams = [...params];

  const countSql = `SELECT COUNT(*)::int as total ${baseFrom}${whereSuffix}`;
  const countResult = await query(countSql, countParams);
  const total = (countResult.rows[0] && countResult.rows[0].total) || 0;

  let dataSql = `
    SELECT
      p.id, p.name, p.description, p.base_price, p.currency, p.stock, p.sku,
      p.category_id, p.store_id, p.images, p.attributes, p.combinations, p.rating, p.review_count, p.tags,
      p.visible_in_store, p.hide_price, p.sort_order, COALESCE(p.iva, 0) as iva, p.created_at, p.updated_at,
      c.name as category_name, c.slug as category_slug,
      s.name as store_name, s.store_id as store_slug, s.state as store_state,
      s.created_at as store_created_at, s.updated_at as store_updated_at
    ${baseFrom}${whereSuffix}
    ORDER BY p.sort_order ASC NULLS LAST, p.updated_at DESC
  `;
  if (limit != null && limit > 0) {
    dataSql += ` LIMIT $${paramIdx++}`;
    params.push(limit);
    if (offset != null && offset > 0) {
      dataSql += ` OFFSET $${paramIdx++}`;
      params.push(offset);
    }
  }

  const result = await query(dataSql, params);

  // Si no hay productos, retornar vacío
  if (result.rows.length === 0) {
    return {
      products: [],
      total: 0,
    };
  }

  // Obtener el store_id del primer producto (todos los productos tienen el mismo store_id)
  const actualStoreId = result.rows[0].store_id;

  // Obtener store_users con phone_number (solo los que tienen teléfono)
  const storeUsersResult = await query(
    `SELECT 
      su.id,
      su.user_id,
      su.is_creator,
      su.phone_number,
      su.created_at,
      u.name as user_name,
      u.email as user_email
    FROM store_users su
    INNER JOIN users u ON su.user_id = u.id
    WHERE su.store_id = $1 
      AND su.phone_number IS NOT NULL 
      AND su.phone_number != ''
    ORDER BY su.is_creator DESC, su.created_at ASC`,
    [actualStoreId]
  );
  
  // Formatear store_users para el frontend (solo los que tienen phone_number)
  const formattedStoreUsers = storeUsersResult.rows
    .filter(su => su.phone_number && su.phone_number.trim() !== '')
    .map(su => ({
      id: su.id,
      userId: su.user_id,
      isCreator: su.is_creator,
      phoneNumber: su.phone_number,
      createdAt: su.created_at,
      userName: su.user_name,
      userEmail: su.user_email,
    }));
  
  // Usar el phone_number del creador o el primero disponible
  const storePhoneNumber = storeUsersResult.rows.find(su => su.is_creator && su.phone_number)?.phone_number 
    || storeUsersResult.rows.find(su => su.phone_number)?.phone_number 
    || null;
  
  // Agregar store_users y phone_number a cada producto
  result.rows.forEach(product => {
    product.store_users = formattedStoreUsers;
    product.store_phone_number = storePhoneNumber;
  });

  return {
    products: result.rows.map(formatProduct),
    total,
  };
}


/**
 * Obtener un producto por ID (solo si pertenece a la tienda)
 * @param {string} productId - ID del producto
 * @param {string} storeId - ID de la tienda
 * @returns {Promise<Object|null>} Producto encontrado o null
 */
export async function getProductById(productId, storeId) {
  const result = await query(
    `SELECT 
      p.id,
      p.name,
      p.description,
      p.base_price,
      p.currency,
      p.stock,
      p.sku,
      p.category_id,
      p.store_id,
      p.images,
      p.attributes,
      p.combinations,
      p.rating,
      p.review_count,
      p.tags,
      p.visible_in_store,
      p.hide_price,
      p.sort_order,
      COALESCE(p.iva, 0) as iva,
      p.created_at,
      p.updated_at,
      c.name as category_name,
      c.slug as category_slug,
      s.name as store_name,
      s.store_id as store_slug
    FROM products p
    INNER JOIN categories c ON p.category_id = c.id
    INNER JOIN stores s ON p.store_id = s.id
    WHERE p.id = $1 AND p.store_id = $2 AND s.state = 'active'`,
    [productId, storeId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return formatProduct(result.rows[0]);
}

/**
 * Obtener un producto por ID (público, sin necesidad de storeId)
 * @param {string} productId - ID del producto
 * @returns {Promise<Object|null>} Producto encontrado o null
 */
export async function getProductByIdPublic(productId) {
  const result = await query(
    `SELECT 
      p.id,
      p.name,
      p.description,
      p.base_price,
      p.currency,
      p.stock,
      p.sku,
      p.category_id,
      p.store_id,
      p.images,
      p.attributes,
      p.combinations,
      p.rating,
      p.review_count,
      p.tags,
      p.visible_in_store,
      p.hide_price,
      p.sort_order,
      COALESCE(p.iva, 0) as iva,
      p.created_at,
      p.updated_at,
      c.name as category_name,
      c.slug as category_slug,
      s.name as store_name,
      s.store_id as store_slug,
      s.logo as store_logo,
      s.instagram as store_instagram,
      s.tiktok as store_tiktok,
      s.state as store_state,
      s.created_at as store_created_at,
      s.updated_at as store_updated_at
    FROM products p
    INNER JOIN categories c ON p.category_id = c.id
    INNER JOIN stores s ON p.store_id = s.id
    WHERE p.id = $1 AND s.state = 'active'`,
    [productId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const product = result.rows[0];
  
  // Obtener store_users con phone_number (solo los que tienen teléfono)
  const storeUsersResult = await query(
    `SELECT 
      su.id,
      su.user_id,
      su.is_creator,
      su.phone_number,
      su.created_at,
      u.name as user_name,
      u.email as user_email
    FROM store_users su
    INNER JOIN users u ON su.user_id = u.id
    WHERE su.store_id = $1 
      AND su.phone_number IS NOT NULL 
      AND su.phone_number != ''
    ORDER BY su.is_creator DESC, su.created_at ASC`,
    [product.store_id]
  );

  // Formatear store_users para el frontend (solo los que tienen phone_number)
  product.store_users = storeUsersResult.rows
    .filter(su => su.phone_number && su.phone_number.trim() !== '')
    .map(su => ({
      id: su.id,
      userId: su.user_id,
      isCreator: su.is_creator,
      phoneNumber: su.phone_number,
      createdAt: su.created_at,
      userName: su.user_name,
      userEmail: su.user_email,
    }));
  
  // Usar el phone_number del creador o el primero disponible
  product.store_phone_number = storeUsersResult.rows.find(su => su.is_creator && su.phone_number)?.phone_number 
    || storeUsersResult.rows.find(su => su.phone_number)?.phone_number 
    || null;

  return formatProduct(product);
}

/**
 * Obtener valor numérico de stock de una variante (combinación o atributo).
 * Acepta number, string, null, undefined.
 */
function getVariantStockValue(c) {
  if (c == null || c === undefined) return 0;
  const raw = c.stock;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return Math.max(0, raw);
  const parsed = parseInt(String(raw), 10);
  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
}

/**
 * Suma de stocks de variantes en attributes (attributes[].variants[].stock).
 * @param {Array} attributes - Array de atributos con variants
 * @returns {number}
 */
function sumAttributeVariantStocks(attributes) {
  if (!Array.isArray(attributes) || attributes.length === 0) return 0;
  let total = 0;
  for (const attr of attributes) {
    const variants = attr && Array.isArray(attr.variants) ? attr.variants : [];
    for (const v of variants) {
      total += getVariantStockValue(v);
    }
  }
  return total;
}

/**
 * Validar que, si el producto tiene variantes (combinaciones O atributos con variantes),
 * la suma de los stocks de las variantes sea >= stock del producto.
 * No se permite crear/editar si hay variantes y la suma es menor al stock del producto.
 * @param {number} productStock - Stock del producto
 * @param {Array} combinations - Array de combinaciones con propiedad stock
 * @param {Array} [attributes] - Array de atributos con variants[].stock (se usa si combinations está vacío)
 */
function validateVariantStocks(productStock, combinations, attributes) {
  const productStockNum = typeof productStock === 'number' && !Number.isNaN(productStock)
    ? Math.max(0, productStock)
    : Math.max(0, parseInt(String(productStock), 10) || 0);

  let sum = 0;
  const combos = Array.isArray(combinations) ? combinations : [];
  const attrs = Array.isArray(attributes) ? attributes : [];

  if (combos.length > 0) {
    sum = combos.reduce((acc, c) => acc + getVariantStockValue(c), 0);
  } else if (attrs.some((a) => a && Array.isArray(a.variants) && a.variants.length > 0)) {
    sum = sumAttributeVariantStocks(attrs);
  } else {
    return;
  }

  if (sum < productStockNum) {
    throw new Error(
      'La suma de los stocks de las variantes debe ser igual o mayor al stock del producto. ' +
      `Stock del producto: ${productStockNum}, suma de variantes: ${sum}.`
    );
  }
}

/**
 * Crear un nuevo producto
 * @param {Object} productData - Datos del producto
 * @returns {Promise<Object>} Producto creado
 */
export async function createProduct(productData) {
  const {
    name,
    description,
    base_price,
    currency,
    stock,
    sku,
    category_id,
    store_id,
    created_by,
    images,
    attributes,
    combinations,
    rating,
    review_count,
    tags,
    visible_in_store = false,
    hide_price = false,
    sort_order = null,
    iva: ivaProvided,
  } = productData;

  // Verificar que la categoría exista (categorías globales)
  const categoryCheck = await query(
    'SELECT id FROM categories WHERE id = $1',
    [category_id]
  );

  if (categoryCheck.rows.length === 0) {
    throw new Error('La categoría no existe');
  }

  let ivaValue = ivaProvided != null && !Number.isNaN(parseFloat(ivaProvided)) ? Math.max(0, Math.min(100, parseFloat(ivaProvided))) : null;
  if (ivaValue === null) {
    const storeRes = await query('SELECT COALESCE(iva, 0) as iva FROM stores WHERE id = $1', [store_id]);
    ivaValue = storeRes.rows[0] ? (parseFloat(storeRes.rows[0].iva) || 0) : 0;
  }

  const productStock = parseInt(stock, 10) || 0;
  const combos = Array.isArray(combinations) ? combinations : [];
  const attrs = Array.isArray(attributes) ? attributes : [];
  validateVariantStocks(productStock, combos, attrs);

  const result = await query(
    `INSERT INTO products (
      name, description, base_price, currency, stock, sku,
      category_id, store_id, created_by, images, attributes, combinations,
      rating, review_count, tags, visible_in_store, hide_price, sort_order, iva
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING id, name, description, base_price, currency, stock, sku,
              category_id, images, attributes, combinations, rating, review_count, tags,
              visible_in_store, hide_price, sort_order, iva, created_at, updated_at`,
    [
      name,
      description || null,
      base_price,
      currency || 'USD',
      stock || 0,
      sku,
      category_id,
      store_id,
      created_by,
      JSON.stringify(images || []),
      JSON.stringify(attributes || []),
      JSON.stringify(combinations || []),
      rating || null,
      review_count || 0,
      JSON.stringify(tags || []),
      visible_in_store === true,
      hide_price === true,
      sort_order != null && !Number.isNaN(Number(sort_order)) ? Number(sort_order) : null,
      ivaValue,
    ]
  );

  // Obtener la categoría y tienda para incluirla en la respuesta
  const categoryResult = await query(
    'SELECT name, slug FROM categories WHERE id = $1',
    [category_id]
  );
  
  const storeResult = await query(
    'SELECT name FROM stores WHERE id = $1',
    [store_id]
  );

  const product = result.rows[0];
  if (categoryResult.rows.length > 0) {
    product.category_name = categoryResult.rows[0].name;
    product.category_slug = categoryResult.rows[0].slug;
  }
  if (storeResult.rows.length > 0) {
    product.store_name = storeResult.rows[0].name;
  }
  product.store_id = store_id;

  return formatProduct(product);
}

/**
 * Actualizar un producto
 * @param {string} productId - ID del producto
 * @param {string} storeId - ID de la tienda
 * @param {Object} updates - Campos a actualizar
 * @returns {Promise<Object|null>} Producto actualizado o null
 */
export async function updateProduct(productId, storeId, updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;

  const allowedFields = [
    'name', 'description', 'base_price', 'currency', 'stock',
    'sku', 'category_id', 'images', 'attributes', 'combinations', 'rating',
    'review_count', 'tags', 'visible_in_store', 'hide_price', 'sort_order', 'iva'
  ];

  // Si se actualiza category_id, verificar que la categoría exista (categorías globales)
  if (updates.category_id !== undefined) {
    const categoryCheck = await query(
      'SELECT id FROM categories WHERE id = $1',
      [updates.category_id]
    );

    if (categoryCheck.rows.length === 0) {
      throw new Error('La categoría no existe');
    }
  }

  // Si se actualiza stock, combinaciones o atributos, validar que la suma de stocks de variantes >= stock del producto
  if (updates.stock !== undefined || updates.combinations !== undefined || updates.attributes !== undefined) {
    let effectiveStock = updates.stock;
    let effectiveCombinations = updates.combinations;
    let effectiveAttributes = updates.attributes;
    if (effectiveStock === undefined || effectiveCombinations === undefined || effectiveAttributes === undefined) {
      const current = await query(
        'SELECT stock, combinations, attributes FROM products WHERE id = $1 AND store_id = $2',
        [productId, storeId]
      );
      if (current.rows.length > 0) {
        const row = current.rows[0];
        if (effectiveStock === undefined) effectiveStock = row.stock;
        if (effectiveCombinations === undefined) {
          const raw = row.combinations;
          effectiveCombinations = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : (raw || []);
        }
        if (effectiveAttributes === undefined) {
          const raw = row.attributes;
          effectiveAttributes = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : (raw || []);
        }
      }
    }
    effectiveStock = typeof effectiveStock === 'number' ? effectiveStock : (parseInt(String(effectiveStock), 10) || 0);
    effectiveCombinations = Array.isArray(effectiveCombinations) ? effectiveCombinations : [];
    effectiveAttributes = Array.isArray(effectiveAttributes) ? effectiveAttributes : [];
    validateVariantStocks(effectiveStock, effectiveCombinations, effectiveAttributes);
  }

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      if (['images', 'attributes', 'combinations', 'tags'].includes(field)) {
        fields.push(`${field} = $${paramCount++}::jsonb`);
        values.push(JSON.stringify(updates[field]));
      } else if (field === 'visible_in_store' || field === 'hide_price') {
        // Convertir a booleano explícitamente
        fields.push(`${field} = $${paramCount++}`);
        values.push(updates[field] === true || updates[field] === 'true');
      } else if (field === 'sort_order') {
        const v = updates[field];
        fields.push(`${field} = $${paramCount++}`);
        values.push(v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
      } else if (field === 'iva') {
        const v = updates[field];
        const ivaNum = v != null && !Number.isNaN(parseFloat(v)) ? Math.max(0, Math.min(100, parseFloat(v))) : 0;
        fields.push(`${field} = $${paramCount++}`);
        values.push(ivaNum);
      } else {
        fields.push(`${field} = $${paramCount++}`);
        values.push(updates[field]);
      }
    }
  }

  if (fields.length === 0) {
    return getProductById(productId, storeId);
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(productId, storeId);

  const result = await query(
    `UPDATE products
     SET ${fields.join(', ')}
     WHERE id = $${paramCount++} AND store_id = $${paramCount++}
     RETURNING id, name, description, base_price, currency, stock, sku,
               category_id, images, attributes, combinations, rating, review_count, tags,
               visible_in_store, hide_price, sort_order, created_at, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  const product = result.rows[0];

  // Obtener la categoría y tienda
  const categoryResult = await query(
    'SELECT name, slug FROM categories WHERE id = $1',
    [product.category_id]
  );
  
  const storeResult = await query(
    'SELECT name FROM stores WHERE id = $1',
    [product.store_id]
  );
  
  if (categoryResult.rows.length > 0) {
    product.category_name = categoryResult.rows[0].name;
    product.category_slug = categoryResult.rows[0].slug;
  }
  if (storeResult.rows.length > 0) {
    product.store_name = storeResult.rows[0].name;
  }

  return formatProduct(product);
}

/**
 * Reordenar productos de una tienda. Asigna sort_order según el orden del array (índice = sort_order).
 * Solo se actualizan productos que pertenecen a la tienda.
 * @param {string} storeId - ID de la tienda
 * @param {string[]} orderedProductIds - IDs de productos en el orden deseado (primero = 0, segundo = 1, ...)
 * @returns {Promise<{ updated: number }>}
 */
export async function reorderProductsByStore(storeId, orderedProductIds) {
  if (!Array.isArray(orderedProductIds) || orderedProductIds.length === 0) {
    return { updated: 0 };
  }
  let updated = 0;
  for (let i = 0; i < orderedProductIds.length; i++) {
    const productId = orderedProductIds[i];
    const res = await query(
      `UPDATE products SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND store_id = $3`,
      [i, productId, storeId]
    );
    if (res.rowCount > 0) updated++;
  }
  return { updated };
}

/**
 * Obtener IDs de productos de una tienda en el orden actual (sort_order, updated_at).
 * @param {string} storeId - ID de la tienda
 * @returns {Promise<string[]>}
 */
export async function getOrderedProductIdsForStore(storeId) {
  const result = await query(
    `SELECT id FROM products WHERE store_id = $1 ORDER BY sort_order ASC NULLS LAST, updated_at DESC`,
    [storeId]
  );
  return result.rows.map((r) => r.id);
}

/**
 * Mueve un producto un lugar arriba o abajo en el orden de la tienda.
 * @param {string} storeId - ID de la tienda
 * @param {string} productId - ID del producto a mover
 * @param {'up'|'down'} direction - 'up' = más arriba (menor índice), 'down' = más abajo
 * @returns {Promise<{ updated: number }>}
 */
export async function moveProductOrder(storeId, productId, direction) {
  const ids = await getOrderedProductIdsForStore(storeId);
  const idx = ids.indexOf(productId);
  if (idx === -1) return { updated: 0 };
  if (direction === 'up' && idx > 0) {
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
  } else if (direction === 'down' && idx < ids.length - 1) {
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
  } else {
    return { updated: 0 };
  }
  return reorderProductsByStore(storeId, ids);
}

/**
 * Eliminar un producto
 * @param {string} productId - ID del producto
 * @param {string} storeId - ID de la tienda
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
export async function deleteProduct(productId, storeId) {
  const result = await query(
    `DELETE FROM products
     WHERE id = $1 AND store_id = $2`,
    [productId, storeId]
  );

  return result.rowCount > 0;
}

/**
 * Formatear producto para respuesta
 * @param {Object} product - Producto de la base de datos
 * @returns {Object} Producto formateado
 */
function formatProduct(product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description || '',
    basePrice: parseFloat(product.base_price),
    currency: product.currency || 'USD',
    stock: parseInt(product.stock) || 0,
    sku: product.sku,
    category: product.category_slug || product.category_id,
    storeId: product.store_id,
    storeSlug: product.store_slug ?? null,
    storeName: product.store_name,
    storeLogo: product.store_logo ?? null,
    storeInstagram: product.store_instagram ?? null,
    storeTiktok: product.store_tiktok ?? null,
    storePhoneNumber: product.store_phone_number,
    storeUsers: product.store_users || [],
    categoryId: product.category_id,
    images: Array.isArray(product.images) ? product.images : (product.images ? JSON.parse(product.images) : []),
    attributes: Array.isArray(product.attributes) ? product.attributes : (product.attributes ? JSON.parse(product.attributes) : []),
    combinations: Array.isArray(product.combinations) ? product.combinations : (product.combinations ? JSON.parse(product.combinations) : []),
    rating: product.rating ? parseFloat(product.rating) : undefined,
    reviewCount: product.review_count ? parseInt(product.review_count) : undefined,
    tags: Array.isArray(product.tags) ? product.tags : (product.tags ? JSON.parse(product.tags) : []),
    visibleInStore: product.visible_in_store === true || product.visible_in_store === 'true',
    hidePrice: product.hide_price === true || product.hide_price === 'true',
    sortOrder: product.sort_order != null && !Number.isNaN(Number(product.sort_order)) ? Number(product.sort_order) : null,
    iva: parseFloat(product.iva) || 0,
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
}

/**
 * Obtener todos los productos de todas las tiendas (para admin)
 * @param {Object} options - Opciones de filtrado
 * @param {string} options.storeId - ID de tienda específica (opcional)
 * @param {string} options.categoryId - ID de categoría (opcional)
 * @param {number} options.limit - Límite de productos a retornar (default: 20)
 * @param {number} options.offset - Offset para paginación (default: 0)
 * @param {string} options.search - Término de búsqueda para filtrar por nombre (opcional)
 * @returns {Promise<Object>} { products, total }
 */
export async function getAllProductsForAdmin(options = {}) {
  const { storeId, categoryId, limit, offset, search, minPrice, maxPrice } = options;
  
  const params = [];
  let paramIdx = 1;
  
  const baseFrom = `
    FROM products p
    INNER JOIN categories c ON p.category_id = c.id
    INNER JOIN stores s ON p.store_id = s.id
    WHERE s.state = 'active'
  `;
  
  const extraWhere = [];

  if (storeId) {
    extraWhere.push(`p.store_id = $${paramIdx}`);
    params.push(storeId);
    paramIdx++;
  }

  if (categoryId) {
    extraWhere.push(`p.category_id = $${paramIdx}`);
    params.push(categoryId);
    paramIdx++;
  }

  if (minPrice != null && minPrice !== '' && !Number.isNaN(Number(minPrice))) {
    extraWhere.push(`p.base_price >= $${paramIdx}`);
    params.push(Number(minPrice));
    paramIdx++;
  }

  if (maxPrice != null && maxPrice !== '' && !Number.isNaN(Number(maxPrice))) {
    extraWhere.push(`p.base_price <= $${paramIdx}`);
    params.push(Number(maxPrice));
    paramIdx++;
  }

  if (search && search.trim()) {
    const searchVal = `%${search.trim()}%`;
    extraWhere.push(`(p.name ILIKE $${paramIdx} OR p.sku ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx} OR c.slug ILIKE $${paramIdx} OR s.name ILIKE $${paramIdx})`);
    params.push(searchVal);
    paramIdx++;
  }

  const whereSuffix = extraWhere.length ? ` AND ${extraWhere.join(' AND ')}` : '';
  const countParams = [...params];

  const countSql = `SELECT COUNT(*)::int as total ${baseFrom}${whereSuffix}`;
  const countResult = await query(countSql, countParams);
  const total = (countResult.rows[0] && countResult.rows[0].total) || 0;

  let dataSql = `
    SELECT
      p.id, p.name, p.description, p.base_price, p.currency, p.stock, p.sku,
      p.category_id, p.store_id, p.images, p.attributes, p.combinations, p.rating, p.review_count, p.tags,
      p.visible_in_store, p.hide_price, p.sort_order, COALESCE(p.iva, 0) as iva, p.created_at, p.updated_at,
      c.name as category_name, c.slug as category_slug,
      s.name as store_name, s.store_id as store_slug, s.state as store_state,
      s.created_at as store_created_at, s.updated_at as store_updated_at
    ${baseFrom}${whereSuffix}
    ORDER BY p.sort_order ASC NULLS LAST, p.updated_at DESC
  `;
  if (limit != null && limit > 0) {
    dataSql += ` LIMIT $${paramIdx++}`;
    params.push(limit);
    if (offset != null && offset > 0) {
      dataSql += ` OFFSET $${paramIdx++}`;
      params.push(offset);
    }
  }

  const result = await query(dataSql, params);

  // Si no hay productos, retornar vacío
  if (result.rows.length === 0) {
    return {
      products: [],
      total: 0,
    };
  }

  // Obtener store_users para cada tienda única
  const uniqueStoreIds = [...new Set(result.rows.map((p) => p.store_id))];
  const storeUsersMap = new Map();

  for (const storeId of uniqueStoreIds) {
    const storeUsersResult = await query(
      `SELECT 
        su.id,
        su.user_id,
        su.is_creator,
        su.phone_number,
        su.created_at,
        u.name as user_name,
        u.email as user_email
      FROM store_users su
      INNER JOIN users u ON su.user_id = u.id
      WHERE su.store_id = $1 
        AND su.phone_number IS NOT NULL 
        AND su.phone_number != ''
      ORDER BY su.is_creator DESC, su.created_at ASC`,
      [storeId]
    );
    
    const formattedStoreUsers = storeUsersResult.rows
      .filter(su => su.phone_number && su.phone_number.trim() !== '')
      .map(su => ({
        id: su.id,
        userId: su.user_id,
        isCreator: su.is_creator,
        phoneNumber: su.phone_number,
        createdAt: su.created_at,
        userName: su.user_name,
        userEmail: su.user_email,
      }));
    
    const storePhoneNumber = storeUsersResult.rows.find(su => su.is_creator && su.phone_number)?.phone_number 
      || storeUsersResult.rows.find(su => su.phone_number)?.phone_number 
      || null;
    
    storeUsersMap.set(storeId, {
      storeUsers: formattedStoreUsers,
      storePhoneNumber,
    });
  }

  // Agregar store_users y phone_number a cada producto
  result.rows.forEach(product => {
    const storeData = storeUsersMap.get(product.store_id);
    if (storeData) {
      product.store_users = storeData.storeUsers;
      product.store_phone_number = storeData.storePhoneNumber;
    } else {
      product.store_users = [];
      product.store_phone_number = null;
    }
  });

  return {
    products: result.rows.map(formatProduct),
    total,
  };
}

/**
 * Obtener productos más recientes de todas las tiendas activas (público)
 * @param {Object} options - Opciones de filtrado
 * @param {number} options.limit - Límite de productos a retornar (default: 20)
 * @param {number} options.offset - Offset para paginación (default: 0)
 * @param {string} options.search - Término de búsqueda para filtrar por nombre (opcional)
 * @returns {Promise<Object>} { products, total }
 */
export async function getRecentProducts(options = {}) {
  const { limit = 20, offset = 0, search, categoryId, minPrice, maxPrice } = options;
  
  let sql = `
    SELECT 
      p.id,
      p.name,
      p.description,
      p.base_price,
      p.currency,
      p.stock,
      p.sku,
      p.category_id,
      p.store_id,
      p.images,
      p.attributes,
      p.combinations,
      p.rating,
      p.review_count,
      p.tags,
      p.visible_in_store,
      p.hide_price,
      p.sort_order,
      p.created_at,
      p.updated_at,
      c.name as category_name,
      c.slug as category_slug,
      s.name as store_name,
      s.store_id as store_slug,
      s.state as store_state,
      s.created_at as store_created_at,
      s.updated_at as store_updated_at
    FROM products p
    INNER JOIN categories c ON p.category_id = c.id
    INNER JOIN stores s ON p.store_id = s.id
    WHERE s.state = 'active' AND p.visible_in_store = true
  `;
  
  const params = [];
  let paramCount = 1;
  
  if (categoryId && String(categoryId).trim()) {
    sql += ` AND p.category_id = $${paramCount}`;
    params.push(categoryId.trim());
    paramCount++;
  }
  if (minPrice != null && minPrice !== '' && !Number.isNaN(Number(minPrice))) {
    sql += ` AND p.base_price >= $${paramCount}`;
    params.push(Number(minPrice));
    paramCount++;
  }
  if (maxPrice != null && maxPrice !== '' && !Number.isNaN(Number(maxPrice))) {
    sql += ` AND p.base_price <= $${paramCount}`;
    params.push(Number(maxPrice));
    paramCount++;
  }
  
  // Agregar filtro de búsqueda si existe
  if (search && search.trim()) {
    sql += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
    params.push(`%${search.trim()}%`);
    paramCount++;
  }
  
  sql += ` ORDER BY p.updated_at DESC`;
  
  // Agregar LIMIT y OFFSET
  sql += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
  params.push(limit, offset);

  const result = await query(sql, params);
  
  // Agrupar productos por store_id para optimizar consultas
  const storeIds = [...new Set(result.rows.map(p => p.store_id))];
  
  // Obtener store_users para todas las tiendas de una vez
  const storeUsersMap = new Map();
  await Promise.all(
    storeIds.map(async (storeId) => {
      const storeUsersResult = await query(
        `SELECT 
          su.id,
          su.user_id,
          su.is_creator,
          su.phone_number,
          su.created_at,
          u.name as user_name,
          u.email as user_email
        FROM store_users su
        INNER JOIN users u ON su.user_id = u.id
        WHERE su.store_id = $1 
          AND su.phone_number IS NOT NULL 
          AND su.phone_number != ''
        ORDER BY su.is_creator DESC, su.created_at ASC`,
        [storeId]
      );
      
      // Formatear store_users para el frontend (solo los que tienen phone_number)
      const formattedStoreUsers = storeUsersResult.rows
        .filter(su => su.phone_number && su.phone_number.trim() !== '')
        .map(su => ({
          id: su.id,
          userId: su.user_id,
          isCreator: su.is_creator,
          phoneNumber: su.phone_number,
          createdAt: su.created_at,
          userName: su.user_name,
          userEmail: su.user_email,
        }));
      
      // Usar el phone_number del creador o el primero disponible
      const storePhoneNumber = storeUsersResult.rows.find(su => su.is_creator && su.phone_number)?.phone_number 
        || storeUsersResult.rows.find(su => su.phone_number)?.phone_number 
        || null;
      
      storeUsersMap.set(storeId, {
        storeUsers: formattedStoreUsers,
        storePhoneNumber,
      });
    })
  );
  
  // Agregar store_users y phone_number a cada producto
  result.rows.forEach(product => {
    const storeData = storeUsersMap.get(product.store_id);
    if (storeData) {
      product.store_users = storeData.storeUsers;
      product.store_phone_number = storeData.storePhoneNumber;
    }
  });
  
  return {
    products: result.rows.map(formatProduct),
    total: result.rows.length, // No necesitamos el total real, solo verificamos si hay más
  };
}

/**
 * Poner el stock de un producto en 0
 * @param {string} productId - ID del producto
 * @param {string} storeId - ID de la tienda
 * @returns {Promise<Object|null>} Producto actualizado o null
 */
export async function setProductOutOfStock(productId, storeId) {
  // Verificar que el producto existe y pertenece a la tienda
  const product = await getProductById(productId, storeId);
  if (!product) {
    throw new Error('Producto no encontrado');
  }

  // Actualizar el stock a 0
  const result = await query(
    `UPDATE products
     SET stock = 0, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND store_id = $2
     RETURNING id, name, description, base_price, currency, stock, sku,
               category_id, images, attributes, rating, review_count, tags,
               created_at, updated_at`,
    [productId, storeId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const updatedProduct = result.rows[0];
  
  // Obtener la categoría y tienda
  const categoryResult = await query(
    'SELECT name, slug FROM categories WHERE id = $1',
    [updatedProduct.category_id]
  );
  
  const storeResult = await query(
    'SELECT name FROM stores WHERE id = $1',
    [updatedProduct.store_id]
  );
  
  if (categoryResult.rows.length > 0) {
    updatedProduct.category_name = categoryResult.rows[0].name;
    updatedProduct.category_slug = categoryResult.rows[0].slug;
  }
  if (storeResult.rows.length > 0) {
    updatedProduct.store_name = storeResult.rows[0].name;
  }

  return formatProduct(updatedProduct);
}

/**
 * Búsqueda de productos para POS (caja rápida).
 * Busca por nombre o SKU. Si el producto tiene combinaciones, devuelve cada una como fila separada.
 * @param {string} storeId - ID de la tienda
 * @param {string} search - Término de búsqueda (nombre o código/SKU)
 * @param {number} [limit=30] - Máximo de resultados
 * @returns {Promise<Array<{ productId, combinationId?, productName, sku, unitPrice, stock, displayName }>>}
 */
export async function searchProductsForPOS(storeId, search, limit = 30) {
  const searchVal = search && String(search).trim();
  if (!searchVal) return [];

  const params = [storeId];
  const searchTerm = `%${searchVal}%`;
  params.push(searchTerm);
  const limitNum = Math.min(Math.max(1, parseInt(limit) || 30), 100);
  params.push(limitNum);

  const result = await query(
    `SELECT p.id, p.name, p.base_price, p.currency, p.stock, p.sku, p.attributes, p.combinations, COALESCE(p.iva, 0) as iva
     FROM products p
     INNER JOIN stores s ON p.store_id = s.id
     WHERE p.store_id = $1 AND s.state = 'active'
       AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR p.sku = $3)
     ORDER BY p.sort_order ASC NULLS LAST, p.updated_at DESC
     LIMIT $4`,
    [storeId, searchTerm, searchVal.trim(), limitNum]
  );

  const rows = result.rows;
  const out = [];

  for (const row of rows) {
    let combinations = row.combinations;
    if (typeof combinations === 'string') {
      try {
        combinations = JSON.parse(combinations);
      } catch {
        combinations = [];
      }
    }
    if (!Array.isArray(combinations)) combinations = [];

    const basePrice = parseFloat(row.base_price) || 0;
    const baseStock = parseInt(row.stock, 10) || 0;
    const iva = parseFloat(row.iva) || 0;
    const unitPriceWithIva = basePrice * (1 + iva / 100);

    if (combinations.length === 0) {
      out.push({
        productId: row.id,
        combinationId: null,
        productName: row.name,
        sku: row.sku || null,
        unitPrice: basePrice,
        unitPriceWithIva,
        iva,
        stock: baseStock,
        displayName: row.name,
        currency: row.currency || 'USD',
      });
    } else {
      let attributes = row.attributes;
      if (typeof attributes === 'string') {
        try {
          attributes = JSON.parse(attributes) || [];
        } catch {
          attributes = [];
        }
      }
      if (!Array.isArray(attributes)) attributes = [];
      const variantValueMap = new Map();
      for (const attr of attributes) {
        if (attr.variants && Array.isArray(attr.variants)) {
          for (const v of attr.variants) {
            if (v.id) variantValueMap.set(v.id, v.name || v.value || v.id);
          }
        }
      }
      for (const combo of combinations) {
        const priceMod = typeof combo.priceModifier === 'number' ? combo.priceModifier : 0;
        const unitPrice = basePrice + priceMod;
        const unitPriceWithIva = unitPrice * (1 + iva / 100);
        const stock = typeof combo.stock === 'number' ? combo.stock : 0;
        const comboId = combo.id || null;
        const comboSku = combo.sku || null;
        const selections = combo.selections && typeof combo.selections === 'object' ? combo.selections : {};
        const parts = Object.values(selections).map((vid) => variantValueMap.get(vid) || String(vid)).filter(Boolean);
        const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : comboSku ? ` [${comboSku}]` : '';
        const displayName = `${row.name}${suffix}`;
        const selectedVariants = [];
        for (const attr of attributes) {
          const variantId = selections[attr.id];
          if (variantId && attr.variants && Array.isArray(attr.variants)) {
            const v = attr.variants.find((x) => x.id === variantId);
            if (v) {
              selectedVariants.push({
                attributeId: attr.id,
                attributeName: attr.name || attr.id,
                variantId: v.id,
                variantName: v.name || v.value || v.id,
                variantValue: v.value || v.name || v.id,
              });
            }
          }
        }
        out.push({
          productId: row.id,
          combinationId: comboId,
          productName: row.name,
          sku: comboSku || row.sku || null,
          unitPrice,
          unitPriceWithIva,
          iva,
          stock,
          displayName,
          currency: row.currency || 'USD',
          selections,
          selectedVariants,
          priceModifier: priceMod,
        });
      }
    }
  }

  return out;
}

/**
 * Obtener productos POS por lista de (productId, combinationId).
 * Usado para top vendidos - devuelve los productos en formato POS para las claves dadas.
 * @param {string} storeId - ID de la tienda
 * @param {Array<{ productId: string, combinationId?: string | null }>} keys - Claves (productId, combinationId)
 * @returns {Promise<Array<{ productId, combinationId?, productName, sku, unitPrice, stock, displayName, selectedVariants? }>>}
 */
export async function getPOSProductsByKeys(storeId, keys) {
  if (!Array.isArray(keys) || keys.length === 0) return [];

  const productIds = [...new Set(keys.map((k) => k.productId).filter(Boolean))];
  const keySet = new Set(keys.map((k) => `${k.productId}-${k.combinationId ?? 'base'}`));

  const result = await query(
    `SELECT p.id, p.name, p.base_price, p.currency, p.stock, p.sku, p.attributes, p.combinations, COALESCE(p.iva, 0) as iva
     FROM products p
     INNER JOIN stores s ON p.store_id = s.id
     WHERE p.store_id = $1 AND s.state = 'active' AND p.id = ANY($2::uuid[])`,
    [storeId, productIds]
  );

  const out = [];
  for (const row of result.rows) {
    let combinations = row.combinations;
    if (typeof combinations === 'string') {
      try {
        combinations = JSON.parse(combinations) || [];
      } catch {
        combinations = [];
      }
    }
    if (!Array.isArray(combinations)) combinations = [];

    const basePrice = parseFloat(row.base_price) || 0;
    const baseStock = parseInt(row.stock, 10) || 0;
    const iva = parseFloat(row.iva) || 0;
    const unitPriceWithIva = basePrice * (1 + iva / 100);

    if (combinations.length === 0) {
      const key = `${row.id}-base`;
      if (keySet.has(key)) {
        out.push({
          productId: row.id,
          combinationId: null,
          productName: row.name,
          sku: row.sku || null,
          unitPrice: basePrice,
          unitPriceWithIva,
          iva,
          stock: baseStock,
          displayName: row.name,
          currency: row.currency || 'USD',
        });
      }
    } else {
      let attributes = row.attributes;
      if (typeof attributes === 'string') {
        try {
          attributes = JSON.parse(attributes) || [];
        } catch {
          attributes = [];
        }
      }
      if (!Array.isArray(attributes)) attributes = [];
      const variantValueMap = new Map();
      for (const attr of attributes) {
        if (attr.variants && Array.isArray(attr.variants)) {
          for (const v of attr.variants) {
            if (v.id) variantValueMap.set(v.id, v.name || v.value || v.id);
          }
        }
      }
      for (const combo of combinations) {
        const comboId = combo.id || null;
        const key = `${row.id}-${comboId ?? 'base'}`;
        if (!keySet.has(key)) continue;
        const priceMod = typeof combo.priceModifier === 'number' ? combo.priceModifier : 0;
        const unitPrice = basePrice + priceMod;
        const unitPriceWithIva = unitPrice * (1 + iva / 100);
        const stock = typeof combo.stock === 'number' ? combo.stock : 0;
        const comboSku = combo.sku || null;
        const selections = combo.selections && typeof combo.selections === 'object' ? combo.selections : {};
        const parts = Object.values(selections).map((vid) => variantValueMap.get(vid) || String(vid)).filter(Boolean);
        const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : comboSku ? ` [${comboSku}]` : '';
        const displayName = `${row.name}${suffix}`;
        const selectedVariants = [];
        for (const attr of attributes) {
          const variantId = selections[attr.id];
          if (variantId && attr.variants && Array.isArray(attr.variants)) {
            const v = attr.variants.find((x) => x.id === variantId);
            if (v) {
              selectedVariants.push({
                attributeId: attr.id,
                attributeName: attr.name || attr.id,
                variantId: v.id,
                variantName: v.name || v.value || v.id,
                variantValue: v.value || v.name || v.id,
              });
            }
          }
        }
        out.push({
          productId: row.id,
          combinationId: comboId,
          productName: row.name,
          sku: comboSku || row.sku || null,
          unitPrice,
          unitPriceWithIva,
          iva,
          stock,
          displayName,
          currency: row.currency || 'USD',
          selections,
          selectedVariants,
          priceModifier: priceMod,
        });
      }
    }
  }
  return out;
}

/**
 * Obtener todas las opciones POS de un producto (todas las combinaciones o base).
 * Sirve para que el frontend muestre "elegir variante" con todas las opciones del producto.
 * @param {string} storeId - ID de la tienda
 * @param {string} productId - ID del producto
 * @returns {Promise<Array<{ productId, combinationId?, productName, sku, unitPrice, unitPriceWithIva, stock, displayName, selectedVariants?, priceModifier? }>>}
 */
export async function getProductPOSOptions(storeId, productId) {
  if (!storeId || !productId) return [];

  const result = await query(
    `SELECT p.id, p.name, p.base_price, p.currency, p.stock, p.sku, p.attributes, p.combinations, COALESCE(p.iva, 0) as iva
     FROM products p
     INNER JOIN stores s ON p.store_id = s.id
     WHERE p.store_id = $1 AND s.state = 'active' AND p.id = $2`,
    [storeId, productId]
  );

  const row = result.rows[0];
  if (!row) return [];

  let combinations = row.combinations;
  if (typeof combinations === 'string') {
    try {
      combinations = JSON.parse(combinations);
    } catch {
      combinations = [];
    }
  }
  if (!Array.isArray(combinations)) combinations = [];

  const basePrice = parseFloat(row.base_price) || 0;
  const baseStock = parseInt(row.stock, 10) || 0;
  const iva = parseFloat(row.iva) || 0;
  const unitPriceWithIvaBase = basePrice * (1 + iva / 100);
  const out = [];

  if (combinations.length === 0) {
    out.push({
      productId: row.id,
      combinationId: null,
      productName: row.name,
      sku: row.sku || null,
      unitPrice: basePrice,
      unitPriceWithIva: unitPriceWithIvaBase,
      iva,
      stock: baseStock,
      displayName: row.name,
      currency: row.currency || 'USD',
    });
    return out;
  }

  let attributes = row.attributes;
  if (typeof attributes === 'string') {
    try {
      attributes = JSON.parse(attributes) || [];
    } catch {
      attributes = [];
    }
  }
  if (!Array.isArray(attributes)) attributes = [];
  const variantValueMap = new Map();
  for (const attr of attributes) {
    if (attr.variants && Array.isArray(attr.variants)) {
      for (const v of attr.variants) {
        if (v.id) variantValueMap.set(v.id, v.name || v.value || v.id);
      }
    }
  }

  for (const combo of combinations) {
    const priceMod = typeof combo.priceModifier === 'number' ? combo.priceModifier : 0;
    const unitPrice = basePrice + priceMod;
    const unitPriceWithIva = unitPrice * (1 + iva / 100);
    const stock = typeof combo.stock === 'number' ? combo.stock : 0;
    const comboId = combo.id || null;
    const comboSku = combo.sku || null;
    const selections = combo.selections && typeof combo.selections === 'object' ? combo.selections : {};
    const parts = Object.values(selections).map((vid) => variantValueMap.get(vid) || String(vid)).filter(Boolean);
    const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : comboSku ? ` [${comboSku}]` : '';
    const displayName = `${row.name}${suffix}`;
    const selectedVariants = [];
    for (const attr of attributes) {
      const variantId = selections[attr.id];
      if (variantId && attr.variants && Array.isArray(attr.variants)) {
        const v = attr.variants.find((x) => x.id === variantId);
        if (v) {
          selectedVariants.push({
            attributeId: attr.id,
            attributeName: attr.name || attr.id,
            variantId: v.id,
            variantName: v.name || v.value || v.id,
            variantValue: v.value || v.name || v.id,
          });
        }
      }
    }
    out.push({
      productId: row.id,
      combinationId: comboId,
      productName: row.name,
      sku: comboSku || row.sku || null,
      unitPrice,
      unitPriceWithIva,
      iva,
      stock,
      displayName,
      currency: row.currency || 'USD',
      selections,
      selectedVariants,
      priceModifier: priceMod,
    });
  }
  return out;
}
