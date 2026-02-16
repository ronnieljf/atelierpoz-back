/**
 * Controlador para generación de contenido con Groq AI
 * POST /api/grok/generate
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MODELS = [
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
];

function getSystemPrompt(type) {
  // Nombre/título del producto para catálogo: descripción corta y clara
  if (type === 'title') {
    return `Eres un asistente que genera el NOMBRE del producto para un catálogo de ecommerce.

Tu tarea: a partir del nombre o idea del producto y las palabras clave que te den, genera UN SOLO nombre de producto.

Reglas estrictas:
- El resultado debe ser el nombre literal del producto, no un título publicitario ni un eslogan.
- Descripción corta: máximo 60-80 caracteres. Claro y directo.
- Incluye lo esencial: tipo de producto, material o característica principal si aplica (ej: "Anillo de plata con diamante", "Collar de oro 18K", "Pulsera de cuero marrón").
- Usa las palabras clave proporcionadas para ser preciso.
- Sin emojis. Sin comillas. Sin puntos finales. Sin explicaciones.
- Idioma: el mismo que use el usuario en su mensaje.

Responde ÚNICAMENTE con el nombre del producto, nada más.`;
  }
  // Descripción corta del producto para ficha de catálogo
  if (type === 'description') {
    return `Eres un asistente que genera la DESCRIPCIÓN CORTA de un producto para un catálogo de ecommerce.

Tu tarea: a partir del nombre o idea del producto y las palabras clave que te den, genera una descripción breve.

Reglas estrictas:
- Descripción corta: 1 a 3 frases (máximo unas 150-200 caracteres). No párrafos largos.
- Destaca material, características principales y uso u ocasión si aplica.
- Tono neutro e informativo, apropiado para ficha de producto.
- Sin emojis. Sin hashtags. Sin llamados a la acción tipo "¡Compra ya!".
- Idioma: el mismo que use el usuario en su mensaje.

Responde ÚNICAMENTE con la descripción corta, nada más.`;
  }
  if (type === 'hashtags') {
    return 'Eres un experto en marketing digital y SEO para redes sociales. Genera hashtags relevantes, populares y estratégicos para posts de Instagram y Facebook. Los hashtags deben ser:\n- Relevantes al tipo de producto presentado\n- Populares y utilizados frecuentemente en redes sociales\n- Entre 10-15 hashtags\n- Mezcla de hashtags generales y específicos\n- Sin el símbolo # (solo el texto del hashtag)\n- Separados por espacios\n- Adaptados al tipo de producto\n\nResponde SOLO con los hashtags separados por espacios, sin el símbolo #, sin explicaciones adicionales.';
  }
  return '';
}

function getMaxTokens(type) {
  if (type === 'title') return 80;
  if (type === 'hashtags') return 200;
  return 400;
}

/**
 * POST /api/grok/generate
 * Body: { prompt: string, type?: 'title' | 'description' | 'hashtags' }
 * Response: { content: string } | { error: string, ... }
 */
export async function generateHandler(req, res) {
  try {
    const { prompt, type } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt es requerido' });
    }

    const apiKey =
      process.env.GROQ_API_KEY ||
      process.env.GROK_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY no configurada' });
    }

    const systemPrompt = getSystemPrompt(type || 'description');
    if (!systemPrompt) {
      return res.status(400).json({ error: 'Tipo no válido (title, description, hashtags)' });
    }

    let lastError = null;
    let response = null;
    let data = null;

    for (const model of MODELS) {
      try {
        response = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: 0.7,
            max_tokens: getMaxTokens(type),
          }),
        });

        if (response.ok) {
          data = await response.json();
          break;
        }
        const errorText = await response.text();
        lastError = { model, status: response.status, error: errorText };
      } catch (err) {
        lastError = { model, error: err instanceof Error ? err.message : String(err) };
      }
    }

    if (!response || !response.ok || !data) {
      let errorMessage = 'Error al generar contenido con Groq';
      let errorDetails = lastError?.error ?? 'No se pudo conectar con la API';

      if (lastError?.error && typeof lastError.error === 'string') {
        try {
          const errorJson = JSON.parse(lastError.error);
          const msg = errorJson.error?.message ?? errorJson.message ?? errorJson.error;
          if (
            (typeof msg === 'string' && (
              msg.includes('API key') ||
              msg.includes('Incorrect API key')
            ))
          ) {
            errorMessage = 'La API key de Groq es incorrecta o inválida. Verifica en https://console.groq.com y actualiza GROQ_API_KEY en .env';
          } else {
            errorMessage = msg || errorMessage;
          }
          errorDetails = errorJson;
        } catch {
          errorDetails = lastError.error;
        }
      }

      return res.status(lastError?.status || 500).json({
        error: errorMessage,
        details: errorDetails,
        triedModels: MODELS,
        help: 'Verifica tu API key en https://console.groq.com',
      });
    }

    const generatedText = (data.choices?.[0]?.message?.content ?? '').trim();

    if (!generatedText) {
      return res.status(500).json({ error: 'No se pudo generar el contenido' });
    }

    return res.json({ content: generatedText });
  } catch (error) {
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
