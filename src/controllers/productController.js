/**
 * Controlador de productos
 * Maneja las peticiones HTTP y delega la lógica de negocio a los servicios
 */

import {
  getProductsByStore,
  getProductsByStoreAdmin,
  getProductById,
  getProductByIdPublic,
  createProduct,
  updateProduct,
  deleteProduct,
  getRecentProducts,
  setProductOutOfStock,
  reorderProductsByStore,
  moveProductOrder,
} from '../services/productService.js';
import { getUserStoreById } from '../services/storeService.js';

/**
 * Obtener productos más recientes (público, sin autenticación)
 */
export async function getRecentProductsHandler(req, res, next) {
  try {
    // Esta ruta es pública, no requiere autenticación
    const { limit, offset, search, categoryId, minPrice, maxPrice } = req.query;

    const result = await getRecentProducts({
      limit: limit ? parseInt(limit) : 20,
      offset: offset ? parseInt(offset) : 0,
      search: search || undefined,
      categoryId: categoryId && String(categoryId).trim() ? String(categoryId).trim() : undefined,
      minPrice: minPrice != null && minPrice !== '' ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice != null && maxPrice !== '' ? parseFloat(maxPrice) : undefined,
    });

    res.json({
      success: true,
      products: result.products,
      count: result.products.length,
      total: result.total,
    });
  } catch (error) {
    console.error('Error en getRecentProductsHandler:', error);
    next(error);
  }
}

/**
 * Obtener productos de una tienda (público, sin autenticación)
 */
