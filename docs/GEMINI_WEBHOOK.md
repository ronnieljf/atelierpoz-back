# Webhook de WhatsApp con Gemini AI 🤖

## Descripción

Sistema de webhook conversacional para WhatsApp que usa Google Gemini AI para permitir a los usuarios de tiendas gestionar todo su negocio mediante conversaciones naturales.

## Características

### ✨ Conversaciones Naturales
- Los usuarios pueden escribir en lenguaje natural, no necesitan comandos específicos
- Gemini entiende el contexto y las intenciones del usuario
- Mantiene historial de conversación para contexto continuo

### 🎯 Funcionalidades Disponibles

Los usuarios pueden:

1. **Consultar Pedidos**
   - Ver pedidos pendientes, en proceso, completados o cancelados
   - Filtrar por estado
   - Ver detalles completos de cada pedido

2. **Gestionar Cuentas por Cobrar**
   - Consultar cuentas pendientes, pagadas o canceladas
   - Ver montos totales, pagados y pendientes
   - Filtrar por estado

3. **Convertir Pedidos a Cuentas**
   - Convertir cualquier pedido pendiente en cuenta por cobrar
   - Confirmación automática

4. **Crear Cuentas Manuales**
   - Crear cuentas por cobrar sin pedido asociado
   - Especificar cliente, monto, moneda y descripción
   - Útil para ventas directas o servicios

5. **Registrar Abonos**
   - Registrar pagos parciales o totales
   - Agregar notas a los pagos
   - Actualización automática del saldo pendiente
   - Marca automática como "cobrada" cuando se paga el total

5. **Registrar Abonos**
   - Registrar pagos parciales o totales
   - Agregar notas a los pagos
   - Actualización automática del saldo pendiente
   - Marca automática como "cobrada" cuando se paga el total

6. **Cambiar Estados**
   - Marcar cuentas como cobradas
   - Cancelar cuentas o pedidos
   - Cambiar estado de pedidos (en proceso, completado, cancelado)

7. **Consultar Productos**
   - Ver catálogo de productos
   - Buscar por nombre o código
   - Ver precios, stock y disponibilidad

8. **Gestionar Clientes**
   - Ver lista completa de clientes
   - Buscar clientes por nombre, teléfono o email
   - Crear nuevos clientes con nombre, teléfono y email

9. **Gestionar Categorías**
   - Ver todas las categorías de productos
   - Crear nuevas categorías
   - Organizar el catálogo de productos
   - Crear nuevas categorías
   - Organizar el catálogo de productos

### 🔒 Validación Automática
- Valida que el teléfono pertenezca a una tienda registrada
- Obtiene automáticamente información de todas las tiendas del usuario
- Verifica permisos antes de cada acción

### 🌐 Botón de Acceso Web
- **Cada respuesta** incluye un botón para acceder al panel de administración
- El botón contiene un token de autenticación automática
- El usuario hace clic y entra directamente sin necesidad de login
- URL del botón: `https://tu-dominio.com/admin?token=xxx`

## Configuración

### 1. Variables de Entorno

Añade a tu archivo `.env`:

```bash
# Google Gemini AI
GEMINI_API_KEY=tu_api_key_de_gemini_aqui

# WhatsApp Business API (Meta)
WS_token=tu_token_de_meta
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
WHATSAPP_VERIFY_TOKEN=tu_verify_token

# Domain (para botones web)
DOMAIN=https://atelierpoz.com
```

### 2. Obtener API Key de Gemini

