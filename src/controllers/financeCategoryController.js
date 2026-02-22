/**
 * Controlador de categorías financieras (income_categories / expense_categories)
 */

import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../services/financeCategoryService.js';
import { getUserStoreById } from '../services/storeService.js';

async function checkStoreAccess(req, res) {
  const userId = req.user.id;
  const storeId = req.query.storeId || req.body.storeId;
  if (!storeId) {
    res.status(400).json({ success: false, error: 'storeId es requerido' });
    return null;
  }
  const store = await getUserStoreById(storeId, userId);
  if (!store) {
    res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    return null;
  }
  return storeId;
}

function makeHandlers(type) {
  return {
    async list(req, res, next) {
      try {
        const storeId = await checkStoreAccess(req, res);
        if (!storeId) return;
        const categories = await getCategories(type, storeId);
        return res.json({ success: true, categories });
      } catch (error) {
        next(error);
      }
    },
    async getById(req, res, next) {
      try {
        const category = await getCategoryById(type, req.params.id);
        if (!category) return res.status(404).json({ success: false, error: 'Categoría no encontrada' });
        return res.json({ success: true, category });
      } catch (error) {
        next(error);
      }
    },
    async create(req, res, next) {
      try {
        const storeId = await checkStoreAccess(req, res);
        if (!storeId) return;
        const { name, description, color } = req.body;
        if (!name || !name.trim()) {
          return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }
        const category = await createCategory(type, { storeId, name, description, color });
        return res.status(201).json({ success: true, category });
      } catch (error) {
        if (error.message?.includes('Ya existe')) {
          return res.status(409).json({ success: false, error: error.message });
        }
        next(error);
      }
    },
    async update(req, res, next) {
      try {
        const { name, description, color } = req.body;
        const category = await updateCategory(type, req.params.id, { name, description, color });
        if (!category) return res.status(404).json({ success: false, error: 'Categoría no encontrada' });
        return res.json({ success: true, category });
      } catch (error) {
        next(error);
      }
    },
    async remove(req, res, next) {
      try {
        await deleteCategory(type, req.params.id);
        return res.json({ success: true });
      } catch (error) {
        next(error);
      }
    },
  };
}

export const incomeHandlers = makeHandlers('income');
export const expenseHandlers = makeHandlers('expense');
