/**
 * Módulo de reportes inteligentes.
 * Ventas (lo que se vendió), no vendido (productos sin ventas en el periodo),
 * ingresos, productos más vendidos, por categoría, etc.
 */

import { query } from '../config/database.js';

/**
 * Parsea fecha inicio/fin para reportes. Soporta YYYY-MM-DD o timestamps.
 * @param {string|Date} dateFrom - Fecha inicio (inclusive)
 * @param {string|Date} dateTo - Fecha fin (inclusive, fin del día)
 * @returns {{ dateFrom: string, dateTo: string }} En formato ISO para comparar con created_at/updated_at
 */
function parseDateRange(dateFrom, dateTo) {
  const now = new Date();
  let from = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
  let to = dateTo ? new Date(dateTo) : new Date(now);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return {
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
  };
}

/**
 * Reporte de lo que SÍ se vendió.
 * Agrupa por producto (y opcionalmente variante) desde pedidos completados en el periodo.
 *
 * @param {string} storeId - ID de la tienda
 * @param {Object} options - dateFrom?, dateTo?, groupByCategory?: boolean, limit?
 * @returns {Promise<Object>} { summary, byProduct, byCategory?, period }
 */
export async function getSalesReport(storeId, options = {}) {
  const { dateFrom, dateTo } = parseDateRange(options.dateFrom, options.dateTo);
  const groupByCategory = options.groupByCategory === true;
  const limit = Math.min(Math.max(0, parseInt(options.limit, 10) || 100), 500);

  // Pedidos completados en el rango (usamos updated_at como fecha de cierre del pedido)
  const salesRows = await query(
    `WITH completed_orders AS (
       SELECT id, items, total, currency, updated_at, order_number
       FROM requests
       WHERE store_id = $1 AND status = 'completed'
         AND updated_at >= $2 AND updated_at <= $3
     ),
     expanded AS (
       SELECT
         (elem->>'productId')::uuid AS product_id,
         (elem->>'quantity')::int AS quantity,
         (COALESCE((elem->>'totalPrice')::numeric, 0)) AS revenue
       FROM completed_orders o,
            LATERAL jsonb_array_elements(o.items) AS elem
       WHERE jsonb_typeof(o.items) = 'array'
     )
     SELECT
       e.product_id,
       COALESCE(NULLIF(TRIM(p.name), ''), 'Sin nombre') AS product_name,
       p.sku,
       p.category_id,
       c.name AS category_name,
       SUM(e.quantity)::int AS units_sold,
       SUM(e.revenue)::numeric(12,2) AS revenue
     FROM expanded e
     LEFT JOIN products p ON p.id = e.product_id AND p.store_id = $1
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE e.product_id IS NOT NULL AND e.quantity > 0
     GROUP BY e.product_id, p.name, p.sku, p.category_id, c.name
     ORDER BY units_sold DESC, revenue DESC
     LIMIT $4`,
    [storeId, dateFrom, dateTo, limit]
  );

  const byProduct = salesRows.rows.map((r) => ({
    productId: r.product_id,
    productName: r.product_name,
    sku: r.sku,
    categoryId: r.category_id,
    categoryName: r.category_name,
    unitsSold: parseInt(r.units_sold, 10) || 0,
    revenue: parseFloat(r.revenue) || 0,
  }));

  const totalUnits = byProduct.reduce((s, p) => s + p.unitsSold, 0);
  const totalRevenueFromOrders = byProduct.reduce((s, p) => s + p.revenue, 0);

  // Conteo de pedidos completados en el periodo
  const ordersCountResult = await query(
    `SELECT COUNT(*)::int AS cnt FROM requests
     WHERE store_id = $1 AND status = 'completed' AND updated_at >= $2 AND updated_at <= $3`,
    [storeId, dateFrom, dateTo]
  );
  const ordersCount = ordersCountResult.rows[0]?.cnt ?? 0;

  // Cuentas por cobrar manuales (sin pedido) cobradas en el periodo
  const manualReceivablesResult = await query(
    `SELECT id, receivable_number, customer_name, customer_phone, amount, currency, paid_at
     FROM receivables
     WHERE store_id = $1 AND request_id IS NULL AND status = 'paid'
       AND paid_at >= $2 AND paid_at <= $3
     ORDER BY paid_at DESC`,
    [storeId, dateFrom, dateTo]
  );
  const manualReceivablesPaid = manualReceivablesResult.rows.map((r) => ({
    receivableId: r.id,
    receivableNumber: r.receivable_number,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    amount: parseFloat(r.amount) || 0,
    currency: r.currency || 'USD',
    paidAt: r.paid_at,
  }));
  const totalRevenueFromManualReceivables = manualReceivablesPaid.reduce((s, r) => s + r.amount, 0);
  const totalRevenueFromManualReceivablesByCurrency = manualReceivablesPaid.reduce((acc, r) => {
    const c = r.currency || 'USD';
    acc[c] = (acc[c] || 0) + r.amount;
    return acc;
  }, {});

  let byCategory = null;
  if (groupByCategory && byProduct.length > 0) {
    const map = new Map();
    for (const p of byProduct) {
      const key = p.categoryId || 'sin-categoria';
      const name = p.categoryName || 'Sin categoría';
      if (!map.has(key)) {
        map.set(key, { categoryId: p.categoryId, categoryName: name, unitsSold: 0, revenue: 0, products: [] });
      }
      const cat = map.get(key);
      cat.unitsSold += p.unitsSold;
      cat.revenue += p.revenue;
      cat.products.push({ productId: p.productId, productName: p.productName, unitsSold: p.unitsSold, revenue: p.revenue });
    }
    byCategory = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }

  return {
    period: { dateFrom, dateTo },
    summary: {
      totalUnitsSold: totalUnits,
      totalRevenueFromOrders,
      totalRevenueFromManualReceivables,
      totalRevenueFromManualReceivablesByCurrency,
      totalRevenue: totalRevenueFromOrders + totalRevenueFromManualReceivables,
      ordersCount,
      productsWithSales: byProduct.length,
      manualReceivablesPaidCount: manualReceivablesPaid.length,
    },
    byProduct,
    byCategory: byCategory || undefined,
    manualReceivablesPaid: manualReceivablesPaid.length > 0 ? manualReceivablesPaid : undefined,
  };
}

