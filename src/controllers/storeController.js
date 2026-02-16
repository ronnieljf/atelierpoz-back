/**
 * Controlador de tiendas
 * Maneja las peticiones HTTP y delega la lógica de negocio a los servicios
 */

import { getUserStores, getUserStoreById, getAllActiveStores, getStoreByIdPublic, getStoreFeatureSendReminderReceivablesWhatsapp, createStore, updateStore, userHasStoreAsCreator, isStoreCreator, findUserByEmail, addUserToStore, userExistsInStore, updateUserPhoneNumber, getStoreUsers } from '../services/storeService.js';
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
 * - Usuarios normales: solo ven las tiendas que crearon
 * - Admins: ven todas las tiendas activas
 */
export async function getStores(req, res, next) {
  try {
    const userId = req.user.id;
    const userRole = req.user.role || 'user';

    const stores = await getUserStores(userId, userRole);

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
 * Actualizar una tienda (admins pueden editar cualquier tienda, usuarios normales solo sus propias tiendas)
 */
export async function updateStoreHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { name, state, store_id, instagram, tiktok, description, location, iva } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Si no es admin, verificar que el usuario pertenezca a la tienda
    if (!isAdmin) {
      const userStore = await getUserStoreById(id, userId);
      if (!userStore) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permiso para editar esta tienda',
        });
      }
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
 * - Admins pueden crear múltiples tiendas
 * - Usuarios normales solo pueden crear una tienda
 */
export async function createStoreHandler(req, res, next) {
  try {
    const { name, state, store_id, instagram, tiktok, description, location, iva } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Validaciones básicas
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'El nombre de la tienda es requerido',
      });
    }

    // Validar formato de Instagram si se proporciona
    if (instagram && instagram.trim()) {
      const instagramRegex = /^[a-zA-Z0-9._]+$/;
      if (!instagramRegex.test(instagram.trim())) {
        return res.status(400).json({
          success: false,
          error: 'El formato del Instagram no es válido. Solo se permiten letras, números, puntos y guiones bajos.',
        });
      }
    }

    // Validar formato de TikTok si se proporciona (mismo formato que Instagram)
    if (tiktok && tiktok.trim()) {
      const tiktokRegex = /^[a-zA-Z0-9._]+$/;
      if (!tiktokRegex.test(tiktok.trim())) {
        return res.status(400).json({
          success: false,
          error: 'El formato del TikTok no es válido. Solo se permiten letras, números, puntos y guiones bajos.',
        });
      }
    }

    // Si no es admin, verificar que no tenga ya una tienda
    if (!isAdmin) {
      const hasStore = await userHasStoreAsCreator(userId);
      if (hasStore) {
        return res.status(403).json({
          success: false,
          error: 'Ya tienes una tienda creada. Los usuarios normales solo pueden tener una tienda.',
        });
      }
    }

    // Crear tienda usando el servicio
    // Si es admin, crear solo la tienda sin registro en store_users
    // Si no es admin, crear la tienda y el registro en store_users
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
      !isAdmin // Solo crear store_user si NO es admin
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
 * Solo el creador de la tienda o un admin pueden agregar usuarios
 */
export async function addUserToStoreHandler(req, res, next) {
  try {
    const { id: storeId } = req.params;
    const { email, isCreator = false } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Validar que se proporcione el email
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El email del usuario es requerido',
      });
    }

    // Validar formato de email básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: 'El formato del email no es válido',
      });
    }

    // Verificar permisos: solo el creador de la tienda o un admin pueden agregar usuarios
    if (!isAdmin) {
      const userIsCreator = await isStoreCreator(storeId, userId);
      if (!userIsCreator) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permiso para agregar usuarios a esta tienda. Solo el creador de la tienda puede hacerlo.',
        });
      }
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
    const storeUser = await addUserToStore(storeId, user.id, isCreator === true || isCreator === 'true');

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
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin) {
      const userIsCreator = await isStoreCreator(storeId, userId);
      if (!userIsCreator) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permiso para actualizar el logo. Solo el creador de la tienda o un admin pueden hacerlo.',
        });
      }
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
 * Solo el creador de la tienda o un admin pueden ver la lista de usuarios
 */
export async function getStoreUsersHandler(req, res, next) {
  try {
    const { id: storeId } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Verificar permisos: solo el creador de la tienda o un admin pueden ver usuarios
    if (!isAdmin) {
      const userIsCreator = await isStoreCreator(storeId, userId);
      if (!userIsCreator) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permiso para ver los usuarios de esta tienda. Solo el creador de la tienda puede hacerlo.',
        });
      }
    }

    // Obtener usuarios de la tienda
    const users = await getStoreUsers(storeId);

    res.json({
      success: true,
      users,
      count: users.length,
    });
  } catch (error) {
    // Manejar errores específicos
    if (error.message && error.message.includes('no encontrada')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}
