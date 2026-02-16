/**
 * Servicio de requests (pedidos)
 * Contiene la lógica de negocio para requests
 */

import { query, getClient } from '../config/database.js';

/**
 * Crear un nuevo request (pedido)
 * @param {Object} requestData - Datos del pedido
 * @param {string} requestData.storeId - ID de la tienda
 * @param {string} [requestData.customerName] - Nombre del cliente
 * @param {string} [requestData.customerPhone] - Teléfono del cliente
 * @param {string} [requestData.customerEmail] - Email del cliente
 * @param {Array} requestData.items - Items del carrito (array de objetos)
 * @param {string} [requestData.customMessage] - Mensaje personalizado
 * @param {number} requestData.total - Total del pedido
 * @param {string} [requestData.currency] - Moneda (default: USD)
 * @param {string} [requestData.status] - Estado del pedido (default: pending)
 * @returns {Promise<Object>} Request creado
 */
export async function createRequest(requestData) {
  const {
    storeId,
    customerName,
    customerPhone,
    customerEmail,
    items,
    customMessage,
    total,
    currency = 'USD',
    status = 'pending',
  } = requestData;

  // Validar que storeId existe
  const storeCheck = await query(
    'SELECT id FROM stores WHERE id = $1',
    [storeId]
  );

  if (storeCheck.rows.length === 0) {
    throw new Error('Tienda no encontrada');
  }

  // Validar que items sea un array válido
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('El pedido debe contener al menos un producto');
  }

  // Validar que total sea un número válido
  const totalNum = parseFloat(total);
  if (isNaN(totalNum) || totalNum < 0) {
    throw new Error('El total debe ser un número válido');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Bloquear por tienda para asignar order_number sin duplicados
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [storeId]);
    const nextRes = await client.query(
      'SELECT COALESCE(MAX(order_number), 0) + 1 AS next FROM requests WHERE store_id = $1',
      [storeId]
    );
    const orderNumber = nextRes.rows[0].next;

    const result = await client.query(
      `INSERT INTO requests (
        store_id,
        customer_name,
        customer_phone,
        customer_email,
        items,
        custom_message,
        status,
        total,
        currency,
        order_number
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
      RETURNING 
        id,
        store_id,
        customer_name,
        customer_phone,
        customer_email,
        items,
        custom_message,
        status,
        total,
        currency,
        order_number,
        created_at,
        updated_at`,
      [
        storeId,
        customerName || null,
        customerPhone || null,
        customerEmail || null,
        JSON.stringify(items),
        customMessage || null,
        status,
        totalNum,
        currency,
        orderNumber,
      ]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Obtener todos los requests de una tienda
 * @param {string} storeId - ID de la tienda
 * @param {Object} options - Opciones de filtrado
 * @param {string} [options.status] - Filtrar por estado
 * @param {number} [options.limit] - Límite de resultados
 * @param {number} [options.offset] - Offset para paginación
 * @returns {Promise<Object>} Objeto con requests y total
 */
export async function getRequestsByStore(storeId, options = {}) {
  const { status, limit, offset, withoutReceivable, search } = options;

  let whereClause = 'WHERE r.store_id = $1';
  const params = [storeId];
  let paramIdx = 2;

  const searchTerm = typeof search === 'string' ? search.trim() : '';
  if (searchTerm) {
    whereClause += ` AND (r.customer_name ILIKE $${paramIdx} OR r.customer_phone ILIKE $${paramIdx} OR r.order_number::text ILIKE $${paramIdx})`;
    params.push(`%${searchTerm}%`);
    paramIdx++;
  }

  if (status) {
    const statuses = Array.isArray(status)
      ? status
      : (typeof status === 'string' ? status.split(',').map((s) => s.trim()).filter(Boolean) : [status]);
    if (statuses.length === 1) {
      whereClause += ` AND r.status = $${paramIdx}`;
      params.push(statuses[0]);
      paramIdx++;
    } else if (statuses.length > 1) {
      whereClause += ` AND r.status IN (${statuses.map((_, i) => `$${paramIdx + i}`).join(', ')})`;
      params.push(...statuses);
      paramIdx += statuses.length;
    }
  }

  if (withoutReceivable === true) {
    whereClause += ` AND NOT EXISTS (SELECT 1 FROM receivables rec WHERE rec.request_id = r.id AND rec.store_id = r.store_id)`;
  }

  // Contar total
  const countResult = await query(
    `SELECT COUNT(*)::int as total FROM requests r ${whereClause}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;

  // Obtener requests (incluye si ya tiene cuenta por cobrar asociada)
  let querySql = `
    SELECT 
      r.id,
      r.store_id,
      r.order_number,
      r.customer_name,
      r.customer_phone,
      r.customer_email,
      r.items,
      r.custom_message,
      r.status,
      r.total,
      r.currency,
      r.created_at,
      r.updated_at,
      EXISTS (SELECT 1 FROM receivables rec WHERE rec.request_id = r.id AND rec.store_id = r.store_id) AS has_receivable
    FROM requests r
    ${whereClause}
    ORDER BY r.created_at DESC
  `;

  if (limit) {
    querySql += ` LIMIT $${paramIdx}`;
    params.push(limit);
    paramIdx++;
    if (offset) {
      querySql += ` OFFSET $${paramIdx}`;
      params.push(offset);
    }
  }

  const result = await query(querySql, params);

  return {
    requests: result.rows,
    total,
  };
}

/**
 * Obtener un request por ID
 * @param {string} requestId - ID del request
 * @param {string} storeId - ID de la tienda (para verificar permisos)
 * @returns {Promise<Object|null>} Request encontrado o null
 */
export async function getRequestById(requestId, storeId) {
  const result = await query(
    `SELECT 
      id,
      store_id,
      order_number,
      customer_name,
      customer_phone,
      customer_email,
      items,
      custom_message,
      status,
      total,
      currency,
      created_at,
      updated_at
    FROM requests
    WHERE id = $1 AND store_id = $2`,
    [requestId, storeId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Obtener un request por tienda y número de pedido (para webhook).
 * Solo devuelve si status = pending y no tiene ya una cuenta por cobrar asociada.
 * @param {string} storeId - ID de la tienda
 * @param {number} orderNumber - order_number del pedido
 * @returns {Promise<Object|null>} Request o null
 */
export async function getRequestByStoreAndOrderNumber(storeId, orderNumber) {
  const num = parseInt(orderNumber, 10);
  if (Number.isNaN(num) || num < 1) return null;
  const result = await query(
    `SELECT r.id, r.store_id, r.order_number, r.customer_name, r.customer_phone, r.customer_email,
      r.items, r.custom_message, r.status, r.total, r.currency, r.created_at, r.updated_at,
      EXISTS (SELECT 1 FROM receivables rec WHERE rec.request_id = r.id AND rec.store_id = r.store_id) AS has_receivable
     FROM requests r
     WHERE r.store_id = $1 AND r.order_number = $2 AND r.status = 'pending'`,
    [storeId, num]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (row.has_receivable) return null;
  return row;
}

/**
 * Obtener un request pendiente por tienda y número de pedido (para cancelar desde webhook).
 * Devuelve cualquier pedido pendiente, tenga o no cuenta por cobrar asociada.
 * @param {string} storeId - ID de la tienda
 * @param {number} orderNumber - order_number del pedido
 * @returns {Promise<Object|null>} Request o null
 */
export async function getPendingRequestByStoreAndOrderNumber(storeId, orderNumber) {
  const num = parseInt(orderNumber, 10);
  if (Number.isNaN(num) || num < 1) return null;
  const result = await query(
    `SELECT id, store_id, order_number, status
     FROM requests
     WHERE store_id = $1 AND order_number = $2 AND status = 'pending'`,
    [storeId, num]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Restar stock de productos según los ítems de un pedido (request).
 * Se usa cuando se crea una cuenta por cobrar vinculada al pedido.
 * @param {string} requestId - ID del request
 * @param {string} storeId - ID de la tienda
 * @returns {Promise<void>}
 */
export async function decreaseStockForRequest(requestId, storeId) {
  const currentRequest = await getRequestById(requestId, storeId);
  if (!currentRequest) return;

  const items = currentRequest.items || [];
  for (const item of items) {
    const productId = item.productId;
    const quantity = item.quantity || 0;

    if (!productId || quantity <= 0) continue;

    const productResult = await query(
      'SELECT id, stock, attributes, combinations FROM products WHERE id = $1 AND store_id = $2',
      [productId, storeId]
    );

    if (productResult.rows.length === 0) {
      console.warn(`Producto ${productId} no encontrado para el pedido ${requestId}`);
      continue;
    }

    const product = productResult.rows[0];
    let attributes = product.attributes || [];
    if (typeof attributes === 'string') {
      try {
        attributes = JSON.parse(attributes);
      } catch (e) {
        console.error(`Error parseando attributes del producto ${productId}:`, e);
        attributes = [];
      }
    }
    let combinations = product.combinations || [];
    if (typeof combinations === 'string') {
      try {
        combinations = JSON.parse(combinations);
      } catch (e) {
        console.error(`Error parseando combinations del producto ${productId}:`, e);
        combinations = [];
      }
    }

    const hasSelectedVariants = item.selectedVariants && Array.isArray(item.selectedVariants) && item.selectedVariants.length > 0;
    const hasCombinations = Array.isArray(combinations) && combinations.length > 0;

    if (hasCombinations && hasSelectedVariants) {
      const itemSelections = {};
      for (const sv of item.selectedVariants) {
        if (sv.attributeId && sv.variantId) itemSelections[sv.attributeId] = sv.variantId;
      }
      const comboKeys = Object.keys(itemSelections).sort();
      const matchingCombo = combinations.find((c) => {
        const cSel = c.selections && typeof c.selections === 'object' ? c.selections : {};
        const cKeys = Object.keys(cSel).sort();
        if (comboKeys.length !== cKeys.length) return false;
        return comboKeys.every((k) => cSel[k] === itemSelections[k]);
      });

      if (matchingCombo) {
        const currentStock = typeof matchingCombo.stock === 'number' ? matchingCombo.stock : 0;
        const newStock = Math.max(0, currentStock - quantity);
        const updatedCombinations = combinations.map((c) => {
          const cSel = c.selections && typeof c.selections === 'object' ? c.selections : {};
          const cKeys = Object.keys(cSel).sort();
          const isMatch = comboKeys.length === cKeys.length && comboKeys.every((k) => cSel[k] === itemSelections[k]);
          return isMatch ? { ...c, stock: newStock } : c;
        });
        const currentProductStock = typeof product.stock === 'number' ? product.stock : 0;
        const newProductStock = Math.max(0, currentProductStock - quantity);
        await query(
          `UPDATE products SET combinations = $1::jsonb, stock = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND store_id = $4`,
          [JSON.stringify(updatedCombinations), newProductStock, productId, storeId]
        );
      } else {
        const currentStock = typeof product.stock === 'number' ? product.stock : 0;
        const newStock = Math.max(0, currentStock - quantity);
        await query(
          `UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND store_id = $3`,
          [newStock, productId, storeId]
        );
      }
    } else if (hasSelectedVariants) {
      const updatedAttributes = attributes.map((attr) => {
        if (!attr.variants || !Array.isArray(attr.variants)) {
          return attr;
        }
        const updatedVariants = attr.variants.map((variant) => {
          const selectedVariant = item.selectedVariants.find(
            (sv) => sv.attributeId === attr.id && sv.variantId === variant.id
          );
          if (selectedVariant) {
            const currentStock = typeof variant.stock === 'number' ? variant.stock : 0;
            const newStock = Math.max(0, currentStock - quantity);
            return { ...variant, stock: newStock };
          }
          return variant;
        });
        return { ...attr, variants: updatedVariants };
      });
      const currentProductStock = typeof product.stock === 'number' ? product.stock : 0;
      const newProductStock = Math.max(0, currentProductStock - quantity);
      await query(
        `UPDATE products SET attributes = $1::jsonb, stock = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND store_id = $4`,
        [JSON.stringify(updatedAttributes), newProductStock, productId, storeId]
      );
    } else {
      const currentStock = typeof product.stock === 'number' ? product.stock : 0;
      const newStock = Math.max(0, currentStock - quantity);
      await query(
        `UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND store_id = $3`,
        [newStock, productId, storeId]
      );
    }
  }
}

/**
 * Restaurar stock de productos según los ítems de un pedido (request).
 * Se usa al cancelar una cuenta por cobrar vinculada al pedido o al cancelar un pedido completado.
 * @param {string} requestId - ID del request
 * @param {string} storeId - ID de la tienda
 * @returns {Promise<void>}
 */
export async function increaseStockForRequest(requestId, storeId) {
  const currentRequest = await getRequestById(requestId, storeId);
  if (!currentRequest) return;

  const items = currentRequest.items || [];
  for (const item of items) {
    const productId = item.productId;
    const quantity = item.quantity || 0;

    if (!productId || quantity <= 0) continue;

    const productResult = await query(
      'SELECT id, stock, attributes, combinations FROM products WHERE id = $1 AND store_id = $2',
      [productId, storeId]
    );

    if (productResult.rows.length === 0) continue;

    const product = productResult.rows[0];
    let attributes = product.attributes || [];
    if (typeof attributes === 'string') {
      try {
        attributes = JSON.parse(attributes);
      } catch (e) {
        console.error(`Error parseando attributes del producto ${productId}:`, e);
        attributes = [];
      }
    }
    let combinations = product.combinations || [];
    if (typeof combinations === 'string') {
      try {
        combinations = JSON.parse(combinations);
      } catch (e) {
        console.error(`Error parseando combinations del producto ${productId}:`, e);
        combinations = [];
      }
    }

    const hasSelectedVariants = item.selectedVariants && Array.isArray(item.selectedVariants) && item.selectedVariants.length > 0;
    const hasCombinations = Array.isArray(combinations) && combinations.length > 0;

    if (hasCombinations && hasSelectedVariants) {
      const itemSelections = {};
      for (const sv of item.selectedVariants) {
        if (sv.attributeId && sv.variantId) itemSelections[sv.attributeId] = sv.variantId;
      }
      const comboKeys = Object.keys(itemSelections).sort();
      const matchingCombo = combinations.find((c) => {
        const cSel = c.selections && typeof c.selections === 'object' ? c.selections : {};
        const cKeys = Object.keys(cSel).sort();
        if (comboKeys.length !== cKeys.length) return false;
        return comboKeys.every((k) => cSel[k] === itemSelections[k]);
      });

      if (matchingCombo) {
        const currentStock = typeof matchingCombo.stock === 'number' ? matchingCombo.stock : 0;
        const newStock = currentStock + quantity;
        const updatedCombinations = combinations.map((c) => {
          const cSel = c.selections && typeof c.selections === 'object' ? c.selections : {};
          const cKeys = Object.keys(cSel).sort();
          const isMatch = comboKeys.length === cKeys.length && comboKeys.every((k) => cSel[k] === itemSelections[k]);
          return isMatch ? { ...c, stock: newStock } : c;
        });
        const currentProductStock = typeof product.stock === 'number' ? product.stock : 0;
        const newProductStock = currentProductStock + quantity;
        await query(
          `UPDATE products SET combinations = $1::jsonb, stock = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND store_id = $4`,
          [JSON.stringify(updatedCombinations), newProductStock, productId, storeId]
        );
      } else {
        const currentStock = typeof product.stock === 'number' ? product.stock : 0;
        await query(
          `UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND store_id = $3`,
          [currentStock + quantity, productId, storeId]
        );
      }
    } else if (hasSelectedVariants) {
      const updatedAttributes = attributes.map((attr) => {
        if (!attr.variants || !Array.isArray(attr.variants)) {
          return attr;
        }
        const updatedVariants = attr.variants.map((variant) => {
          const selectedVariant = item.selectedVariants.find(
            (sv) => sv.attributeId === attr.id && sv.variantId === variant.id
          );
          if (selectedVariant) {
            const currentStock = typeof variant.stock === 'number' ? variant.stock : 0;
            return { ...variant, stock: currentStock + quantity };
          }
          return variant;
        });
        return { ...attr, variants: updatedVariants };
      });
      const currentProductStock = typeof product.stock === 'number' ? product.stock : 0;
      const newProductStock = currentProductStock + quantity;
      await query(
        `UPDATE products SET attributes = $1::jsonb, stock = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND store_id = $4`,
        [JSON.stringify(updatedAttributes), newProductStock, productId, storeId]
      );
    } else {
      const currentStock = typeof product.stock === 'number' ? product.stock : 0;
      await query(
        `UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND store_id = $3`,
        [currentStock + quantity, productId, storeId]
      );
    }
  }
}

/**
 * Actualizar el estado de un pedido. Sincronización con cuentas por cobrar y stock:
 * - Completar pedido SIN cuenta vinculada → se descuenta stock UNA VEZ aquí.
 * - Completar pedido CON cuenta vinculada → NO se descuenta stock (ya se descontó al crear la cuenta);
 *   además se marca la cuenta como cobrada.
 * - Cuenta marcada cobrada (desde receivableService) → se marca el pedido completado; stock ya descontado.
 * - Cancelar pedido que estaba completado → se restaura stock.
 *
 * @param {string} requestId - ID del request
 * @param {string} storeId - ID de la tienda
 * @param {string} status - Nuevo estado
 * @returns {Promise<Object|null>} Request actualizado o null
 */
export async function updateRequestStatus(requestId, storeId, status) {
  const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Estado inválido. Debe ser uno de: ${validStatuses.join(', ')}`);
  }

  const currentRequest = await getRequestById(requestId, storeId);
  if (!currentRequest) {
    return null;
  }

  // Escenario 1: Cancelar pedido que estaba completado → restaurar stock solo si el stock se descontó aquí
  // (al marcar completado sin cuenta por cobrar). Si existe cuenta por cobrar vinculada (cualquier estado),
  // el stock se descontó al crear la cuenta; la restauración debe ser solo al cancelar la cuenta (evitar doble restauración).
  if (status === 'cancelled' && currentRequest.status === 'completed') {
    const hasReceivable = await query(
      `SELECT 1 FROM receivables WHERE request_id = $1 AND store_id = $2`,
      [requestId, storeId]
    );
    if (hasReceivable.rows.length === 0) {
      try {
        await increaseStockForRequest(requestId, storeId);
      } catch (err) {
        console.error('Error restaurando stock al cancelar pedido:', err);
      }
    }
  }

  // Escenario 2: Marcar pedido como completado
  // - Si tiene cuenta por cobrar relacionada: el stock YA se descontó al crear la cuenta; NO descontar de nuevo.
  // - Si NO tiene cuenta por cobrar: descontar stock ahora (única vez).
  if (status === 'completed' && currentRequest.status !== 'completed') {
    const recCheck = await query(
      `SELECT 1 FROM receivables WHERE request_id = $1 AND store_id = $2 AND status IN ('pending', 'paid')`,
      [requestId, storeId]
    );
    if (recCheck.rows.length === 0) {
      try {
        await decreaseStockForRequest(requestId, storeId);
      } catch (err) {
        console.error('Error descontando stock al marcar pedido completado:', err);
      }
    }
  }

  // Actualizar el estado del request
  const result = await query(
    `UPDATE requests
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND store_id = $3
     RETURNING 
       id,
       store_id,
       customer_name,
       customer_phone,
       customer_email,
       items,
       custom_message,
       status,
       total,
       currency,
       created_at,
       updated_at`,
    [status, requestId, storeId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  // Si se marcó el pedido como completado y tiene una cuenta por cobrar pendiente vinculada,
  // marcar esa cuenta como cobrada (sincronización bidireccional).
  // El stock ya fue descontado al crear la cuenta desde el pedido; no se descuenta aquí.
  if (status === 'completed') {
    await query(
      `UPDATE receivables
       SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $1 AND store_id = $2 AND status = 'pending'`,
      [requestId, storeId]
    );
  }

  return result.rows[0];
}

/**
 * Actualizar los ítems de un pedido vinculado a una cuenta por cobrar.
 * Restaura el stock de los productos viejos y descuenta el de los nuevos.
 * Solo se permite si existe una cuenta por cobrar (pending/paid) para este pedido.
 * @param {string} requestId - ID del request
 * @param {string} storeId - ID de la tienda
 * @param {Array} newItems - Nuevos ítems (misma estructura que request.items: productId, quantity, selectedVariants, etc.)
 * @param {number} newTotal - Nuevo total del pedido
 * @returns {Promise<Object|null>} Request actualizado o null
 */
export async function updateRequestItemsForReceivable(requestId, storeId, newItems, newTotal) {
  if (!Array.isArray(newItems) || newItems.length === 0) {
    throw new Error('Los ítems deben ser un array con al menos un producto');
  }
  const totalNum = parseFloat(newTotal);
  if (Number.isNaN(totalNum) || totalNum < 0) {
    throw new Error('El total debe ser un número mayor o igual a 0');
  }

  const recCheck = await query(
    `SELECT id FROM receivables WHERE request_id = $1 AND store_id = $2 AND status IN ('pending', 'paid')`,
    [requestId, storeId]
  );
  if (recCheck.rows.length === 0) {
    throw new Error('Solo se pueden cambiar productos en una cuenta por cobrar creada desde un pedido (pendiente o cobrada)');
  }

  const currentRequest = await getRequestById(requestId, storeId);
  if (!currentRequest) {
    throw new Error('Pedido no encontrado');
  }

  // 1. Restaurar stock de los productos actuales del pedido
  await increaseStockForRequest(requestId, storeId);

  // 2. Actualizar el pedido con los nuevos ítems y total
  const result = await query(
    `UPDATE requests
     SET items = $1::jsonb, total = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND store_id = $4
     RETURNING id, store_id, order_number, customer_name, customer_phone, customer_email,
       items, custom_message, status, total, currency, created_at, updated_at`,
    [JSON.stringify(newItems), totalNum, requestId, storeId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  // 3. Descontar stock de los nuevos productos
  await decreaseStockForRequest(requestId, storeId);

  return result.rows[0];
}
