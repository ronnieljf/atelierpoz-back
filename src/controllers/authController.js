/**
 * Controlador de autenticación
 * Maneja las peticiones HTTP y delega la lógica de negocio a los servicios
 */

import {
  authenticateUser,
  getUserById,
  formatUserResponse,
  getAllUsers,
  createUser,
  updateUser,
  changePasswordForUser,
} from '../services/authService.js';

/**
 * Login de usuario
 */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const emailNormalized = (email || '').toString().toLowerCase().trim();

    // Validaciones básicas
    if (!emailNormalized || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email y contraseña son requeridos',
      });
    }

    // Autenticar usuario usando el servicio (email en minúsculas para que el login sea case-insensitive)
    const result = await authenticateUser(emailNormalized, password);

    if (!result) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas',
      });
    }

    // Retornar respuesta exitosa
    res.json({
      success: true,
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Verificar token (para validar si el token es válido)
 */
export async function verifyToken(req, res, next) {
  try {
    // Si llegamos aquí, el middleware authenticateToken ya validó el token
    // Solo necesitamos retornar la información del usuario
    res.json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtener información del usuario actual (me)
 * Devuelve los datos completos del usuario desde la base de datos
 */
export async function getMe(req, res, next) {
  try {
    // El middleware authenticateToken ya validó el token y agregó req.user
    // Obtener los datos completos desde la base de datos usando el servicio
    const userId = req.user.id;

    const user = await getUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
    }

    // Formatear respuesta usando el servicio
    const formattedUser = formatUserResponse(user);

    res.json({
      success: true,
      user: formattedUser,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cambiar contraseña del usuario logeado
 * Body: { currentPassword, newPassword }
 */
export async function changePasswordHandler(req, res, next) {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Contraseña actual y nueva contraseña son requeridas',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'La nueva contraseña debe tener al menos 6 caracteres',
      });
    }

    await changePasswordForUser(userId, currentPassword, newPassword);

    res.json({
      success: true,
      message: 'Contraseña actualizada correctamente',
    });
  } catch (error) {
    if (error.message === 'Contraseña actual incorrecta') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message === 'Usuario no encontrado') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Obtener todos los usuarios (solo para admins)
 */
export async function getAllUsersHandler(req, res, next) {
  try {
    const users = await getAllUsers();

    res.json({
      success: true,
      users,
      count: users.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Crear un nuevo usuario (solo para admins)
 */
export async function createUserHandler(req, res, next) {
  try {
    const { email, password, name, role } = req.body;

    // Validaciones básicas
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email y contraseña son requeridos',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña debe tener al menos 6 caracteres',
      });
    }

    // Crear usuario usando el servicio
    const user = await createUser({
      email,
      password,
      name: name || null,
      role: role || 'user',
    });

    res.status(201).json({
      success: true,
      user,
    });
  } catch (error) {
    // Manejar error de email duplicado
    if (error.message && error.message.includes('email ya está registrado')) {
      return res.status(409).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

/**
 * Actualizar un usuario (solo para admins)
 */
export async function updateUserHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { email, password, name, role } = req.body;

    // Validaciones
    if (email && !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Email inválido',
      });
    }

    if (password && password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña debe tener al menos 6 caracteres',
      });
    }

    if (role && !['admin', 'user'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'El rol debe ser "admin" o "user"',
      });
    }

    // Actualizar usuario usando el servicio
    const user = await updateUser(id, {
      email,
      password,
      name,
      role,
    });

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    // Manejar error de email duplicado
    if (error.message && error.message.includes('email ya está registrado')) {
      return res.status(409).json({
        success: false,
        error: error.message,
      });
    }
    // Manejar error de usuario no encontrado
    if (error.message && error.message.includes('no encontrado')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}
