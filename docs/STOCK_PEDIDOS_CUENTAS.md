# Stock, pedidos y cuentas por cobrar

Documentación de la lógica que mantiene consistencia entre pedidos, cuentas por cobrar y stock.

## Regla de oro: el stock se descuenta UNA SOLA VEZ por pedido/cuenta

- El stock de los productos de un pedido se descuenta **en un único momento** según el flujo.
- Nunca se debe descontar dos veces ni dejar de descontar cuando corresponde.

## Flujos

### 1. Cuenta por cobrar creada desde un pedido

- **Dónde:** `receivableService.createReceivable` (o `createReceivableFromRequest`).
- **Qué pasa:** Se crea la cuenta con `request_id` y **ahí se descuenta el stock** (`decreaseStockForRequest`).
- **Consecuencia:** Ese pedido ya “consumió” stock. Cualquier acción posterior (marcar cuenta cobrada o pedido completado) **no** debe volver a descontar.

### 2. Marcar cuenta por cobrar como cobrada (y tiene pedido vinculado)

- **Dónde:** `receivableService.updateReceivable(..., { status: 'paid' })`.
- **Qué pasa:**
  - Se actualiza la cuenta a `paid`.
  - Si tiene `request_id`, se llama a `updateRequestStatus(request_id, storeId, 'completed')`.
- **Stock:** No se descuenta aquí. El stock ya se descontó al crear la cuenta (flujo 1).  
  En `requestService.updateRequestStatus` se comprueba si existe una receivable para ese `request_id`; si existe, **no** se llama a `decreaseStockForRequest`.

### 3. Marcar pedido como completado

- **Dónde:** `requestService.updateRequestStatus(requestId, storeId, 'completed')`.
- **Qué pasa:**
  - Si **no** hay cuenta por cobrar vinculada al pedido: se descuenta el stock **una vez** aquí (`decreaseStockForRequest`).
  - Si **sí** hay cuenta por cobrar (pending o paid): **no** se descuenta stock (ya se descontó al crear la cuenta).
  - Se actualiza el pedido a `completed`.
  - Si existe una cuenta por cobrar en estado `pending` para ese pedido, se marca como cobrada (`status = 'paid'`, `paid_at = now`).

Resumen:

- Pedido completado **sin** cuenta → descuento de stock en este paso.
- Pedido completado **con** cuenta → sin nuevo descuento; además se marca la cuenta como cobrada.

### 4. Cancelar pedido que estaba completado

- **Dónde:** `requestService.updateRequestStatus(..., 'cancelled')`.
- **Qué pasa:** Si el estado anterior era `completed`, se restaura el stock (`increaseStockForRequest`).

### 5. Cancelar cuenta por cobrar (con pedido vinculado)

- **Dónde:** `receivableService.updateReceivable(..., { status: 'cancelled' })`.
- **Qué pasa:** Si la cuenta tenía `request_id` y no estaba ya cancelada, se restaura el stock **solo si el pedido no está cancelado**.
- **Evitar doble restauración:** Si el usuario canceló primero el pedido, el stock ya se restauró allí. Por eso solo se llama a `increaseStockForRequest` cuando el pedido vinculado **no** está en estado `cancelled`.

## Resumen en tabla

| Acción                         | Pedido → completado | Cuenta → cobrada | Stock                          |
|--------------------------------|----------------------|-------------------|---------------------------------|
| Crear cuenta desde pedido      | —                    | —                 | Descuenta 1 vez                 |
| Marcar cuenta cobrada          | Sí                   | —                 | No descuenta (ya descontado)    |
| Marcar pedido completado       | —                    | Sí (si hay cuenta)| Descuenta solo si no hay cuenta|
| Cancelar pedido (estaba compl.)| —                    | —                 | Restaura 1 vez                  |
| Cancelar cuenta (con pedido)   | —                    | —                 | Restaura 1 vez si pedido no cancelado |

## Archivos implicados

- `src/services/receivableService.js`: crear cuenta desde pedido (descuenta stock), marcar cobrada (completa pedido), cancelar (restaurar stock con la condición anterior).
- `src/services/requestService.js`: completar/cancelar pedido (descuenta o restaura stock según caso), marcar cuenta cobrada al completar pedido con cuenta vinculada.
