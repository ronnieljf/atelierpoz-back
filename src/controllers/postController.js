/**
 * Controlador para posts
 */

import * as postService from '../services/postService.js';
import * as metaService from '../services/metaService.js';
import * as metaIntegrationService from '../services/metaIntegrationService.js';
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
      posts = await postService.getPostsByStore(storeId);
      // Verificar que la tienda pertenezca al usuario
      const storeResult = await query(
        'SELECT id FROM stores WHERE id = $1 AND created_by = $2',
        [storeId, userId]
      );
      
      if (storeResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'No tienes acceso a esta tienda',
        });
      }
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
    
    // Validar que la tienda pertenezca al usuario si se proporciona
    let finalStoreId = storeId;
    if (storeId) {
      const storeResult = await query(
        'SELECT id FROM stores WHERE id = $1 AND created_by = $2',
        [storeId, userId]
      );
      
      if (storeResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'No tienes acceso a esta tienda',
        });
      }
    } else {
      // Si no se proporciona storeId, usar la primera tienda del usuario
      const storeResult = await query(
        'SELECT id FROM stores WHERE created_by = $1 LIMIT 1',
        [userId]
      );
      
      if (storeResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Debes tener al menos una tienda para crear posts',
        });
      }
      
      finalStoreId = storeResult.rows[0].id;
    }
    
    // Procesar hashtags
    const hashtagsArray = Array.isArray(hashtags)
      ? hashtags
      : typeof hashtags === 'string'
      ? hashtags.split(' ').filter(tag => tag.trim()).map(tag => {
          const trimmed = tag.trim();
          return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
        })
      : [];
    
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
    
    // Procesar hashtags si se proporcionan
    let hashtagsArray = existingPost.hashtags;
    if (hashtags !== undefined) {
      hashtagsArray = Array.isArray(hashtags)
        ? hashtags
        : typeof hashtags === 'string'
        ? hashtags.split(' ').filter(tag => tag.trim()).map(tag => {
            const trimmed = tag.trim();
            return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
          })
        : [];
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
