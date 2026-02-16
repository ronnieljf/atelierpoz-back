/**
 * Servicio de autenticación
 * Contiene la lógica de negocio para autenticación
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

/**
 * Buscar usuario por email
 * @param {string} email - Email del usuario
 * @returns {Promise<Object|null>} Usuario encontrado o null
 */
export async function findUserByEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const result = await query(
    'SELECT id, email, password_hash, name, role FROM users WHERE email = $1',
    [normalizedEmail]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Verificar contraseña
 * @param {string} password - Contraseña en texto plano
 * @param {string} hash - Hash de la contraseña almacenado
 * @returns {Promise<boolean>} true si la contraseña es válida
 */
export async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Actualizar último login del usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<void>}
 */
export async function updateLastLogin(userId) {
  await query(
    'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
    [userId]
  );
}

/**
 * Generar token JWT
 * @param {Object} payload - Datos a incluir en el token
 * @param {string} payload.id - ID del usuario
 * @param {string} payload.email - Email del usuario
 * @param {string} payload.role - Rol del usuario
 * @returns {string} Token JWT
 */
export function generateToken(payload) {
  return jwt.sign(
    {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
}

/**
 * Verificar si el usuario tiene al menos una tienda activa
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} true si el usuario tiene al menos una tienda activa
 */
export async function hasActiveStore(userId) {
  const result = await query(
    `SELECT COUNT(*) as count
     FROM stores s
     INNER JOIN store_users su ON s.id = su.store_id
     WHERE su.user_id = $1 AND s.state = 'active'`,
    [userId]
  );

  return parseInt(result.rows[0].count) > 0;
}

/**
 * Autenticar usuario (login)
 * @param {string} email - Email del usuario
 * @param {string} password - Contraseña del usuario
 * @returns {Promise<Object>} { user, token } o null si las credenciales son inválidas
 * @throws {Error} Si hay un error en la base de datos
 */
export async function authenticateUser(email, password) {
  // Buscar usuario
  const user = await findUserByEmail(email);

  if (!user) {
    return null;
  }

  // Verificar contraseña
  const isValidPassword = await verifyPassword(password, user.password_hash);

  if (!isValidPassword) {
    return null;
  }

  // Actualizar último login
  await updateLastLogin(user.id);

  // Generar token
  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  // Retornar datos del usuario (sin password_hash) y token
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    token,
  };
}

/**
 * Obtener usuario por ID
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object|null>} Usuario encontrado o null
 */
export async function getUserById(userId) {
  const result = await query(
    'SELECT id, email, name, role, created_at, updated_at, last_login FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Cambiar contraseña del usuario logeado (requiere contraseña actual).
 * @param {string} userId - ID del usuario
 * @param {string} currentPassword - Contraseña actual en texto plano
 * @param {string} newPassword - Nueva contraseña en texto plano
 * @throws {Error} Si el usuario no existe, la contraseña actual es incorrecta o la nueva no es válida
 */
export async function changePasswordForUser(userId, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
  }

  const result = await query(
    'SELECT id, password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Usuario no encontrado');
  }

  const user = result.rows[0];
  const isValid = await verifyPassword(currentPassword, user.password_hash);
  if (!isValid) {
    throw new Error('Contraseña actual incorrecta');
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(newPassword, saltRounds);
  await query(
    'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [passwordHash, userId]
  );
}

/**
 * Formatear datos del usuario para respuesta
 * @param {Object} user - Usuario de la base de datos
 * @returns {Object} Usuario formateado para respuesta
 */
export function formatUserResponse(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    ...(user.created_at && { created_at: user.created_at }),
    ...(user.updated_at && { updated_at: user.updated_at }),
    ...(user.last_login && { last_login: user.last_login }),
  };
}

/**
 * Obtener todos los usuarios (solo para admins)
 * @returns {Promise<Array>} Lista de usuarios
 */
export async function getAllUsers() {
  const result = await query(
    'SELECT id, email, name, role, created_at, updated_at, last_login FROM users ORDER BY created_at DESC'
  );

  return result.rows.map(formatUserResponse);
}

/**
 * Crear un nuevo usuario (solo para admins)
 * @param {Object} userData - Datos del usuario
 * @param {string} userData.email - Email del usuario
 * @param {string} userData.password - Contraseña del usuario
 * @param {string} userData.name - Nombre del usuario
 * @param {string} userData.role - Rol del usuario (default: 'user')
 * @returns {Promise<Object>} Usuario creado
 */
export async function createUser(userData) {
  const { email, password, name, role = 'user' } = userData;

  // Verificar que el email no exista
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new Error('El email ya está registrado');
  }

  // Hash de la contraseña
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Crear usuario
  const result = await query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role, created_at, updated_at`,
    [email.toLowerCase().trim(), passwordHash, name, role]
  );

  return formatUserResponse(result.rows[0]);
}

/**
 * Actualizar un usuario (solo para admins)
 * @param {string} userId - ID del usuario a actualizar
 * @param {Object} userData - Datos a actualizar
 * @param {string} [userData.email] - Nuevo email
 * @param {string} [userData.password] - Nueva contraseña
 * @param {string} [userData.name] - Nuevo nombre
 * @param {string} [userData.role] - Nuevo rol
 * @returns {Promise<Object>} Usuario actualizado
 */
export async function updateUser(userId, userData) {
  const { email, password, name, role } = userData;
  const updates = [];
  const values = [];
  let paramIndex = 1;

  // Verificar que el usuario existe
  const existingUser = await getUserById(userId);
  if (!existingUser) {
    throw new Error('Usuario no encontrado');
  }

  // Si se actualiza el email, verificar que no esté en uso por otro usuario
  if (email !== undefined) {
    const emailUser = await findUserByEmail(email);
    if (emailUser && emailUser.id !== userId) {
      throw new Error('El email ya está registrado');
    }
    updates.push(`email = $${paramIndex}`);
    values.push(email.toLowerCase().trim());
    paramIndex++;
  }

  // Si se actualiza la contraseña, hashearla
  if (password !== undefined) {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    updates.push(`password_hash = $${paramIndex}`);
    values.push(passwordHash);
    paramIndex++;
  }

  // Actualizar nombre
  if (name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    values.push(name || null);
    paramIndex++;
  }

  // Actualizar rol
  if (role !== undefined) {
    updates.push(`role = $${paramIndex}`);
    values.push(role);
    paramIndex++;
  }

  // Si no hay actualizaciones, retornar el usuario actual
  if (updates.length === 0) {
    return formatUserResponse(existingUser);
  }

  // Agregar updated_at
  updates.push(`updated_at = CURRENT_TIMESTAMP`);

  // Agregar el userId al final para el WHERE
  values.push(userId);

  // Ejecutar actualización
  const result = await query(
    `UPDATE users 
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING id, email, name, role, created_at, updated_at, last_login`,
    values
  );

  return formatUserResponse(result.rows[0]);
}
