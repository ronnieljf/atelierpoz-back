/**
 * Servicio para interactuar con Meta/Instagram Graph API
 */

/**
 * Obtener URL de autorización OAuth de Meta
 * @param {string} redirectUri - URI de redirección después de la autorización
 * @param {string} state - Estado para prevenir CSRF
 * @returns {string} URL de autorización
 */
export function getMetaAuthUrl(redirectUri, state) {
  const appId = process.env.META_APP_ID || '898273202701987';
  const scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
  ].join(',');

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: 'code',
    state: state,
  });

  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

/**
 * Intercambiar código de autorización por access token
 * @param {string} code - Código de autorización recibido del callback
 * @param {string} redirectUri - URI de redirección usado en la autorización
 * @returns {Promise<Object>} Objeto con access_token, token_type, expires_in
 */
export async function exchangeCodeForToken(code, redirectUri) {
  const appId = process.env.META_APP_ID || '1715688306457682';
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    throw new Error('META_APP_SECRET no está configurado en las variables de entorno');
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code: code,
  });

  const response = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error al obtener token: ${error.error?.message || 'Error desconocido'}`);
  }

  return await response.json();
}

/**
 * Obtener token de larga duración (60 días)
 * @param {string} shortLivedToken - Token de corta duración
 * @returns {Promise<Object>} Objeto con access_token y expires_in
 */
export async function getLongLivedToken(shortLivedToken) {
  const appId = process.env.META_APP_ID || '898273202701987';
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    throw new Error('META_APP_SECRET no está configurado en las variables de entorno');
  }

  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const response = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error al obtener token de larga duración: ${error.error?.message || 'Error desconocido'}`);
  }

  return await response.json();
}

/**
 * Obtener páginas de Facebook del usuario
 * @param {string} accessToken - Token de acceso de Facebook
 * @returns {Promise<Array>} Array de páginas con sus IDs de Instagram
 */
export async function getUserPages(accessToken) {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}&fields=id,name,instagram_business_account{id,username}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error al obtener páginas: ${error.error?.message || 'Error desconocido'}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Obtener cuenta de Instagram Business asociada a una página
 * @param {string} pageId - ID de la página de Facebook
 * @param {string} accessToken - Token de acceso de Facebook
 * @returns {Promise<Object|null>} Objeto con información de la cuenta de Instagram o null
 */
export async function getInstagramAccount(pageId, accessToken) {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account{id,username}&access_token=${accessToken}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error al obtener cuenta de Instagram: ${error.error?.message || 'Error desconocido'}`);
  }

  const data = await response.json();
  return data.instagram_business_account || null;
}

/**
 * Subir imagen a Instagram (crear contenedor de media)
 * @param {string} imageUrl - URL pública de la imagen
 * @param {string} caption - Descripción/caption del post
 * @param {string} instagramAccountId - ID de la cuenta de Instagram Business
 * @param {string} accessToken - Token de acceso de la página
 * @returns {Promise<string>} ID del contenedor de media creado
 */
export async function createMediaContainer(imageUrl, caption, instagramAccountId, accessToken) {
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption: caption,
    access_token: accessToken,
  });

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${instagramAccountId}/media?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error al crear contenedor de media: ${error.error?.message || 'Error desconocido'}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Publicar contenido en Instagram
 * @param {string} creationId - ID del contenedor de media creado
 * @param {string} instagramAccountId - ID de la cuenta de Instagram Business
 * @param {string} accessToken - Token de acceso de la página
 * @returns {Promise<Object>} Objeto con el ID del post publicado
 */
export async function publishToInstagram(creationId, instagramAccountId, accessToken) {
  const params = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
  });

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${instagramAccountId}/media_publish?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error al publicar en Instagram: ${error.error?.message || 'Error desconocido'}`);
  }

  return await response.json();
}

/**
 * Publicar un post completo en Instagram
 * @param {Object} postData - Datos del post
 * @param {string} postData.imageUrl - URL pública de la imagen
 * @param {string} postData.caption - Caption del post (puede incluir hashtags)
 * @param {string} instagramAccountId - ID de la cuenta de Instagram Business
 * @param {string} accessToken - Token de acceso de la página
 * @returns {Promise<Object>} Objeto con el ID del post publicado en Instagram
 */
export async function publishPostToInstagram(postData, instagramAccountId, accessToken) {
  const { imageUrl, caption } = postData;

  // Paso 1: Crear contenedor de media
  const creationId = await createMediaContainer(imageUrl, caption, instagramAccountId, accessToken);

  // Paso 2: Esperar un momento para que Instagram procese el contenedor
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Paso 3: Publicar el contenido
  const result = await publishToInstagram(creationId, instagramAccountId, accessToken);

  return {
    instagramMediaId: result.id,
    creationId,
  };
}

/**
 * Verificar si un token de acceso es válido
 * @param {string} accessToken - Token de acceso a verificar
 * @returns {Promise<Object>} Información del token o error
 */
export async function verifyToken(accessToken) {
  const params = new URLSearchParams({
    input_token: accessToken,
    access_token: accessToken,
  });

  const response = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error al verificar token: ${error.error?.message || 'Error desconocido'}`);
  }

  return await response.json();
}
