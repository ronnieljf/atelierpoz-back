/**
 * Controlador de categorías (globales y por tienda)
 * Maneja las peticiones HTTP y delega la lógica de negocio a los servicios
 */

import {
  getAllCategories,
  getCategoriesByStoreId,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../services/categoryService.js';
import { getUserStoreById } from '../services/storeService.js';

function checkStoreAccess(req, storeId) {
  const userId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';
  if (isAdmin) return Promise.resolve(true);
  if (!userId) return Promise.resolve(false);
  return getUserStoreById(storeId, userId).then((store) => !!store);
}

/**
 * GET /api/categories — Obtener todas las categorías (público)
 */
export async function getCategories(req, res, next) {
  try {
    const categories = await getAllCategories();
    res.json({
      success: true,
      categories,
      count: categories.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/categories/by-store?storeId= — Solo categorías creadas por la tienda (auth + acceso)
 */
export async function getCategoriesByStoreHandler(req, res, next) {
  try {
    const { storeId } = req.query;
    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'storeId es requerido',
      });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }
    const categories = await getCategoriesByStoreId(storeId);
    res.json({
      success: true,
      categories,
      count: categories.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtener una categoría por ID
 */
export async function getCategory(req, res, next) {
  try {
    const { id } = req.params;

    const category = await getCategoryById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Categoría no encontrada',
      });
    }

    res.json({
      success: true,
      category,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Crear una nueva categoría (asociada a una tienda; requiere acceso a la tienda)
 * Body: { name, slug?, storeId } — slug opcional, se puede derivar del nombre
 */
export async function createCategoryHandler(req, res, next) {
  try {
    const { name, slug, storeId, store_id } = req.body;
    const storeIdVal = storeId ?? store_id;
    if (!name || !storeIdVal) {
      return res.status(400).json({
        success: false,
        error: 'Campos requeridos: name, storeId',
      });
    }
    const hasAccess = await checkStoreAccess(req, storeIdVal);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }
    const slugVal = (slug && String(slug).trim()) || String(name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const category = await createCategory({ name: name.trim(), slug: slugVal, store_id: storeIdVal });

    res.status(201).json({
      success: true,
      category,
    });
  } catch (error) {
    if (error.code === '23505' || error.code === 'DUPLICATE_SLUG_IN_STORE') {
      return res.status(409).json({
        success: false,
        error: 'El slug ya existe en esta tienda. Usa otro nombre.',
      });
    }
    next(error);
  }
}

/**
 * Actualizar una categoría (solo si pertenece a una tienda a la que el usuario tiene acceso)
 */
export async function updateCategoryHandler(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await getCategoryById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Categoría no encontrada',
      });
    }
    if (existing.store_id) {
      const hasAccess = await checkStoreAccess(req, existing.store_id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'No tienes acceso a esta categoría',
        });
      }
    } else {
      const isAdmin = req.user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Solo un administrador puede editar categorías globales',
        });
      }
    }
    const { name, slug, store_id } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (slug !== undefined) updates.slug = slug;
    if (store_id !== undefined) updates.store_id = store_id;

    const category = await updateCategory(id, updates);

    res.json({
      success: true,
      category,
    });
  } catch (error) {
    if (error.code === '23505' || error.code === 'DUPLICATE_SLUG_IN_STORE') {
      return res.status(409).json({
        success: false,
        error: 'El slug ya existe en esta tienda. Usa otro nombre.',
      });
    }
    next(error);
  }
}

/**
 * Eliminar una categoría (solo si pertenece a una tienda a la que el usuario tiene acceso)
 */
export async function deleteCategoryHandler(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await getCategoryById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Categoría no encontrada',
      });
    }
    if (existing.store_id) {
      const hasAccess = await checkStoreAccess(req, existing.store_id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'No tienes acceso a esta categoría',
        });
      }
    } else {
      const isAdmin = req.user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Solo un administrador puede eliminar categorías globales',
        });
      }
    }
    const deleted = await deleteCategory(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Categoría no encontrada',
      });
    }
    res.json({
      success: true,
      message: 'Categoría eliminada exitosamente',
    });
  } catch (error) {
    if (error.code === '23511') {
      return res.status(409).json({
        success: false,
        error: 'No se puede eliminar: hay productos asignados a esta categoría',
      });
    }
    next(error);
  }
}