/**
 * Reporte de lo que NO se vendió en el periodo.
 * Productos de la tienda con 0 unidades vendidas en el rango (opcional: solo con stock > 0).
 *
 * @param {string} storeId - ID de la tienda
 * @param {Object} options - dateFrom?, dateTo?, onlyWithStock?: boolean, limit?
 * @returns {Promise<Object>} { summary, productsNotSold, period }
 */
export async function getUnsoldReport(storeId, options = {}) {
  const { dateFrom, dateTo } = parseDateRange(options.dateFrom, options.dateTo);
  const onlyWithStock = options.onlyWithStock === true;
  const limit = Math.min(Math.max(0, parseInt(options.limit, 10) || 200), 500);

  // Productos que SÍ vendieron en el periodo (ids)
  const soldProductIdsResult = await query(
    `WITH completed_orders AS (
       SELECT items FROM requests
       WHERE store_id = $1 AND status = 'completed'
         AND updated_at >= $2 AND updated_at <= $3
     )
     SELECT DISTINCT (elem->>'productId')::uuid AS product_id
     FROM completed_orders o,
          LATERAL jsonb_array_elements(o.items) AS elem
     WHERE jsonb_typeof(o.items) = 'array' AND elem->>'productId' IS NOT NULL`,
    [storeId, dateFrom, dateTo]
  );
  const soldIds = soldProductIdsResult.rows.map((r) => r.product_id).filter(Boolean);

  const params = [storeId];
  let paramIdx = 2;
  let productsNotSoldQuery = `
    SELECT p.id, p.name, p.sku, p.base_price, p.currency, p.stock, p.category_id, p.visible_in_store,
           c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.store_id = $1`;

  if (soldIds.length > 0) {
    productsNotSoldQuery += ` AND p.id != ALL($${paramIdx}::uuid[])`;
    params.push(soldIds);
    paramIdx++;
  }
  if (onlyWithStock) {
    productsNotSoldQuery += ` AND p.stock > 0`;
  }
  productsNotSoldQuery += ` ORDER BY p.stock DESC, p.name ASC LIMIT $${paramIdx}`;
  params.push(limit);

  const productsResult = await query(productsNotSoldQuery, params);
  const productsNotSold = productsResult.rows.map((r) => ({
    productId: r.id,
    productName: r.name,
    sku: r.sku,
    basePrice: parseFloat(r.base_price) || 0,
    currency: r.currency || 'USD',
    stock: parseInt(r.stock, 10) || 0,
    categoryId: r.category_id,
    categoryName: r.category_name,
    visibleInStore: r.visible_in_store,
  }));

  const totalProductsResult = await query(
    'SELECT COUNT(*)::int AS cnt FROM products WHERE store_id = $1',
    [storeId]
  );
  const totalProducts = totalProductsResult.rows[0]?.cnt ?? 0;

  return {
    period: { dateFrom, dateTo },
    summary: {
      productsNotSold: productsNotSold.length,
      totalProductsInStore: totalProducts,
      productsThatSold: soldIds.length,
      onlyWithStock: onlyWithStock,
    },
    productsNotSold,
  };
}