1. Ve a [Google AI Studio](https://aistudio.google.com/)
2. Crea una cuenta o inicia sesión
3. Ve a "Get API Key"
4. Crea un nuevo API key
5. Copia el key y añádelo a tu `.env`

### 3. Configurar Webhook en Meta

1. Ve a [Meta for Developers](https://developers.facebook.com/)
2. Selecciona tu app de WhatsApp Business
3. En "Webhooks", configura:
   - **Callback URL**: `https://tu-dominio.com/api/webhooks/whatsapp`
   - **Verify Token**: El mismo que pusiste en `WHATSAPP_VERIFY_TOKEN`
4. Suscríbete a los eventos `messages`

## Uso

### Ejemplos de Conversaciones

```
Usuario: Hola
Bot: 👋 ¡Hola! Soy tu asistente de Atelier Poz. 
     Puedo ayudarte a gestionar tu tienda "Mi Tienda".
     ¿En qué puedo ayudarte hoy?
     
     [Botón: Ver en la web 🌐]
     (Link directo al admin con auto-login)

Usuario: Muéstrame los pedidos pendientes
Bot: 📋 Estos son tus pedidos pendientes:
     
     Pedido #1
     👤 Juan Pérez
     📱 +58 412 1234567
     💰 150.00 USD
     📅 04/02/2026
     
     Pedido #2
     👤 María González
     📱 +58 414 9876543
     💰 75.50 USD
     📅 03/02/2026

Usuario: Convierte el pedido 1 a cuenta por cobrar
Bot: ✅ Perfecto, he convertido el Pedido #1 a una cuenta por cobrar.
     
     Cuenta creada:
     - Número: Cuenta #5
     - Cliente: Juan Pérez
     - Monto: 150.00 USD

Usuario: Registra un abono de 50 dólares en la cuenta 5
Bot: ✅ Abono registrado exitosamente!
     
     - Cuenta #5
     - Monto abonado: 50.00 USD
     - Pendiente: 100.00 USD

Usuario: Cuánto debo cobrar todavía?
Bot: 💰 Estado de cuentas por cobrar:
     
     Cuenta #5 - Juan Pérez
     - Monto total: 150.00 USD
     - Pagado: 50.00 USD
     - Pendiente: 100.00 USD
     
     Total pendiente de cobro: 100.00 USD

Usuario: Muéstrame mis clientes
Bot: 👥 Clientes de Mi Tienda:
     
     1. Juan Pérez
        📱 +58 412 1234567
        📧 juan@email.com
        📅 Registrado: 15/01/2026
     
     2. María González
        📱 +58 414 9876543
        📧 maria@email.com
        📅 Registrado: 20/01/2026
     
     Total: 2 clientes

Usuario: Crea un cliente nuevo llamado Carlos López con teléfono +58 424 5555555
Bot: ✅ ¡Cliente creado exitosamente!
     
     👤 Carlos López
     📱 +58 424 5555555
     📧 Sin email
     
     Ahora tienes 3 clientes registrados.

Usuario: Muéstrame las categorías
Bot: 📁 Categorías de Mi Tienda:
     
     1. Camisas (camisas)
        📅 Creada: 10/12/2025
     
     2. Pantalones (pantalones)
        📅 Creada: 10/12/2025
     
     3. Zapatos (zapatos)
        📅 Creada: 15/12/2025
     
     Total: 3 categorías

Usuario: Crea una categoría de Accesorios
Bot: ✅ ¡Categoría creada exitosamente!
     
     📁 Accesorios (accesorios)
     
     Ya puedes asignar productos a esta nueva categoría.
```

## Arquitectura

### Componentes

1. **geminiService.js**
   - Inicializa y gestiona el cliente de Gemini
   - Mantiene historial de conversaciones
   - Define y ejecuta funciones (function calling)
   - Procesa mensajes y genera respuestas

2. **geminiWebhookController.js**
   - Recibe webhooks de WhatsApp
   - Verifica configuración (tokens, IDs)
   - Envía mensajes de texto, botones y listas
   - Maneja errores y logging

3. **webhookRoutes.js**
   - Define rutas `/whatsapp` (nuevo con Gemini)
   - Mantiene `/whatsapp-legacy` (comandos antiguos)

### Function Calling

Gemini puede llamar a estas funciones automáticamente:

- `consultar_pedidos` - Lista pedidos con filtros
- `consultar_cuentas_por_cobrar` - Lista cuentas por cobrar
- `convertir_pedido_a_cuenta` - Convierte pedido a cuenta
- `registrar_abono` - Registra pago
- `marcar_cuenta_cobrada` - Marca cuenta como pagada
- `cancelar_cuenta` - Cancela cuenta
- `cambiar_estado_pedido` - Cambia estado de pedido
- `consultar_productos` - Lista productos

Cada función:
1. Valida permisos (tienda del usuario)
2. Ejecuta la acción en la base de datos
3. Retorna resultado estructurado
4. Gemini convierte el resultado en respuesta natural

### Gestión de Historial

- Mantiene últimos 20 mensajes por usuario
- Almacenado en memoria (Map)
- En producción, usar Redis o base de datos
- Permite contexto continuo en la conversación

## Mensajes Interactivos

El sistema puede enviar:

### 1. Texto Simple
```javascript
await sendWhatsAppText(phoneNumberId, to, text, token);
```

### 2. Botones (hasta 3)
```javascript
await sendWhatsAppButtons(phoneNumberId, to, bodyText, [
  { id: 'btn1', title: 'Opción 1' },
  { id: 'btn2', title: 'Opción 2' },
], token);
```

### 3. Listas (hasta 10 opciones)
```javascript
await sendWhatsAppList(phoneNumberId, to, bodyText, 'Ver opciones', [
  {
    title: 'Sección 1',
    rows: [
      { id: 'opt1', title: 'Opción 1', description: 'Descripción' },
    ],
  },
], token);
```

### 4. Botón Web (CTA) - **Siempre se envía**
```javascript
// Este botón se envía en TODAS las respuestas del bot
// Incluye token de autenticación automática
const adminUrl = `${webUrl}/admin?token=${encodeURIComponent(loginToken)}`;

await sendWhatsAppCtaUrl(
  phoneNumberId, 
  to, 
  'Gestiona tu tienda desde el panel web 👇', 
  'Ver en la web 🌐',
  adminUrl,
  token
);
```

**Nota importante:** El botón web con acceso directo al panel de administración se envía automáticamente después de cada respuesta del bot, permitiendo al usuario acceder a la web sin necesidad de hacer login.

## Ventajas vs Webhook Anterior

| Característica | Webhook Antiguo | Webhook con Gemini |
|----------------|-----------------|-------------------|
| Tipo de comandos | Exactos, sensibles a mayúsculas | Lenguaje natural |
| Flexibilidad | Limitada | Alta |
| Confirmaciones | Manuales | Automáticas por IA |
| Manejo de errores | Mensajes genéricos | Sugerencias contextuales |
| Ayuda | Comando "ayuda" | Conversación natural |
| Aprendizaje | Curva alta (memorizar comandos) | Intuitivo |

## Migración desde Webhook Antiguo

El webhook antiguo sigue disponible en `/api/webhooks/whatsapp-legacy` por compatibilidad.

Para migrar:
1. Actualiza la URL del webhook en Meta a `/api/webhooks/whatsapp`
2. Los usuarios pueden empezar a usar lenguaje natural inmediatamente
3. No se requieren cambios en la configuración

## Limitaciones Actuales

- Historial en memoria (se pierde al reiniciar servidor)
- Límite de 20 mensajes de historial por usuario
- Solo procesa mensajes de texto (no imágenes, audios, etc.)
- Modelo: `gemini-1.5-pro-latest` (potente y estable, recomendado para producción)

## Mejoras Futuras

- [ ] Persistencia de historial en Redis/PostgreSQL
- [ ] Soporte para imágenes (análisis de productos)
- [ ] Soporte para audios (voz a texto)
- [ ] Notificaciones proactivas (recordatorios de cobros)
- [ ] Reportes automáticos periódicos
- [ ] Integración con catálogo de productos (enviar imágenes)
- [ ] Métricas y analytics de conversaciones
- [ ] A/B testing de prompts

## Troubleshooting

### Error: "Gemini API key no configurada"
- Verifica que `GEMINI_API_KEY` esté en `.env`
- Verifica que el API key sea válido

### Error: "No se encontraron tiendas para este número"
- El usuario debe registrar su teléfono en el panel admin
- Formato del teléfono debe coincidir (sin +, solo dígitos)

### Error: "Rate limit exceeded"
- Gemini tiene límites de requests por minuto
- Considera implementar queue/throttling
- Upgrade a plan con más cuota

### Las respuestas son genéricas
- Verifica que el system instruction esté llegando correctamente
- Revisa los logs de function calling
- Ajusta el prompt en `geminiService.js`

## Logs y Debugging

El sistema registra:
- Mensajes entrantes: `[gemini-webhook] Mensaje de ${phone}: ${text}`
- Function calls: `[Gemini] Ejecutando función: ${name}`
- Errores: `[Gemini] Error procesando mensaje: ${error}`

Para más debugging, añade `console.log` en:
- `geminiService.js` - function execution
- `geminiWebhookController.js` - webhook processing

## Seguridad

- ✅ Valida verificación de webhook de Meta
- ✅ Verifica que el teléfono pertenezca a una tienda
- ✅ Todas las acciones requieren ser dueño de la tienda
- ✅ Function calling con validación de permisos
- ⚠️ Historial en memoria (considerar encriptar en producción)

## Performance

- Latencia típica: 1-3 segundos
- Gemini Flash es rápido pero menos preciso
- Function calling añade 1-2 segundos
- Considera caché para consultas frecuentes

## Costos

Gemini AI pricing (aproximado):
- Gemini 1.5 Flash: Gratis hasta 15 requests/min
- Gemini 1.5 Pro: Mayor capacidad, costo por token

Para alto volumen, considera:
- Batch processing
- Caché de respuestas
- Rate limiting por usuario

## Soporte

Para problemas o mejoras:
1. Revisa logs del servidor
2. Verifica configuración de variables
3. Consulta documentación de Gemini
4. Revisa webhook de Meta

## Referencias

- [Gemini API Docs](https://ai.google.dev/docs)
- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [Function Calling Guide](https://ai.google.dev/docs/function_calling)
