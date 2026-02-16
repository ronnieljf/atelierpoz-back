# 🤖 Modelos de Gemini Disponibles

## Modelos Válidos para Production

### 1. `gemini-1.5-pro` ⭐ (RECOMENDADO)
**Actualmente en uso**

✅ **Ventajas:**
- Más potente e inteligente
- Mejor comprensión de contexto
- Respuestas más precisas y naturales
- Soporta function calling completo
- Estable y confiable para producción

⚠️ **Consideraciones:**
- Ligeramente más lento que Flash
- Costo por token más alto
- Latencia: ~2-4 segundos típica

**Mejor para:**
- Conversaciones complejas
- Tareas que requieren razonamiento
- Production con alta calidad

---

### 2. `gemini-1.5-flash-latest`
Alternativa más rápida (no disponible en todas las regiones)

✅ **Ventajas:**
- Más rápido (1-2 segundos)
- Menor costo por token
- Bueno para tareas simples

⚠️ **Desventajas:**
- Menos preciso que Pro
- Puede malinterpretar contextos complejos
- No siempre disponible (error 404 común)

**Mejor para:**
- Alto volumen de mensajes simples
- Presupuesto limitado
- Respuestas rápidas sin mucha complejidad

---

### 3. `gemini-pro`
Modelo legacy (v1)

✅ **Ventajas:**
- Muy estable
- Ampliamente disponible
- Bien documentado

⚠️ **Desventajas:**
- Versión anterior (1.0)
- Menos capacidades que 1.5
- No soporta todas las features nuevas

**Mejor para:**
- Máxima estabilidad
- Compatibilidad garantizada

---

## Comparación Rápida

| Característica | gemini-1.5-pro-latest | gemini-1.5-flash-latest | gemini-pro |
|----------------|----------------------|------------------------|------------|
| **Inteligencia** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Velocidad** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Costo** | $$$$ | $$ | $$$ |
| **Disponibilidad** | ✅ Alta | ⚠️ Variable | ✅ Máxima |
| **Function Calling** | ✅ Excelente | ✅ Bueno | ✅ Básico |
| **Context Window** | 2M tokens | 1M tokens | 32K tokens |

---

## Cómo Cambiar de Modelo

Edita el archivo `src/services/geminiService.js`:

```javascript
// Línea ~635
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-pro-latest', // Cambia aquí
  systemInstruction,
  tools: [{ functionDeclarations: functions }],
});
```

**Opciones válidas:**
- `'gemini-1.5-pro-latest'` - Recomendado
- `'gemini-1.5-flash-latest'` - Si necesitas más velocidad
- `'gemini-pro'` - Para máxima compatibilidad

---

## Errores Comunes

### Error 404: Model Not Found

```
models/gemini-1.5-flash is not found for API version v1beta
```

**Causa:** Nombre de modelo incorrecto o no disponible en tu región.

**Solución:** Usa `gemini-1.5-pro-latest` en su lugar.

### Error 429: Rate Limit

```
Resource has been exhausted (e.g. check quota).
```

**Causa:** Has excedido el límite de requests.

**Solución:**
- Plan gratuito: 15 requests/min
- Implementa rate limiting
- Upgrade a plan de pago

### Error 400: Invalid Argument

```
Invalid argument provided to Gemini API
```

**Causa:** Formato incorrecto en system instruction o function declarations.

**Solución:**
- Verifica la sintaxis JSON de las funciones
- Revisa que el system instruction sea string válido

---

## Límites de Modelos

### Plan Gratuito
- **gemini-1.5-pro-latest**: 2 requests/min
- **gemini-1.5-flash-latest**: 15 requests/min
- **gemini-pro**: 60 requests/min

### Plan de Pago
- Límites mucho más altos
- Facturación por uso
- Sin restricciones estrictas de RPM

---

## Recomendaciones para Producción

### Configuración Actual ✅
```javascript
model: 'gemini-1.5-pro-latest'
```

**Por qué:**
- Balance perfecto entre calidad y velocidad
- Soporta conversaciones complejas
- Function calling robusto
- Estable y confiable

### Si necesitas optimizar costos:
```javascript
model: 'gemini-1.5-flash-latest' // Solo si está disponible
```

Con fallback a Pro:
```javascript
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-pro-latest';

const model = genAI.getGenerativeModel({
  model: MODEL_NAME,
  // ...
});
```

### Si necesitas máxima estabilidad:
```javascript
model: 'gemini-pro'
```

---

## Monitoreo

Para ver qué modelo está usando actualmente:

```bash
grep "model:" src/services/geminiService.js
```

Para ver logs de uso:

```bash
# En el servidor
pm2 logs api-atelier | grep "Gemini"
```

---

## Testing de Modelos

Para probar diferentes modelos sin cambiar código:

1. Crea variable de entorno:
```bash
GEMINI_MODEL=gemini-1.5-flash-latest
```

2. Úsala en el código:
```javascript
const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro-latest';
```

3. Reinicia el servidor:
```bash
pm2 restart api-atelier
```

---

## Referencias

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Model Comparison](https://ai.google.dev/models/gemini)
- [Pricing](https://ai.google.dev/pricing)
- [Rate Limits](https://ai.google.dev/docs/rate_limits)

---

Última actualización: Febrero 2026
Modelo actual en producción: **gemini-1.5-pro-latest**
