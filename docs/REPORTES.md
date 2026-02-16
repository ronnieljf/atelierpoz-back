# Módulo de reportes inteligentes

API de reportes para analizar **lo que se vendió**, **lo que no se vendió**, ingresos en el tiempo, productos más vendidos y pedidos cancelados.

Todas las rutas requieren **autenticación** (Bearer token) y **storeId** en query. El usuario debe tener acceso a la tienda (o ser admin).

---

## Base

- **Base URL:** `GET /api/reports/...`
- **Headers:** `Authorization: Bearer <token>`
- **Query común:** `storeId` (UUID, requerido en todos los reportes)
- **Fechas:** `dateFrom`, `dateTo` en formato ISO o `YYYY-MM-DD`. Si no se envían, se usa el mes en curso.

---

## 1. Lo que SÍ se vendió — Ventas por producto

**GET** `/api/reports/sales`

Detalle de productos vendidos en el periodo (pedidos **completados**). Incluye unidades, ingresos y opcionalmente agrupación por categoría.

### Query

| Parámetro         | Tipo    | Descripción |
|------------------|---------|-------------|
| storeId          | UUID    | Requerido. ID de la tienda. |
| dateFrom         | string  | Fecha inicio (inclusive). |
| dateTo           | string  | Fecha fin (inclusive). |
| groupByCategory  | boolean | Si es true, incluye `byCategory` en la respuesta. |
| limit            | number  | Máximo de productos en `byProduct` (default 100, max 500). |

### Respuesta

Incluye ingresos por **pedidos completados** (con productos) y por **cuentas por cobrar manuales** (sin pedido/productos) cobradas en el periodo.

```json
{
  "success": true,
  "report": {
    "period": { "dateFrom": "...", "dateTo": "..." },
    "summary": {
      "totalUnitsSold": 150,
      "totalRevenueFromOrders": 3000.50,
      "totalRevenueFromManualReceivables": 250.00,
      "totalRevenueFromManualReceivablesByCurrency": { "USD": 250.00 },
      "totalRevenue": 3250.50,
      "ordersCount": 42,
      "productsWithSales": 28,
      "manualReceivablesPaidCount": 2
    },
    "byProduct": [
      {
        "productId": "uuid",
        "productName": "Camisa Azul",
        "sku": "CAM-AZ",
        "categoryId": "uuid",
        "categoryName": "Camisas",
        "unitsSold": 25,
        "revenue": 625.00
      }
    ],
    "byCategory": [...],
    "manualReceivablesPaid": [
      {
        "receivableId": "uuid",
        "receivableNumber": 5,
        "customerName": "Cliente X",
        "customerPhone": "+58...",
        "amount": 150.00,
        "currency": "USD",
        "paidAt": "2026-02-04T..."
      }
    ]
  }
}
```

---

## 2. Lo que NO se vendió — Productos sin ventas

**GET** `/api/reports/unsold`

Productos de la tienda que **no tuvieron ninguna venta** en el periodo (0 unidades en pedidos completados).

### Query

| Parámetro     | Tipo    | Descripción |
|---------------|---------|-------------|
| storeId       | UUID    | Requerido. |
| dateFrom      | string  | Fecha inicio. |
| dateTo        | string  | Fecha fin. |
| onlyWithStock | boolean | Si es true, solo productos con stock > 0. |
| limit         | number  | Máximo de productos (default 200, max 500). |

### Respuesta

```json
{
  "success": true,
  "report": {
    "period": { "dateFrom": "...", "dateTo": "..." },
    "summary": {
      "productsNotSold": 45,
      "totalProductsInStore": 73,
      "productsThatSold": 28,
      "onlyWithStock": false
    },
    "productsNotSold": [
      {
        "productId": "uuid",
        "productName": "Pantalón Verde",
        "sku": "PAN-VER",
        "basePrice": 45.00,
        "currency": "USD",
        "stock": 10,
        "categoryId": "uuid",
        "categoryName": "Pantalones",
        "visibleInStore": true
      }
    ]
  }
}
```

---

## 3. Reporte completo (ejecutivo + ventas + no vendido)

**GET** `/api/reports/full`

Combina resumen ejecutivo, ventas por producto y por categoría, y productos no vendidos en una sola llamada.

### Query

| Parámetro    | Tipo    | Descripción |
|--------------|---------|-------------|
| storeId      | UUID    | Requerido. |
| dateFrom     | string  | Fecha inicio. |
| dateTo       | string  | Fecha fin. |
| limitSales   | number  | Límite en lista de productos vendidos. |
| limitUnsold  | number  | Límite en lista de no vendidos. |
| onlyWithStock| boolean | Filtrar no vendidos con stock > 0. |

### Respuesta

