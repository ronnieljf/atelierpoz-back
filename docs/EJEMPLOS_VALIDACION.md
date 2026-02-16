# 📋 Ejemplos de Validación y Solicitud de Información

Este documento muestra cómo el bot ahora solicita información faltante antes de ejecutar acciones.

## 🔴 Regla Principal

**El bot NUNCA ejecuta funciones con datos incompletos. SIEMPRE pregunta TODOS los datos necesarios.**

---

## 1. Crear Cliente

### ❌ Comportamiento Anterior (Incorrecto)

```
Usuario: crea un cliente
Bot: ✅ Cliente creado exitosamente!
     👤 Cliente
     📱 Sin teléfono
```

### ✅ Comportamiento Nuevo (Correcto)

```
Usuario: crea un cliente
Bot: Perfecto! Para crear un cliente necesito:
     
     • Nombre del cliente
     • Teléfono (con código de país, ej: +58 424 1234567)
     • Email (opcional)
     
     ¿Cuál es el nombre y teléfono del cliente?

Usuario: Carlos López +58 424 5555555
Bot: ✅ ¡Cliente creado exitosamente!
     
     👤 Carlos López
     📱 +58 424 5555555
     📧 Sin email
     
     ¿Quieres agregar su email?
```

---

## 2. Crear Categoría

### ❌ Comportamiento Anterior (Incorrecto)

```
Usuario: crea una categoría
Bot: [Error: El nombre de la categoría es obligatorio]
```

### ✅ Comportamiento Nuevo (Correcto)

```
Usuario: crea una categoría
Bot: ¿Qué nombre quieres para la nueva categoría?
     
     Por ejemplo: Camisas, Zapatos, Accesorios

Usuario: Gorras
Bot: ✅ ¡Categoría creada exitosamente!
     
     📁 Gorras (gorras)
     
     Ya puedes asignar productos a esta categoría.
```

---

## 3. Crear Cuenta por Cobrar

### ❌ Comportamiento Anterior (Incorrecto)

```
Usuario: crea una cuenta por cobrar
Bot: [Ejecuta función sin saber si es manual o de pedido]
```

### ✅ Comportamiento Nuevo (Correcto)

```
Usuario: crea una cuenta por cobrar
Bot: Hay dos formas de crear una cuenta:
     
     1️⃣ *Desde un pedido existente*
        Ejemplo: "convierte el pedido 5 en cuenta"
     
     2️⃣ *Manual (sin pedido)*
        Necesito estos datos:
        • Nombre del cliente
        • Teléfono
        • Monto a cobrar
        • Moneda (USD/EUR)
        • Descripción
     
     ¿Cuál prefieres?

Usuario: manual
Bot: Perfecto! Dame estos datos:
     
     • Nombre del cliente
     • Teléfono (con código de país)
     • Monto a cobrar
     • Moneda (USD o EUR)
     • Descripción del concepto

Usuario: María González, +58 414 1234567, 150, USD, Venta de 3 camisas talla M
Bot: ✅ ¡Cuenta por cobrar creada!
     
     Cuenta #12
     👤 María González
     📱 +58 414 1234567
     💰 150.00 USD
     📝 Venta de 3 camisas talla M
     
     Estado: Pendiente de cobro
```

### Caso: Desde Pedido

```
Usuario: crea una cuenta por cobrar
Bot: Hay dos formas de crear una cuenta:
     
     1️⃣ *Desde un pedido existente*
        Ejemplo: "convierte el pedido 5 en cuenta"
     
     2️⃣ *Manual (sin pedido)*
        [...]
     
     ¿Cuál prefieres?

Usuario: desde un pedido
Bot: ¿Cuál pedido quieres convertir?
     
     Dime el número del pedido.
     
     Si no lo sabes, puedo mostrarte los pedidos pendientes.

Usuario: el pedido 3
Bot: ✅ Perfecto, he convertido el Pedido #3 a cuenta por cobrar.
     
     Cuenta creada:
     - Número: Cuenta #13
     - Cliente: Juan Pérez
     - Monto: 250.00 USD
```

---

## 4. Registrar Pago/Abono

### ❌ Comportamiento Anterior (Incorrecto)

```
Usuario: registra un pago
Bot: [Error: falta cuenta y monto]
```

### ✅ Comportamiento Nuevo (Correcto)