/**
 * Reporte combinado: lo vendido + lo no vendido + resumen ejecutivo.
 *
 * @param {string} storeId - ID de la tienda
 * @param {Object} options - dateFrom?, dateTo?, limitSales?, limitUnsold?, onlyWithStock?
 * @returns {Promise<Object>}
 */
export async function getFullReport(storeId, options = {}) {
  const [sales, unsold] = await Promise.all([
    getSalesReport(storeId, {
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      groupByCategory: true,
      limit: options.limitSales ?? 100,
    }),
    getUnsoldReport(storeId, {
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      onlyWithStock: options.onlyWithStock ?? false,
      limit: options.limitUnsold ?? 200,
    }),
  ]);

  const executive = {
    period: sales.period,
    totalUnitsSold: sales.summary.totalUnitsSold,
    totalRevenueFromOrders: sales.summary.totalRevenueFromOrders,
    totalRevenueFromManualReceivables: sales.summary.totalRevenueFromManualReceivables ?? 0,
    totalRevenueFromManualReceivablesByCurrency: sales.summary.totalRevenueFromManualReceivablesByCurrency ?? {},
    totalRevenue: sales.summary.totalRevenue,
    ordersCompleted: sales.summary.ordersCount,
    manualReceivablesPaidCount: sales.summary.manualReceivablesPaidCount ?? 0,
    productsWithSales: sales.summary.productsWithSales,
    productsWithNoSales: unsold.summary.productsNotSold,
    totalProductsInStore: unsold.summary.totalProductsInStore,
    conversionProducts: unsold.summary.totalProductsInStore
      ? ((sales.summary.productsWithSales / unsold.summary.totalProductsInStore) * 100).toFixed(1) + '%'
      : '0%',
  };

  return {
    executive: executive,
    sales: {
      summary: sales.summary,
      byProduct: sales.byProduct,
      byCategory: sales.byCategory,
      manualReceivablesPaid: sales.manualReceivablesPaid,
    },
    unsold: {
      summary: unsold.summary,
      productsNotSold: unsold.productsNotSold,
    },
    period: sales.period,
  };
}

/**
 * Ingresos por día/semana/mes en el periodo (para gráficos).
 * Incluye ingresos de pedidos completados y de cuentas por cobrar manuales cobradas.
 *
 * @param {string} storeId - ID de la tienda
 * @param {Object} options - dateFrom?, dateTo?, groupBy: 'day'|'week'|'month'
 * @returns {Promise<Object>} { buckets: [{ date, ordersCount, revenueFromOrders, revenueFromManualReceivables, revenue, currency }] }
 */
