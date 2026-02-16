# 🚦 Manejo de Rate Limits de Groq

## Descripción

Groq AI tiene límites de uso en su plan gratuito. Este documento explica cómo el sistema maneja estos límites de forma elegante.

## Límites de Groq (Plan Gratuito)

| Recurso | Límite |
|---------|--------|
| Tokens por día | 100,000 |
| Requests por minuto | 30 |
| Modelo | llama-3.3-70b-versatile |

## Error de Rate Limit

Cuando se alcanza el límite, Groq retorna un error 429:

```json
{
  "error": {
    "message": "Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_xxx` service tier `on_demand` on tokens per day (TPD): Limit 100000, Used 98186, Requested 4302. Please try again in 35m49.632s.",
    "type": "tokens",
    "code": "rate_limit_exceeded"
  }
}
```

## Manejo en el Sistema

### 1. Detección del Error

El servicio `groqService.js` detecta errores de rate limit mediante:
- Status code 429
- Error code `rate_limit_exceeded`
- Mensaje que contiene "Rate limit"

```javascript
if (error.status === 429 || 
    error.code === 'rate_limit_exceeded' || 
    error.message?.includes('Rate limit')) {
  // Manejar rate limit
}
```

### 2. Respuesta al Usuario

Cuando se detecta un rate limit, el usuario recibe un mensaje amable:

```
😅 Ups! Hemos alcanzado el límite de mensajes por hoy.

Nuestro servicio de IA tiene un límite diario de uso, 
y ya llegamos al máximo por hoy.

⏰ *Por favor intenta de nuevo en 24 horas*

Mientras tanto, puedes acceder al panel web para 
gestionar tu tienda:
https://atelierpoz.com/admin

¡Gracias por tu comprensión! 😊

[Botón: Ver Panel Web]
```

### 3. Resúmenes Automáticos (NUEVO)

**Incluso con rate limit, el usuario recibe información útil:**

El sistema automáticamente genera y envía resúmenes detallados de:

#### Pedidos Pendientes:
```
📋 *PEDIDOS PENDIENTES - Mi Tienda*
(Mostrando 5 de 12)

📦 *Pedido #45*
👤 Juan Pérez
📱 +58 412 1234567
💰 USD 150.00
📅 03/02/2026

📦 *Pedido #47*
👤 María González
📱 +58 414 9876543
💰 USD 75.50
📅 04/02/2026

...y 7 pedido(s) más
```

#### Cuentas por Cobrar:
```
💼 *CUENTAS POR COBRAR - Mi Tienda*
(Mostrando 5 de 8)

💰 *Cuenta #23*
👤 Juan Pérez
📱 +58 412 1234567
💵 Total: USD 150.00
✅ Pagado: USD 50.00
⏳ Pendiente: USD 100.00
📅 28/01/2026

💰 *Cuenta #25*
👤 Ana López
📱 +58 424 5555555
💵 Total: USD 200.00
✅ Pagado: USD 0.00
⏳ Pendiente: USD 200.00
📅 30/01/2026

...y 3 cuenta(s) más

📊 *TOTAL A COBRAR: USD 450.00*
```

### 4. Botón Web Siempre Disponible

Incluso cuando hay rate limit, el usuario recibe:
- ✅ Mensaje explicativo claro
- ✅ Botón para acceder al panel web
- ✅ Auto-login si tiene cuenta asociada
- ✅ Experiencia fluida sin frustración

## Flujo Completo

```
Usuario envía mensaje
    ↓
Groq procesa (pero límite alcanzado)
    ↓
Error 429 detectado
    ↓
Sistema genera resúmenes automáticos:
  - Obtiene pedidos pendientes
  - Obtiene cuentas por cobrar
  - Formatea con todos los detalles (teléfonos, montos, fechas)
    ↓
Sistema retorna:
  - Mensaje amable
  - Resúmenes detallados (array)
  - error: 'rate_limit_exceeded'
  - webButtonUrl: enlace al admin
    ↓
Controller envía secuencialmente:
  1. Mensaje principal de rate limit
  2. Resumen de pedidos pendientes (si hay)
  3. Resumen de cuentas por cobrar (si hay)
  4. Botón "Mientras tanto, usa el panel web 👇"
    ↓