```
Usuario: registra un pago
Bot: ¿En qué cuenta quieres registrar el pago?
     
     Ejemplo: cuenta 3 o cuenta #3
     
     Y ¿de cuánto es el pago?

Usuario: en la cuenta 12 por 50 dólares
Bot: ✅ Abono registrado exitosamente!
     
     Cuenta #12 - María González
     💵 Abonado hoy: $50.00
     📊 Pendiente: $100.00
     
     ¿Quieres registrar otro abono?
```

---

## 5. Crear Producto (Futuro)

### ✅ Comportamiento Esperado

```
Usuario: crea un producto
Bot: Para crear un producto necesito estos datos:
     
     • Nombre del producto
     • Código/SKU
     • Precio base
     • Moneda (USD/EUR)
     • Categoría
     • Stock inicial
     
     Dame estos datos y lo creo de inmediato!

Usuario: Camisa Polo Azul, POL-AZ-001, 35, USD, Camisas, 20
Bot: ✅ ¡Producto creado exitosamente!
     
     🛍️ Camisa Polo Azul
     📦 SKU: POL-AZ-001
     💰 $35.00 USD
     📁 Camisas
     📊 Stock: 20 unidades
     
     El producto ya está visible en tu catálogo.
```

---

## 6. Cambiar Estado de Pedido

### ❌ Comportamiento Anterior (Incorrecto)

```
Usuario: cambia el estado
Bot: [Error o ejecuta sin saber qué pedido ni estado]
```

### ✅ Comportamiento Nuevo (Correcto)

```
Usuario: cambia el estado del pedido
Bot: ¿De qué pedido? Dame el número.
     
     Y ¿a qué estado lo cambio?
     • En proceso (processing)
     • Completado (completed)
     • Cancelado (cancelled)

Usuario: del pedido 5 a completado
Bot: ✅ Pedido #5 marcado como completado
     
     Cliente: Juan Pérez
     Total: $150.00 USD
     
     ¿Necesitas algo más?
```

---

## 7. Conversación Natural con Datos Completos

El bot también reconoce cuando el usuario da toda la información de una vez:

```
Usuario: crea un cliente llamado Ana García con teléfono +58 424 7777777 y email ana@gmail.com
Bot: ✅ ¡Cliente creado exitosamente!
     
     👤 Ana García
     📱 +58 424 7777777
     📧 ana@gmail.com
     
     ¡Listo! Ya está en tu lista de clientes.
```

```
Usuario: registra un abono de 75 dólares en la cuenta 8
Bot: ✅ Abono registrado exitosamente!
     
     Cuenta #8 - Carlos López
     💵 Abonado hoy: $75.00
     📊 Saldo pendiente: $25.00
     
     ¡Ya casi está cobrada completa! 🎉
```

---

## 8. Manejo de Ambigüedad

```
Usuario: ver mis cosas
Bot: ¿Qué te gustaría ver? 😊
     
     📦 Pedidos
     💰 Cuentas por cobrar
     🛍️ Productos
     👥 Clientes
     📁 Categorías
     
     Dime cuál y te lo muestro!

Usuario: los pedidos
Bot: [Ejecuta consultar_pedidos() y muestra resultados]
```

---

## 🎯 Ventajas del Nuevo Sistema

### Antes:
- ❌ Errores confusos
- ❌ Funciones fallaban silenciosamente
- ❌ Usuario no sabía qué faltaba
- ❌ Experiencia frustrante

### Ahora:
- ✅ Guía clara y específica
- ✅ Solicita datos de forma amigable
- ✅ Explica qué necesita y por qué
- ✅ Permite dar datos de forma natural
- ✅ Reconoce cuando ya tiene toda la info
- ✅ Experiencia conversacional fluida

---

## 🔧 Implementación Técnica

El `systemMessage` incluye:

```
🔴 REGLA CRÍTICA #2 - SIEMPRE PIDE INFORMACIÓN FALTANTE:
NUNCA ejecutes funciones con datos incompletos. 
SIEMPRE pregunta TODOS los datos necesarios.
```

Con ejemplos específicos de cada caso de uso, forzando al modelo a:

1. Detectar información faltante
2. Preguntar de forma específica
3. Esperar respuesta del usuario
4. Validar que tenga todos los datos
5. Solo entonces ejecutar la función

---

## 📊 Comparación de Tokens

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| System prompt | ~800 tokens | ~2000 tokens |
| Claridad | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Errores | Frecuentes | Raros |
| Experiencia | Frustrante | Fluida |
| Validación | Mínima | Completa |

El aumento en tokens del prompt es necesario y vale la pena para garantizar una experiencia de usuario mucho mejor.
