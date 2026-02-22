/**
 * Controlador de tiendas
 * Maneja las peticiones HTTP y delega la lógica de negocio a los servicios
 */

import { getUserStores, getUserStoreById, getAllActiveStores, getStoreByIdPublic, getStoreFeatureSendReminderReceivablesWhatsapp, createStore, updateStore, userHasStoreAsCreator, getUserStoreCountAsCreator, getUserStoreLimit, isStoreCreator, findUserByEmail, addUserToStore, userExistsInStore, updateUserPhoneNumber, getStoreUsers, removeUserFromStore } from '../services/storeService.js';
import { assignAllPermissionsToUser } from '../services/permissionService.js';
import { getUserPermissionCodesForStore, setUserPermissions, getAllPermissions } from '../services/permissionService.js';
import { getCategoriesByStoreId } from '../services/categoryService.js';
import { uploadFile } from '../services/uploadService.js';

/**
 * Obtener todas las tiendas activas (público, sin autenticación)
 */
export async function getAllStoresPublic(req, res, next) {
  try {
    const stores = await getAllActiveStores();

    res.json({
      success: true,
      stores,
      count: stores.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtener categorías de una tienda (público, para filtros en la página de la tienda)
 */
export async function getStoreCategoriesHandler(req, res, next) {
  try {
    const { id } = req.params;
    const categories = await getCategoriesByStoreId(id);
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
 * Obtener una tienda por ID (público, sin autenticación)
 */
export async function getStoreByIdPublicHandler(req, res, next) {
  try {
    const { id } = req.params;

    const store = await getStoreByIdPublic(id);

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Tienda no encontrada',
      });
    }

    res.json({
      success: true,
      store,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Verificar si una tienda tiene activa la función de recordatorio de cobranzas por WhatsApp (público)
 * GET /api/stores/public/:id/feature-send-reminder-receivables-whatsapp
 */
export async function getStoreFeatureSendReminderReceivablesWhatsappHandler(req, res, next) {
  try {
    const { id } = req.params;
    const result = await getStoreFeatureSendReminderReceivablesWhatsapp(id);

    if (result === null) {
      return res.status(404).json({
        success: false,
        error: 'Tienda no encontrada',
      });
    }

    res.json({
      success: true,
      enabled: result.enabled,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtener todas las tiendas del usuario actual
 */
export async function getStores(req, res, next) {
  try {
    const userId = req.user.id;

    const [stores, storeCount, storeLimit] = await Promise.all([
      getUserStores(userId),
      getUserStoreCountAsCreator(userId),
      getUserStoreLimit(userId),
    ]);

    res.json({
      success: true,
      stores,
      count: stores.length,
      storeLimit,
      storeCountAsCreator: storeCount,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtener una tienda específica del usuario actual
 */
export async function getStoreById(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const store = await getUserStoreById(id, userId);

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Tienda no encontrada o no tienes acceso a ella',
      });
    }

    res.json({
      success: true,
      store,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Actualizar una tienda
 */
export async function updateStoreHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { name, state, store_id, instagram, tiktok, description, location, iva } = req.body;
    const userId = req.user.id;

    const userStore = await getUserStoreById(id, userId);
    if (!userStore) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para editar esta tienda',
      });
    }
    if (!userStore.is_creator) {
      return res.status(403).json({
        success: false,
        error: 'Solo el creador de la tienda puede editarla',
      });
    }

    // Validaciones
    if (name !== undefined && name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El nombre de la tienda no puede estar vacío',
      });
    }

    if (state !== undefined && !['active', 'inactive'].includes(state)) {
      return res.status(400).json({
        success: false,
        error: 'El estado debe ser "active" o "inactive"',
      });
    }

    // Actualizar tienda usando el servicio
    const store = await updateStore(id, {
      name,
      state,
      store_id,
      instagram,
      tiktok,
      description,
      location,
      iva,
    });

    res.json({
      success: true,
      store,
    });
  } catch (error) {
    // Manejar error de tienda no encontrada
    if (error.message && error.message.includes('no encontrada')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    // Manejar error de instagram o store_id duplicado
    if (error.message && (error.message.includes('Instagram') || error.message.includes('store_id'))) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Crear una nueva tienda
 * Solo puede crear una tienda por usuario
 */
export async function createStoreHandler(req, res, next) {
  try {
    const { name, state, store_id, instagram, tiktok, description, location, iva } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'El nombre de la tienda es requerido',
      });
    }

    if (instagram && instagram.trim()) {
      const instagramRegex = /^[a-zA-Z0-9._]+$/;
      if (!instagramRegex.test(instagram.trim())) {
        return res.status(400).json({
          success: false,
          error: 'El formato del Instagram no es válido. Solo se permiten letras, números, puntos y guiones bajos.',
        });
      }
    }

    if (tiktok && tiktok.trim()) {
      const tiktokRegex = /^[a-zA-Z0-9._]+$/;
      if (!tiktokRegex.test(tiktok.trim())) {
        return res.status(400).json({
          success: false,
          error: 'El formato del TikTok no es válido. Solo se permiten letras, números, puntos y guiones bajos.',
        });
      }
    }

    const [storeCount, storeLimit] = await Promise.all([
      getUserStoreCountAsCreator(userId),
      getUserStoreLimit(userId),
    ]);
    if (storeCount >= storeLimit) {
      return res.status(403).json({
        success: false,
        error: `Has alcanzado el límite de tiendas permitidas (${storeLimit}). Contacta al soporte para aumentar tu plan.`,
      });
    }

    const store = await createStore(
      {
        name,
        state: state || 'active',
        store_id: store_id ? store_id.trim() : undefined,
        instagram: instagram ? instagram.trim() : undefined,
        tiktok: tiktok ? tiktok.trim() : undefined,
        description: description != null ? String(description).trim() || null : null,
        location: location != null ? String(location).trim() || null : null,
        iva: iva != null ? parseFloat(iva) : undefined,
      },
      userId,
      true
    );

    res.status(201).json({
      success: true,
      store,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Agregar un usuario a una tienda por email
 * Solo el creador de la tienda puede agregar usuarios
 */
export async function addUserToStoreHandler(req, res, next) {
  try {
    const { id: storeId } = req.params;
    const { email, isCreator = false } = req.body;
    const userId = req.user.id;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El email del usuario es requerido',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: 'El formato del email no es válido',
      });
    }

    const userIsCreator = await isStoreCreator(storeId, userId);
    if (!userIsCreator) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para agregar usuarios a esta tienda. Solo el creador de la tienda puede hacerlo.',
      });
    }

    // Buscar el usuario por email
    const user = await findUserByEmail(email.trim());
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado con ese email',
      });
    }

    // Verificar que el usuario no esté ya en la tienda
    const userExists = await userExistsInStore(storeId, user.id);
    if (userExists) {
      return res.status(400).json({
        success: false,
        error: 'El usuario ya está agregado a esta tienda',
      });
    }

    // Agregar el usuario a la tienda con el tipo especificado
    const isCreatorFlag = isCreator === true || isCreator === 'true';
    const storeUser = await addUserToStore(storeId, user.id, isCreatorFlag);

    if (storeUser.isCreator) {
      await assignAllPermissionsToUser(storeId, user.id);
    }

    res.status(201).json({
      success: true,
      message: 'Usuario agregado a la tienda exitosamente',
      storeUser: {
        id: storeUser.id,
        userId: storeUser.userId,
        userEmail: user.email,
        userName: user.name,
        isCreator: storeUser.isCreator,
        createdAt: storeUser.createdAt,
      },
    });
  } catch (error) {
    // Manejar errores específicos
    if (error.message && error.message.includes('no encontrada')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message && error.message.includes('ya está agregado')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Eliminar un usuario de una tienda
 * Solo el creador de la tienda puede eliminar usuarios
 */
export async function removeUserFromStoreHandler(req, res, next) {
  try {
    const { id: storeId, userId: userIdToRemove } = req.params;
    const currentUserId = req.user.id;

    const userIsCreator = await isStoreCreator(storeId, currentUserId);
    if (!userIsCreator) {
      return res.status(403).json({
        success: false,
        error: 'Solo el creador de la tienda puede eliminar usuarios',
      });
    }

    await removeUserFromStore(storeId, userIdToRemove);

    res.json({
      success: true,
      message: 'Usuario eliminado de la tienda',
    });
  } catch (error) {
    if (error.message === 'Tienda no encontrada' || error.message === 'El usuario no está en esta tienda') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message === 'No puedes eliminar al único creador de la tienda') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Actualizar el número de teléfono del usuario actual en una tienda específica
 * El usuario solo puede actualizar su propio número de teléfono en tiendas donde está asociado
 */
export async function updateUserPhoneNumberHandler(req, res, next) {
  try {
    const { id: storeId } = req.params;
    const { phoneNumber } = req.body;
    const userId = req.user.id;

    // Validar que el usuario esté en la tienda
    const userExists = await userExistsInStore(storeId, userId);
    if (!userExists) {
      return res.status(403).json({
        success: false,
        error: 'No estás asociado a esta tienda',
      });
    }

    // Validar formato de teléfono (opcional, puede ser null o string)
    if (phoneNumber !== null && phoneNumber !== undefined && phoneNumber.trim() !== '') {
      // Validación básica: solo números, espacios, guiones y paréntesis
      const phoneRegex = /^[\d\s\-\(\)\+]+$/;
      if (!phoneRegex.test(phoneNumber.trim())) {
        return res.status(400).json({
          success: false,
          error: 'El formato del número de teléfono no es válido',
        });
      }

      // Validar longitud máxima
      if (phoneNumber.trim().length > 20) {
        return res.status(400).json({
          success: false,
          error: 'El número de teléfono no puede tener más de 20 caracteres',
        });
      }
    }

    // Actualizar el número de teléfono
    const storeUser = await updateUserPhoneNumber(storeId, userId, phoneNumber?.trim() || null);

    res.json({
      success: true,
      message: 'Número de teléfono actualizado exitosamente',
      storeUser: {
        id: storeUser.id,
        userId: storeUser.userId,
        phoneNumber: storeUser.phoneNumber,
        isCreator: storeUser.isCreator,
        updatedAt: storeUser.updatedAt,
      },
    });
  } catch (error) {
    // Manejar errores específicos
    if (error.message && error.message.includes('no encontrada')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message && error.message.includes('no está asociado')) {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message && error.message.includes('No se pudo actualizar')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Subir y actualizar el logo de una tienda.
 * Solo el creador de la tienda o un admin pueden hacerlo.
 * Body: multipart/form-data con campo "logo" (imagen).
 */
export async function uploadStoreLogoHandler(req, res, next) {
  try {
    const { id: storeId } = req.params;
    const userId = req.user.id;

    const userIsCreator = await isStoreCreator(storeId, userId);
    if (!userIsCreator) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para actualizar el logo. Solo el creador de la tienda puede hacerlo.',
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        error: 'Debes enviar una imagen en el campo "logo" (multipart/form-data)',
      });
    }

    const { url } = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'stores'
    );

    const store = await updateStore(storeId, { logo: url });

    res.json({
      success: true,
      store,
    });
  } catch (error) {
    if (error.message && error.message.includes('no encontrada')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Obtener todos los usuarios de una tienda
 * Solo el creador de la tienda puede ver la lista de usuarios
 */
export async function getStoreUsersHandler(req, res, next) {
  try {
    const { id: storeId } = req.params;
    const userId = req.user.id;

    const userIsCreator = await isStoreCreator(storeId, userId);
    if (!userIsCreator) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para ver los usuarios de esta tienda. Solo el creador de la tienda puede hacerlo.',
      });
    }

    // Obtener usuarios de la tienda
    const users = await getStoreUsers(storeId);

    res.json({
      success: true,
      users,
      count: users.length,
    });
  } catch (error) {
    if (error.message && error.message.includes('no encontrada')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * GET /api/stores/:id/my-permissions
 * Obtener los permisos del usuario actual en esta tienda
 */
export async function getMyPermissionsHandler(req, res, next) {
  try {
    const { id: storeId } = req.params;
    const userId = req.user.id;

    const userStore = await getUserStoreById(storeId, userId);
    if (!userStore) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda',
      });
    }

    const permissionCodes = await getUserPermissionCodesForStore(storeId, userId);
    const creator = await isStoreCreator(storeId, userId);

    res.json({
      success: true,
      permissionCodes,
      isCreator: !!creator,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/stores/:id/users/:userId/permissions
 * Asignar permisos a un usuario. Solo el creador de la tienda.
 */
export async function setUserPermissionsHandler(req, res, next) {
  try {
    const { id: storeId, userId: targetUserId } = req.params;
    const currentUserId = req.user.id;
    const { permissionCodes } = req.body;

    const userIsCreator = await isStoreCreator(storeId, currentUserId);
    if (!userIsCreator) {
      return res.status(403).json({
        success: false,
        error: 'Solo el creador de la tienda puede asignar permisos',
      });
    }

    const targetIsCreator = await isStoreCreator(storeId, targetUserId);
    if (targetIsCreator) {
      return res.status(400).json({
        success: false,
        error: 'El creador de la tienda tiene todos los permisos; no es necesario asignarlos',
      });
    }

    await setUserPermissions(storeId, targetUserId, Array.isArray(permissionCodes) ? permissionCodes : []);

    res.json({
      success: true,
      message: 'Permisos actualizados',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/permissions
 * Listar todos los permisos disponibles (catálogo)
 */
export async function getAllPermissionsHandler(req, res, next) {
  try {
    const permissions = await getAllPermissions();
    res.json({
      success: true,
      permissions,
    });
  } catch (error) {
    next(error);
  }
}