Usuario tiene información completa
y puede seguir usando el admin web
```

## Ventajas de Este Manejo

### ✅ Experiencia del Usuario
- **No confusión**: Mensaje claro sobre qué pasó
- **No frustración**: Alternativa inmediata (panel web)
- **Información útil**: Sabe cuándo puede volver a intentar
- **Datos reales**: Recibe resúmenes de sus pedidos y cuentas (NUEVO)
- **Completo**: Incluye teléfonos, montos, fechas (NUEVO)
- **Profesional**: Tono amable y comprensivo

### ✅ Continuidad del Servicio
- Usuario recibe información crítica incluso sin IA (NUEVO)
- Puede ver estado de pedidos y cuentas al instante (NUEVO)
- Muestra hasta 5 pedidos y 5 cuentas más relevantes (NUEVO)
- Auto-login funciona incluso con rate limit
- No hay interrupción total del servicio
- Solo el bot conversacional está temporalmente limitado

### ✅ Transparencia
- Usuario entiende que es una limitación del servicio gratuito
- Se explica claramente el tiempo de espera (24 horas)
- No parece un error del sistema, sino un límite esperado
- Recibe valor agregado (resúmenes) mientras espera (NUEVO)

## Monitoreo

Los logs muestran claramente cuando ocurre:

```
[Groq] Error procesando mensaje: RateLimitError: 429 {
  "error": {
    "message": "Rate limit reached...",
    "code": "rate_limit_exceeded"
  }
}
[Groq] Rate limit alcanzado. Generando resumen manual...
[groq-webhook] Enviando 2 resúmenes adicionales...
[groq-webhook] Respuesta enviada a 584121234567
```

## Soluciones a Largo Plazo

### Opción 1: Plan de Pago de Groq
- Límites más altos
- Mejor para producción con muchos usuarios
- Costo: Según uso

### Opción 2: Rotación de API Keys
- Múltiples cuentas gratuitas
- Rotación automática cuando una alcanza límite
- Más complejo de mantener

### Opción 3: Caché de Respuestas
- Cachear respuestas comunes (ej: "hola", "ver pedidos")
- Reducir llamadas a la API
- Balance entre frescura y uso de API

### Opción 4: Rate Limiting Proactivo
- Limitar mensajes por usuario
- Ej: máximo 50 mensajes por usuario por día
- Prevenir que un usuario consuma todo el límite

## Configuración

No requiere configuración adicional. El manejo está incorporado en:

```javascript
// src/services/groqService.js
catch (error) {
  if (error.status === 429 || error.code === 'rate_limit_exceeded') {
    return {
      response: '😅 Ups! Hemos alcanzado el límite...',
      webButtonUrl: '...',
      error: 'rate_limit_exceeded',
    };
  }
}
```

```javascript
// src/controllers/geminiWebhookController.js
const isRateLimitError = result.error === 'rate_limit_exceeded';

if (isRateLimitError || (loginToken && result.webButtonUrl)) {
  const buttonMessage = isRateLimitError
    ? 'Mientras tanto, usa el panel web 👇'
    : 'Gestiona tu tienda desde el panel web 👇';
  // ... enviar botón
}
```

## Testing

Para probar el manejo de rate limit:

1. **Simular error 429**:
```javascript
// En groqService.js, temporalmente:
throw new Error('Rate limit reached for model...');
```

2. **Verificar respuesta**:
- ✅ Mensaje amable recibido
- ✅ Botón web enviado
- ✅ Usuario puede acceder al admin
- ✅ Logs correctos

3. **Restaurar código original**

## FAQ

**P: ¿Cuánto tiempo dura el rate limit?**
R: 24 horas desde que se alcanzó el límite. Se resetea a medianoche UTC.

**P: ¿Puedo seguir usando el admin web?**
R: Sí! El rate limit solo afecta el bot de WhatsApp, no el panel web.

**P: ¿Cómo sé cuántos tokens quedan?**
R: Groq no proporciona un endpoint para consultar uso actual. Solo se detecta cuando falla.

**P: ¿Qué pasa con los mensajes durante el rate limit?**
R: Todos reciben el mismo mensaje amable explicando la situación y el botón web.

**P: ¿Se pierde la conversación?**
R: No, el historial se mantiene. Cuando el límite se resetee, la conversación continúa normalmente.

## Mejoras Futuras

1. **Dashboard de Uso**: Mostrar uso actual de tokens en el admin
2. **Alertas Tempranas**: Avisar cuando se acerca al 80% del límite
3. **Priorización**: Dar prioridad a ciertos usuarios o acciones
4. **Fallback a Gemini**: Usar Gemini automáticamente si Groq está limitado
5. **Queue System**: Encolar mensajes y procesarlos cuando haya disponibilidad

---

Desarrollado para Atelier Poz | Versión 3.2.1
