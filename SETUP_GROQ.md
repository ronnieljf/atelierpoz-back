# 🚀 Setup Rápido - Webhook con Groq AI

## ¿Por qué Groq?

✅ **Extremadamente rápido**: Respuestas en < 1 segundo  
✅ **Excelente function calling**: Llama funciones de forma confiable  
✅ **Modelo potente**: Llama 3.3 70B  
✅ **API simple**: Similar a OpenAI  
✅ **Sin problemas de 404**: Infraestructura estable  

## Paso 1: Instalar Dependencias

El paquete `groq-sdk` ya está instalado. Si necesitas reinstalar:

```bash
npm install groq-sdk
```

## Paso 2: Obtener API Key de Groq

1. Ve a [Groq Console](https://console.groq.com/)
2. Crea una cuenta o inicia sesión
3. Ve a "API Keys" en el menú
4. Haz clic en "Create API Key"
5. Dale un nombre (ej: "Atelier Poz WhatsApp")
6. Copia el API key

## Paso 3: Configurar Variables de Entorno

Añade a tu archivo `.env`:

```bash
GROQ_API_KEY=gsk_tu_api_key_aqui
```

## Paso 4: Verificar Configuración

Asegúrate de tener todas las variables en `.env`:

```bash
# Groq AI
GROQ_API_KEY=gsk_...

# WhatsApp Business API (Meta)
WS_token=EAA...
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_VERIFY_TOKEN=mi_token_secreto

# Dominio
DOMAIN=https://atelierpoz.com
```

## Paso 5: Reiniciar el Servidor

```bash
npm run dev
# o en producción
pm2 restart api-atelier
```

## Paso 6: Probar el Bot

Envía un mensaje de WhatsApp:

```
ver pedidos
```

Deberías recibir:
1. Lista REAL de tus pedidos con todos los detalles
2. Botón para acceder al panel web

## 🎯 Comandos de Prueba

Prueba estos mensajes (el bot ahora SÍ ejecutará las funciones):

### Consultas
1. **`ver pedidos`** → Muestra lista real de pedidos
2. **`cuánto me deben`** → Muestra cuentas reales pendientes
3. **`ver productos`** → Muestra catálogo real
4. **`muéstrame los clientes`** → Lista completa de clientes
5. **`ver categorías`** → Lista todas las categorías

### Acciones
6. **`convierte el pedido 1`** → Convierte pedido a cuenta
7. **`registra un pago de 50 dólares en la cuenta 2`** → Registra abono
8. **`crea un cliente llamado Juan con teléfono +58 424 1234567`** → Nuevo cliente
9. **`crea una categoría de Accesorios`** → Nueva categoría

## Verificar Logs

Los logs ahora mostrarán:

```
[groq-webhook] Mensaje de 584121234567: ver pedidos
[Groq] Ejecutando función: consultar_pedidos
[groq-webhook] Respuesta enviada a 584121234567
```

## 🆚 Groq vs Gemini

| Característica | Groq | Gemini |
|----------------|------|--------|
| **Velocidad** | ⚡⚡⚡⚡⚡ < 1 seg | ⚡⚡⚡ 2-4 seg |
| **Function Calling** | ✅ Excelente | ⚠️ Variable |
| **Estabilidad** | ✅ Sin errores 404 | ⚠️ Modelos cambian |
| **Costo** | 💰 Gratis | 💰 Gratis |
| **Modelo** | Llama 3.3 70B | Gemini 1.5 Pro |
| **API** | Similar a OpenAI | Propia de Google |

## Troubleshooting

### Error: "GROQ_API_KEY is not defined"

Verifica:
- El archivo `.env` tiene `GROQ_API_KEY=gsk_...`
- No hay espacios antes/después del `=`
- Reiniciaste el servidor

### Error: "API key not valid"

- Verifica que el API key comience con `gsk_`
- Cópialo completo desde Groq Console
- Verifica que la key esté activa

### El bot sigue sin mostrar información

1. Verifica los logs del servidor
2. Busca líneas `[Groq] Ejecutando función:`
3. Si no aparecen, el prompt puede necesitar ajustes

## Límites de Groq

| Plan | Requests/min | Tokens/min |
|------|-------------|------------|
| Free | 30 | 14,400 |
| Paid | 30+ | Mayor |

Groq es MUY generoso con el plan gratuito! 🎉

## Ventajas Clave de Groq

1. ⚡ **Velocidad brutal**: <1 segundo para respuestas
2. 🎯 **Function calling confiable**: Llama funciones correctamente
3. 🔧 **Sin configuración compleja**: API simple y directa
4. 💪 **Modelo potente**: Llama 3.3 70B es muy capaz
5. 🌍 **Disponibilidad global**: No hay problemas de región

## Próximos Pasos

1. ✅ Groq SDK instalado
2. ✅ Servicio creado
3. ✅ Controller actualizado
4. ✅ Router usando Groq
5. 📝 Agrega tu `GROQ_API_KEY` al `.env`
6. 🔄 Reinicia el servidor
7. 🧪 Prueba el bot

## Documentación

- Servicio: `src/services/groqService.js`
- Controller: `src/controllers/geminiWebhookController.js` (usa Groq ahora)
- Router: `src/routes/webhookRoutes.js`
- Gemini Service: `src/services/geminiService.js` (mantenido como respaldo)

## Referencias

- [Groq Console](https://console.groq.com/)
- [Groq Documentation](https://console.groq.com/docs)
- [Groq Models](https://console.groq.com/docs/models)

---

🎉 **Groq es mucho más rápido y confiable que Gemini para este caso de uso!**