export async function getRevenueOverTime(storeId, options = {}) {
  const { dateFrom, dateTo } = parseDateRange(options.dateFrom, options.dateTo);
  const groupBy = options.groupBy === 'week' ? 'week' : options.groupBy === 'month' ? 'month' : 'day';

  const dateTrunc = groupBy === 'month' ? 'month' : groupBy === 'week' ? 'week' : 'day';

  const [ordersResult, receivablesResult] = await Promise.all([
    query(
      `SELECT
         date_trunc($4, r.updated_at)::date AS bucket_date,
         COUNT(r.id)::int AS orders_count,
         SUM(r.total)::numeric(12,2) AS revenue,
         r.currency
       FROM requests r
       WHERE r.store_id = $1 AND r.status = 'completed'
         AND r.updated_at >= $2 AND r.updated_at <= $3
       GROUP BY date_trunc($4, r.updated_at), r.currency
       ORDER BY bucket_date ASC`,
      [storeId, dateFrom, dateTo, dateTrunc]
    ),
    query(
      `SELECT
         date_trunc($4, rec.paid_at)::date AS bucket_date,
         SUM(rec.amount)::numeric(12,2) AS revenue,
         rec.currency
       FROM receivables rec
       WHERE rec.store_id = $1 AND rec.request_id IS NULL AND rec.status = 'paid'
         AND rec.paid_at >= $2 AND rec.paid_at <= $3
       GROUP BY date_trunc($4, rec.paid_at), rec.currency
       ORDER BY bucket_date ASC`,
      [storeId, dateFrom, dateTo, dateTrunc]
    ),
  ]);

  const bucketByKey = new Map();
  for (const r of ordersResult.rows) {
    const key = `${r.bucket_date}_${r.currency || 'USD'}`;
    bucketByKey.set(key, {
      date: r.bucket_date,
      currency: r.currency || 'USD',
      ordersCount: parseInt(r.orders_count, 10) || 0,
      revenueFromOrders: parseFloat(r.revenue) || 0,
      revenueFromManualReceivables: 0,
    });
  }
  for (const r of receivablesResult.rows) {
    const key = `${r.bucket_date}_${r.currency || 'USD'}`;
    const cur = bucketByKey.get(key);
    const rev = parseFloat(r.revenue) || 0;
    if (cur) {
      cur.revenueFromManualReceivables += rev;
    } else {
      bucketByKey.set(key, {
        date: r.bucket_date,
        currency: r.currency || 'USD',
        ordersCount: 0,
        revenueFromOrders: 0,
        revenueFromManualReceivables: rev,
      });
    }
  }

  const buckets = Array.from(bucketByKey.values())
    .map((b) => ({
      date: b.date,
      ordersCount: b.ordersCount,
      revenueFromOrders: b.revenueFromOrders,
      revenueFromManualReceivables: b.revenueFromManualReceivables,
      revenue: b.revenueFromOrders + b.revenueFromManualReceivables,
      currency: b.currency,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return { period: { dateFrom, dateTo }, groupBy, buckets };
}

/**
 * Top N productos por unidades vendidas o por ingresos.
 *
 * @param {string} storeId - ID de la tienda
 * @param {Object} options - dateFrom?, dateTo?, limit?, sortBy: 'units'|'revenue'
 * @returns {Promise<Object>}
 */
export async function getTopProducts(storeId, options = {}) {
  const { dateFrom, dateTo } = parseDateRange(options.dateFrom, options.dateTo);
  const limit = Math.min(Math.max(1, parseInt(options.limit, 10) || 10), 50);
  const sortBy = options.sortBy === 'revenue' ? 'revenue' : 'units';

  const orderBy = sortBy === 'revenue' ? 'SUM(e.revenue) DESC' : 'SUM(e.quantity) DESC';
  const result = await query(
    `WITH completed_orders AS (
       SELECT items FROM requests
       WHERE store_id = $1 AND status = 'completed' AND updated_at >= $2 AND updated_at <= $3
     ),
     expanded AS (
       SELECT
         (elem->>'productId')::uuid AS product_id,
         (elem->>'quantity')::int AS quantity,
         COALESCE((elem->>'totalPrice')::numeric, 0) AS revenue
       FROM completed_orders o, LATERAL jsonb_array_elements(o.items) AS elem
       WHERE jsonb_typeof(o.items) = 'array'
     )
     SELECT e.product_id, COALESCE(NULLIF(TRIM(p.name), ''), 'Sin nombre') AS product_name,
            p.sku, c.name AS category_name,
            SUM(e.quantity)::int AS units_sold,
            SUM(e.revenue)::numeric(12,2) AS revenue
     FROM expanded e
     LEFT JOIN products p ON p.id = e.product_id AND p.store_id = $1
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE e.product_id IS NOT NULL AND e.quantity > 0
     GROUP BY e.product_id, p.name, p.sku, c.name
     ORDER BY ${orderBy}
     LIMIT $4`,
    [storeId, dateFrom, dateTo, limit]
  );

  const top = result.rows.map((r) => ({
    productId: r.product_id,
    productName: r.product_name,
    sku: r.sku,
    categoryName: r.category_name,
    unitsSold: parseInt(r.units_sold, 10) || 0,
    revenue: parseFloat(r.revenue) || 0,
  }));

  return { period: { dateFrom, dateTo }, sortBy, top };
}

/**
 * Pedidos cancelados en el periodo (oportunidades perdidas / “no vendido” en sentido de pedido).
 *
 * @param {string} storeId - ID de la tienda
 * @param {Object} options - dateFrom?, dateTo?, limit?
 * @returns {Promise<Object>} { summary, cancelledOrders }
 */
export async function getCancelledOrdersReport(storeId, options = {}) {
  const { dateFrom, dateTo } = parseDateRange(options.dateFrom, options.dateTo);
  const limit = Math.min(Math.max(0, parseInt(options.limit, 10) || 50), 200);

  const result = await query(
    `SELECT id, order_number, customer_name, customer_phone, total, currency, items, created_at, updated_at
     FROM requests
     WHERE store_id = $1 AND status = 'cancelled'
       AND updated_at >= $2 AND updated_at <= $3
     ORDER BY updated_at DESC
     LIMIT $4`,
    [storeId, dateFrom, dateTo, limit]
  );

  const sumResult = await query(
    `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total), 0)::numeric(12,2) AS total_value
     FROM requests
     WHERE store_id = $1 AND status = 'cancelled'
       AND updated_at >= $2 AND updated_at <= $3`,
    [storeId, dateFrom, dateTo]
  );

  const cancelledOrders = result.rows.map((r) => ({
    requestId: r.id,
    orderNumber: r.order_number,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    total: parseFloat(r.total) || 0,
    currency: r.currency || 'USD',
    itemsCount: Array.isArray(r.items) ? r.items.length : 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const summary = {
    cancelledOrdersCount: sumResult.rows[0]?.cnt ?? 0,
    totalValueLost: parseFloat(sumResult.rows[0]?.total_value ?? 0) || 0,
  };

  return { period: { dateFrom, dateTo }, summary, cancelledOrders };
}
