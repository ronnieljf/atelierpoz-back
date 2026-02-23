/**
 * Controlador para posts
 */

import * as postService from '../services/postService.js';

/** Normaliza hashtags: máx 5, cortos, sin saltos de línea. Devuelve array con # (ej: ["#moda", "#estilo"]). */
function normalizeHashtags(hashtags) {
  if (Array.isArray(hashtags)) {
    return hashtags
      .slice(0, 5)
      .map((t) => String(t).replace(/^#/, '').trim().slice(0, 30))
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));
  }
  if (typeof hashtags !== 'string') return [];
  const tags = hashtags
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((t) => t.replace(/^#/, '').trim().slice(0, 30))
    .filter(Boolean);
  return tags.slice(0, 5).map((t) => `#${t}`);
}
import * as metaService from '../services/metaService.js';
import * as metaIntegrationService from '../services/metaIntegrationService.js';
import * as storeService from '../services/storeService.js';
import * as uploadService from '../services/uploadService.js';
import { query } from '../config/database.js';

/**
 * Obtener todos los posts del usuario autenticado
 */
export async function getPostsHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const storeId = req.query.storeId; // Opcional: filtrar por tienda
    
    let posts;
    if (storeId) {
      const store = await storeService.getUserStoreById(storeId, userId);
      if (!store) {
        return res.status(403).json({
          success: false,
          error: 'No tienes acceso a esta tienda',
        });
      }
      posts = await postService.getPostsByStore(storeId);
    } else {
      posts = await postService.getPostsByUser(userId);
    }
    
    res.json({
      success: true,
      data: { posts },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtener un post por ID
 */
export async function getPostByIdHandler(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const post = await postService.getPostById(id, userId);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post no encontrado',
      });
    }
    
    res.json({
      success: true,
      data: { post },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Crear un nuevo post
 */
export async function createPostHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { title, description, hashtags, images, selectedProducts, platform, status, scheduledAt, storeId } = req.body;
    
    // Validaciones
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El título es requerido',
      });
    }
    
    if (!selectedProducts || !Array.isArray(selectedProducts) || selectedProducts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debes seleccionar al menos un producto',
      });
    }
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debes seleccionar al menos una imagen',
      });
    }
    
    // Validar que la tienda pertenezca al usuario (vía store_users, no solo created_by)
    let finalStoreId = storeId;
    if (storeId) {
      const store = await storeService.getUserStoreById(storeId, userId);
      if (!store) {
        return res.status(403).json({
          success: false,
          error: 'No tienes acceso a esta tienda',
        });
      }
    } else {
      const userStores = await storeService.getUserStores(userId);
      const activeStores = userStores.filter(s => s.state === 'active');
      if (activeStores.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Debes tener al menos una tienda para crear posts',
        });
      }
      finalStoreId = activeStores[0].id;
    }
    
    // Procesar hashtags: máx 5, cortos, sin saltos de línea
    const hashtagsArray = normalizeHashtags(hashtags);

    const postData = {
      title: title.trim(),
      description: description?.trim() || null,
      hashtags: hashtagsArray,
      images,
      selectedProducts,
      platform: platform || 'instagram',
      status: status || 'draft',
      scheduledAt: scheduledAt || null,
    };
    
    const post = await postService.createPost(postData, userId, finalStoreId);
    
    // Publicación automática en Instagram deshabilitada por ahora
    // Solo se guarda el post en la base de datos
    
    res.status(201).json({
      success: true,
      data: { post },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Actualizar un post
 */
export async function updatePostHandler(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { title, description, hashtags, images, selectedProducts, platform, status, scheduledAt } = req.body;
    
    // Verificar que el post exista y pertenezca al usuario
    const existingPost = await postService.getPostById(id, userId);
    if (!existingPost) {
      return res.status(404).json({
        success: false,
        error: 'Post no encontrado',
      });
    }
    
    // Procesar hashtags: máx 5, cortos, sin saltos de línea
    let hashtagsArray = existingPost.hashtags;
    if (hashtags !== undefined) {
      hashtagsArray = normalizeHashtags(hashtags);
    }
    
    const postData = {};
    if (title !== undefined) postData.title = title.trim();
    if (description !== undefined) postData.description = description?.trim() || null;
    if (hashtags !== undefined) postData.hashtags = hashtagsArray;
    if (images !== undefined) postData.images = images;
    if (selectedProducts !== undefined) postData.selectedProducts = selectedProducts;
    if (platform !== undefined) postData.platform = platform;
    if (status !== undefined) postData.status = status;
    if (scheduledAt !== undefined) postData.scheduledAt = scheduledAt;
    
    const post = await postService.updatePost(id, postData, userId);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post no encontrado',
      });
    }
    
    // Publicación automática en Instagram deshabilitada por ahora
    // Solo se actualiza el post en la base de datos
    
    res.json({
      success: true,
      data: { post },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Eliminar un post
 */
export async function deletePostHandler(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const deleted = await postService.deletePost(id, userId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Post no encontrado',
      });
    }
    
    res.json({
      success: true,
      message: 'Post eliminado exitosamente',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Publicar un post en Instagram
 * POST /api/posts/:id/publish
 */
export async function publishPostHandler(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const post = await postService.getPostById(id, userId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post no encontrado',
      });
    }

    if (post.status === 'published') {
      return res.status(400).json({
        success: false,
        error: 'Este post ya fue publicado en Instagram',
      });
    }

    if (!post.images || post.images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El post debe tener al menos una imagen para publicar en Instagram',
      });
    }

    const imageUrls = post.images.filter(
      (img) => typeof img === 'string' && (img.startsWith('http://') || img.startsWith('https://'))
    );
    if (imageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Las imágenes del post deben ser URLs públicas (https). Las imágenes en base64 no pueden publicarse en Instagram. Sube imágenes desde la tienda que usen almacenamiento en la nube (R2).',
      });
    }

    const integration = await metaIntegrationService.getMetaIntegrationByUser(userId);
    if (!integration) {
      return res.status(400).json({
        success: false,
        error: 'Conecta tu cuenta de Instagram primero desde la sección de arriba',
      });
    }

    if (integration.expiresAt && new Date(integration.expiresAt) < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'La conexión con Instagram ha expirado. Desconecta y vuelve a conectar tu cuenta',
      });
    }

    const captionParts = [
      post.title,
      post.description || '',
      Array.isArray(post.hashtags) ? post.hashtags.join(' ') : (post.hashtags || ''),
    ].filter(Boolean);
    const caption = captionParts.join('\n\n').trim().slice(0, 2200);

    // Ajustar cada imagen al formato 4:5 de Instagram (1080x1350) con padding para evitar recortes
    const imageUrlsForInstagram = [];
    for (const url of imageUrls) {
      try {
        const fittedUrl = await uploadService.fitAndUploadForInstagram(url);
        imageUrlsForInstagram.push(fittedUrl);
      } catch (err) {
        console.warn('[posts:publish] No se pudo ajustar imagen para Instagram, se usa original:', err?.message || err);
        imageUrlsForInstagram.push(url);
      }
    }

    const result = await metaService.publishPostToInstagram(
      {
        imageUrls: imageUrlsForInstagram,
        caption: caption || post.title,
      },
      integration.instagramAccountId,
      integration.accessToken
    );

    await postService.updatePost(id, { status: 'published' }, userId);

    res.json({
      success: true,
      message: 'Post publicado en Instagram correctamente',
      data: {
        instagramMediaId: result.instagramMediaId,
      },
    });
  } catch (error) {
    next(error);
  }
}