export async function getStoreProductsPublicHandler(req, res, next) {
  try {
    const { storeId } = req.params;
    const { limit, offset, search, categoryId, minPrice, maxPrice } = req.query;

    const result = await getProductsByStore(storeId, {
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      search: search || undefined,
      categoryId: categoryId && String(categoryId).trim() ? String(categoryId).trim() : undefined,
      minPrice: minPrice != null && minPrice !== '' ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice != null && maxPrice !== '' ? parseFloat(maxPrice) : undefined,
    });

    res.json({
      success: true,
      products: result.products,
      count: result.products.length,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtener un producto por ID (público, sin autenticación)
 */
export async function getProductPublicHandler(req, res, next) {
  try {
    const { id } = req.params;

    const product = await getProductByIdPublic(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado',
      });
    }

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtener todos los productos de las tiendas del usuario
 * Si el usuario es admin, puede ver productos de todas las tiendas (storeId es opcional)
 */
export async function getProductsAdminHandler(req, res, next) {
  try {
    const { storeId, categoryId, limit, offset, search, minPrice, maxPrice } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Falta indicar la tienda.',
      });
    }

    const result = await getProductsByStoreAdmin(storeId, {
      categoryId: categoryId || undefined,
      search: search && String(search).trim() ? String(search).trim() : undefined,
      minPrice: minPrice != null && minPrice !== '' ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice != null && maxPrice !== '' ? parseFloat(maxPrice) : undefined,
      limit: limit != null && limit !== '' ? parseInt(limit, 10) : 20,
      offset: offset != null && offset !== '' ? Math.max(0, parseInt(offset, 10)) : 0,
    });

    res.json({
      success: true,
      products: result.products,
      count: result.products.length,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtener todos los productos de las tiendas del usuario
 * Si el usuario es admin, puede ver productos de todas las tiendas (storeId es opcional)
 */
export async function getProducts(req, res, next) {
  try {
    const { storeId, categoryId, limit, offset, search } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Falta indicar la tienda.',
      });
    }

    const result = await getProductsByStore(storeId, {
      categoryId: categoryId || undefined,
      search: search && String(search).trim() ? String(search).trim() : undefined,
      limit: limit != null && limit !== '' ? parseInt(limit, 10) : 20,
      offset: offset != null && offset !== '' ? Math.max(0, parseInt(offset, 10)) : 0,
    });

    res.json({
      success: true,
      products: result.products,
      count: result.products.length,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtener un producto específico
 */
export async function getProduct(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Falta indicar la tienda.',
      });
    }

    const product = await getProductById(id, storeId);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado o no tienes acceso a él',
      });
    }

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Crear un nuevo producto
 */
export async function createProductHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      name,
      description,
      basePrice,
      currency,
      stock,
      sku,
      categoryId,
      storeId,
      images,
      attributes,
      combinations,
      rating,
      reviewCount,
      tags,
      visibleInStore,
      hidePrice,
      iva,
    } = req.body;

    if (!name || !categoryId || !storeId) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos obligatorios: nombre del producto, categoría y tienda.',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const basePriceNum = basePrice != null && basePrice !== '' ? parseFloat(basePrice) : 0;

    const product = await createProduct({
      name,
      description: description || null,
      base_price: Number.isNaN(basePriceNum) ? 0 : basePriceNum,
      currency: currency || 'USD',
      stock: parseInt(stock) || 0,
      sku: (sku && String(sku).trim()) ? String(sku).trim() : null,
      category_id: categoryId,
      store_id: storeId,
      created_by: userId,
      images: images || [],
      attributes: attributes || [],
      combinations: combinations || [],
      rating: rating ? parseFloat(rating) : null,
      review_count: reviewCount || 0,
      tags: tags || [],
      visible_in_store: visibleInStore === true || visibleInStore === 'true',
      hide_price: hidePrice === true || hidePrice === 'true',
      sort_order: typeof req.body.sortOrder === 'number' ? req.body.sortOrder : (req.body.sortOrder != null && !Number.isNaN(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : null),
      iva: iva != null && iva !== '' && !Number.isNaN(parseFloat(iva)) ? parseFloat(iva) : undefined,
    });

    res.status(201).json({
      success: true,
      product,
    });
  } catch (error) {
    // Manejar error de SKU duplicado
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'El SKU ya existe para esta tienda',
      });
    }
    // Manejar error de categoría no válida
    if (error.message && error.message.includes('categoría no pertenece')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Actualizar un producto
 * Solo permite editar productos si el usuario es miembro de la tienda o admin
 */
export async function updateProductHandler(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { storeId, ...updates } = req.body;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Falta indicar la tienda.',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    // Convertir campos del frontend a formato de base de datos
    const dbUpdates = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.basePrice !== undefined) {
      const basePriceNum = parseFloat(updates.basePrice);
      dbUpdates.base_price = Number.isNaN(basePriceNum) ? 0 : basePriceNum;
    }
    if (updates.currency !== undefined) dbUpdates.currency = updates.currency;
    if (updates.stock !== undefined) dbUpdates.stock = parseInt(updates.stock);
    if (updates.sku !== undefined) dbUpdates.sku = updates.sku;
    if (updates.categoryId !== undefined) dbUpdates.category_id = updates.categoryId;
    if (updates.images !== undefined) dbUpdates.images = updates.images;
    if (updates.attributes !== undefined) dbUpdates.attributes = updates.attributes;
    if (updates.combinations !== undefined) dbUpdates.combinations = updates.combinations;
    if (updates.rating !== undefined) dbUpdates.rating = updates.rating ? parseFloat(updates.rating) : null;
    if (updates.reviewCount !== undefined) dbUpdates.review_count = parseInt(updates.reviewCount);
    if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
    if (updates.visibleInStore !== undefined) {
      dbUpdates.visible_in_store = updates.visibleInStore === true || updates.visibleInStore === 'true';
    }
    if (updates.hidePrice !== undefined) {
      dbUpdates.hide_price = updates.hidePrice === true || updates.hidePrice === 'true';
    }
    if (updates.sortOrder !== undefined) {
      const v = updates.sortOrder;
      dbUpdates.sort_order = v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v);
    }
    if (updates.iva !== undefined) {
      const v = updates.iva;
      dbUpdates.iva = v != null && v !== '' && !Number.isNaN(parseFloat(v)) ? Math.max(0, Math.min(100, parseFloat(v))) : 0;
    }

    const product = await updateProduct(id, storeId, dbUpdates);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado o no tienes acceso a él',
      });
    }

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'El SKU ya existe para esta tienda',
      });
    }
    // Manejar error de categoría no válida
    if (error.message && error.message.includes('categoría no pertenece')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Eliminar un producto
 * Solo permite eliminar productos si el usuario es miembro de la tienda o admin
 */
export async function deleteProductHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId } = req.query;
    const userId = req.user.id;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Falta indicar la tienda.',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const deleted = await deleteProduct(id, storeId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado o no tienes acceso a él',
      });
    }

    res.json({
      success: true,
      message: 'Producto eliminado exitosamente',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Poner el stock de un producto en 0
 * Solo permite poner productos fuera de stock si el usuario es miembro de la tienda o admin
 */
export async function outStockHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId } = req.query;
    const userId = req.user.id;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Falta indicar la tienda.',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const product = await setProductOutOfStock(id, storeId);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado o no tienes acceso a él',
      });
    }

    res.json({
      success: true,
      product,
      message: 'Stock del producto actualizado a 0',
    });
  } catch (error) {
    if (error.message && error.message.includes('no encontrado')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Reordenar productos de una tienda.
 * Body (opción 1): { storeId, productIds: string[] } — orden completo (índice 0 = primero).
 * Body (opción 2): { storeId, productId, direction: 'up'|'down' } — mover un producto un lugar.
 * Solo permite reordenar si el usuario es miembro de la tienda o admin.
 */
export async function reorderProductsHandler(req, res, next) {
  try {
    const { storeId, productIds, productId, direction } = req.body;
    const userId = req.user.id;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere storeId.',
      });
    }

    const storeCheck = await getUserStoreById(storeId, userId);
    if (!storeCheck) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    let updated = 0;
    if (Array.isArray(productIds) && productIds.length > 0) {
      const result = await reorderProductsByStore(storeId, productIds);
      updated = result.updated;
    } else if (productId && (direction === 'up' || direction === 'down')) {
      const result = await moveProductOrder(storeId, productId, direction);
      updated = result.updated;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Se requieren productIds (array) o productId y direction ("up" | "down").',
      });
    }

    res.json({
      success: true,
      updated,
      message: updated > 0 ? `Orden actualizado` : 'Sin cambios',
    });
  } catch (error) {
    next(error);
  }
}