```json
{
  "success": true,
  "report": {
    "executive": {
      "period": { "dateFrom": "...", "dateTo": "..." },
      "totalUnitsSold": 150,
      "totalRevenueFromOrders": 3000.50,
      "totalRevenueFromManualReceivables": 250.00,
      "totalRevenueFromManualReceivablesByCurrency": { "USD": 250.00 },
      "totalRevenue": 3250.50,
      "ordersCompleted": 42,
      "manualReceivablesPaidCount": 2,
      "productsWithSales": 28,
      "productsWithNoSales": 45,
      "totalProductsInStore": 73,
      "conversionProducts": "38.4%"
    },
    "sales": { "summary": {...}, "byProduct": [...], "byCategory": [...] },
    "unsold": { "summary": {...}, "productsNotSold": [...] },
    "period": { "dateFrom": "...", "dateTo": "..." }
  }
}
```

---

## 4. Ingresos en el tiempo (gráficos)

**GET** `/api/reports/revenue-over-time`

Ingresos y cantidad de pedidos agrupados por día, semana o mes. Incluye ingresos de **pedidos completados** y de **cuentas por cobrar manuales** cobradas en el periodo.

### Query

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| storeId   | UUID   | Requerido. |
| dateFrom  | string | Fecha inicio. |
| dateTo    | string | Fecha fin. |
| groupBy   | string | `day`, `week` o `month`. Default: `day`. |

### Respuesta

```json
{
  "success": true,
  "period": { "dateFrom": "...", "dateTo": "..." },
  "groupBy": "day",
  "buckets": [
    {
      "date": "2026-02-01",
      "ordersCount": 5,
      "revenueFromOrders": 400.00,
      "revenueFromManualReceivables": 50.00,
      "revenue": 450.00,
      "currency": "USD"
    }
  ]
}
```

---

## 5. Top productos

**GET** `/api/reports/top-products`

Productos más vendidos por **unidades** o por **ingresos**.

### Query

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| storeId   | UUID   | Requerido. |
| dateFrom  | string | Fecha inicio. |
| dateTo    | string | Fecha fin. |
| limit     | number | Cantidad (default 10, max 50). |
| sortBy    | string | `units` o `revenue`. Default: `units`. |

### Respuesta

```json
{
  "success": true,
  "period": { "dateFrom": "...", "dateTo": "..." },
  "sortBy": "units",
  "top": [
    {
      "productId": "uuid",
      "productName": "Camisa Azul",
      "sku": "CAM-AZ",
      "categoryName": "Camisas",
      "unitsSold": 25,
      "revenue": 625.00
    }
  ]
}
```

---

## 6. Pedidos cancelados (oportunidades perdidas)

**GET** `/api/reports/cancelled-orders`

Pedidos con estado **cancelled** en el periodo: valor no cobrado y detalle de pedidos.

### Query

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| storeId   | UUID   | Requerido. |
| dateFrom  | string | Fecha inicio. |
| dateTo    | string | Fecha fin. |
| limit     | number | Máximo de pedidos en la lista (default 50). |

### Respuesta

```json
{
  "success": true,
  "report": {
    "period": { "dateFrom": "...", "dateTo": "..." },
    "summary": {
      "cancelledOrdersCount": 8,
      "totalValueLost": 720.50
    },
    "cancelledOrders": [
      {
        "requestId": "uuid",
        "orderNumber": 12,
        "customerName": "Juan",
        "customerPhone": "+58...",
        "total": 95.00,
        "currency": "USD",
        "itemsCount": 3,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
}
```

---

## Criterios de “vendido” y “no vendido”

- **Vendido (con productos):** Pedidos **completados** (`requests.status = 'completed'`). La fecha usada es `requests.updated_at`. Los ítems y montos salen de `requests.items` (JSONB).
- **Vendido (sin productos):** **Cuentas por cobrar manuales** cobradas en el periodo: `receivables` con `request_id IS NULL` y `status = 'paid'`. La fecha usada es `paid_at`. No hay desglose por producto; se incluyen en el ingreso total y en ingresos en el tiempo.
- **No vendido:** Productos de la tienda que **no aparecen** en ningún ítem de pedidos completados en el periodo. Opcionalmente solo con `stock > 0` (`onlyWithStock=true`).

---

## Errores

- **400** — Falta `storeId` o parámetro inválido.
- **401** — Sin token o token inválido.
- **403** — Sin acceso a la tienda.
- **500** — Error interno (base de datos, etc.).

---

## Archivos del módulo

- `src/services/reportService.js` — Lógica de reportes y consultas.
- `src/controllers/reportController.js` — Handlers y validación de acceso.
- `src/routes/reportRoutes.js` — Rutas bajo `/api/reports`.
- `docs/REPORTES.md` — Esta documentación.
