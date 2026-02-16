# 🚀 Setup Rápido - Webhook con Gemini AI

## Paso 1: Instalar Dependencias

El paquete `@google/generative-ai` ya está instalado. Si necesitas reinstalar:

```bash
npm install @google/generative-ai
```

## Paso 2: Configurar Variables de Entorno

Añade la siguiente variable a tu archivo `.env`:

```bash
GEMINI_API_KEY=tu_api_key_aqui
```

### Obtener API Key de Gemini

1. Ve a [Google AI Studio](https://aistudio.google.com/)
2. Inicia sesión con tu cuenta de Google
3. Haz clic en "Get API Key" en el menú izquierdo
4. Crea un nuevo proyecto o selecciona uno existente
5. Haz clic en "Create API Key"
6. Copia el API key y añádelo a tu `.env`

## Paso 3: Configurar Webhook en Meta

1. Ve a [Meta for Developers](https://developers.facebook.com/apps)
2. Selecciona tu aplicación de WhatsApp Business
3. En el menú izquierdo, ve a "WhatsApp" > "Configuration"
4. En la sección "Webhook", haz clic en "Edit"
5. Configura:
   - **Callback URL**: `https://tu-dominio.com/api/webhooks/whatsapp`
   - **Verify Token**: El mismo que tienes en `WHATSAPP_VERIFY_TOKEN`
6. Haz clic en "Verify and Save"
7. Suscríbete al campo `messages` haciendo clic en "Subscribe"

## Paso 4: Verificar Configuración

Verifica que tienes todas las variables necesarias en tu `.env`:

```bash
# WhatsApp
WS_token=EAA...  # Token de acceso de Meta
WHATSAPP_PHONE_NUMBER_ID=123456789  # ID del número de WhatsApp
WHATSAPP_VERIFY_TOKEN=mi_token_secreto

# Gemini
GEMINI_API_KEY=AIza...  # API key de Google AI

# Dominio
DOMAIN=https://atelierpoz.com
```

## Paso 5: Reiniciar el Servidor

```bash
npm run dev
```

o en producción:

```bash
npm start
```

## Paso 6: Probar el Webhook

Envía un mensaje de WhatsApp al número configurado:

```
Hola
```

Deberías recibir:
1. Una respuesta del bot indicando que puede ayudarte
2. Un botón "Ver en la web 🌐" que te lleva directamente al panel de administración (con auto-login)

**Nota:** El botón web se envía en TODAS las respuestas del bot, permitiendo acceso rápido al panel desde cualquier conversación.

### Comandos de Prueba

Prueba estos mensajes:

1. `Muéstrame los pedidos pendientes`
2. `Cuáles son mis cuentas por cobrar?`
3. `Convierte el pedido 1 a cuenta por cobrar`
4. `Registra un abono de 50 dólares en la cuenta 1`
5. `Muéstrame el catálogo de productos`

## Verificar Logs

Los logs del servidor mostrarán:

```
[gemini-webhook] Mensaje de 584121234567: Hola
[Gemini] Ejecutando función: consultar_pedidos
[gemini-webhook] Respuesta enviada a 584121234567
```

## Troubleshooting

### Error: "GEMINI_API_KEY is not defined"

Verifica que:
- El archivo `.env` está en la raíz del proyecto backend
- La variable está correctamente escrita: `GEMINI_API_KEY=...`
- No hay espacios antes o después del `=`
- Reiniciaste el servidor después de añadir la variable

### Error: "API key not valid"

- Verifica que el API key esté correctamente copiado
- Asegúrate de que no haya espacios al inicio o final
- Verifica que el API key esté activo en Google AI Studio

### No recibo respuestas del bot

1. Verifica que el webhook esté configurado en Meta
2. Revisa los logs del servidor para ver si llegan los mensajes
3. Verifica que `WS_token` y `WHATSAPP_PHONE_NUMBER_ID` estén correctos
4. Verifica que el teléfono esté registrado como usuario de una tienda

### El bot no ejecuta acciones

1. Verifica que el usuario tenga tiendas asociadas a su teléfono
2. Revisa los logs para ver si hay errores de permisos
3. Verifica que los servicios (requestService, receivableService, etc.) estén funcionando

## Límites de Gemini

| Plan | Requests/min | Requests/día |
|------|-------------|--------------|
| Free | 15 | 1,500 |
| Pro | 360 | Sin límite |

Para uso en producción con muchos usuarios, considera:
- Implementar rate limiting
- Usar Redis para caché
- Upgrade a Gemini Pro si superas los límites

## Próximos Pasos

1. ✅ Webhook básico funcionando
2. 📝 Personalizar system prompt en `geminiService.js`
3. 🎨 Añadir más funciones según necesites
4. 💾 Implementar persistencia de historial (Redis/DB)
5. 📊 Añadir analytics y métricas
6. 🔔 Configurar notificaciones proactivas

## Documentación Completa

Para más detalles, consulta:
- [GEMINI_WEBHOOK.md](./docs/GEMINI_WEBHOOK.md) - Documentación completa
- [Gemini API Docs](https://ai.google.dev/docs)
- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)

## Soporte

Si tienes problemas:
1. Revisa los logs del servidor
2. Verifica la configuración de variables
3. Consulta la documentación completa
4. Revisa los ejemplos de conversación en la documentación
