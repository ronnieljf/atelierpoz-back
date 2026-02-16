# Configuración de Fallback para Gemini

Si `gemini-1.5-pro` tampoco funciona, usar esta configuración alternativa:

## Opción 1: Modelo v1 Estable (gemini-pro)

```javascript
// Línea ~634
const model = genAI.getGenerativeModel({
  model: 'gemini-pro', // Modelo v1 más estable
  systemInstruction,
  // IMPORTANTE: gemini-pro no soporta tools/function calling
  // Quitar la línea de tools si usas este modelo
  // tools: [{ functionDeclarations: functions }],
});
```

**NOTA:** `gemini-pro` no soporta function calling, por lo que el bot no podrá ejecutar acciones automáticamente. Solo podrá responder con texto.

## Opción 2: Sin System Instruction

Si el problema es el system instruction muy largo:

```javascript
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-pro',
  // Quitar systemInstruction si es muy largo
  // systemInstruction,
  tools: [{ functionDeclarations: functions }],
});
```

Luego incluir las instrucciones en el primer mensaje del chat.

## Opción 3: Verificar API Key

Asegúrate de que tu API key de Gemini sea válida:

```bash
# En el .env
GEMINI_API_KEY=AIza...
```

Prueba la API key directamente:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=TU_API_KEY"
```

Esto te mostrará los modelos disponibles para tu API key.

## Modelos Disponibles Comunes

- `gemini-pro` - v1, muy estable, sin function calling
- `gemini-1.5-pro` - v1.5, con function calling
- `gemini-1.5-flash` - v1.5, más rápido, con function calling

## Debugging

Si sigues teniendo errores 404, el problema puede ser:

1. **API Key incorrecta**: Verifica que sea válida
2. **Región no soportada**: Algunos modelos no están en todas las regiones
3. **Cuota excedida**: Has llegado al límite de tu plan
4. **Versión del SDK**: Actualiza `@google/generative-ai` a la última versión

```bash
npm update @google/generative-ai
```
