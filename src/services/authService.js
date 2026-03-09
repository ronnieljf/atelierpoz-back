/**
 * Servicio de autenticación
 * Contiene la lógica de negocio para autenticación
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../config/database.js';
import { sendVerificationCode, sendPasswordResetCode } from './emailService.js';

/**
 * Buscar usuario por email
 * @param {string} email - Email del usuario
 * @returns {Promise<Object|null>} Usuario encontrado o null
 */
export async function findUserByEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const result = await query(
    'SELECT id, email, password_hash, name, role, number_stores, reminders_enabled, reminder_days_after_creation, reminder_days_after_last_payment, reminder_interval_days FROM users WHERE email = $1',
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
      number_stores: user.number_stores ?? 1,
      reminders_enabled: Boolean(user.reminders_enabled),
      reminder_days_after_creation: user.reminder_days_after_creation ?? 30,
      reminder_days_after_last_payment: user.reminder_days_after_last_payment ?? 15,
      reminder_interval_days: user.reminder_interval_days ?? 7,
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
    'SELECT id, email, name, role, number_stores, reminders_enabled, reminder_days_after_creation, reminder_days_after_last_payment, reminder_interval_days, created_at, updated_at, last_login FROM users WHERE id = $1',
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
 * Genera un código de 6 dígitos
 */
function generateVerificationCode() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Registro: solicitar código de verificación por email.
 * No crea el usuario hasta que se verifique el email.
 * @param {string} email - Email del usuario
 * @param {string} name - Nombre (opcional)
 * @param {string} password - Contraseña
 * @param {string} [locale] - Idioma para el correo ('es' | 'en').
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
export async function requestRegisterVerificationCode(email, name, password, locale = 'es') {
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await findUserByEmail(normalizedEmail);
  if (existingUser) {
    throw new Error('El email ya está registrado');
  }

  if (!password || password.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres');
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

  // Invalidar códigos anteriores de registro para este email
  await query(
    "UPDATE email_verification_codes SET used_at = NOW() WHERE email = $1 AND type = 'register'",
    [normalizedEmail]
  );

  await query(
    `INSERT INTO email_verification_codes (email, code, type, meta, expires_at)
     VALUES ($1, $2, 'register', $3::jsonb, $4)`,
    [normalizedEmail, code, JSON.stringify({ name: name || null, password_hash: passwordHash }), expiresAt]
  );

  const result = await sendVerificationCode(normalizedEmail, code, name || '', locale);
  if (!result.success) {
    throw new Error(result.error || 'Error al enviar el correo de verificación');
  }

  return { sent: true };
}

/**
 * Verificar código de registro y crear el usuario.
 * @param {string} email - Email del usuario
 * @param {string} code - Código de 6 dígitos
 * @returns {Promise<Object>} { user, token }
 */
export async function verifyEmailAndRegister(email, code) {
  const normalizedEmail = email.toLowerCase().trim();
  const codeStr = String(code || '').trim();

  const result = await query(
    `SELECT id, email, code, meta, expires_at, used_at
     FROM email_verification_codes
     WHERE email = $1 AND type = 'register' AND code = $2
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail, codeStr]
  );

  if (result.rows.length === 0) {
    throw new Error('Código inválido o expirado');
  }

  const row = result.rows[0];
  if (row.used_at) {
    throw new Error('Este código ya fue utilizado');
  }
  if (new Date(row.expires_at) < new Date()) {
    throw new Error('El código ha expirado. Solicita uno nuevo.');
  }

  const meta = row.meta || {};
  const name = meta.name || null;
  const passwordHash = meta.password_hash;
  if (!passwordHash) {
    throw new Error('Datos de registro inválidos. Intenta registrarte de nuevo.');
  }

  // Marcar código como usado
  await query('UPDATE email_verification_codes SET used_at = NOW() WHERE id = $1', [row.id]);

  // Crear usuario con email verificado
  const insertResult = await query(
    `INSERT INTO users (email, password_hash, name, role, email_verified)
     VALUES ($1, $2, $3, 'user', true)
     RETURNING id, email, name, role, number_stores, reminders_enabled, reminder_days_after_creation, reminder_days_after_last_payment, reminder_interval_days`,
    [normalizedEmail, passwordHash, name]
  );

  const user = insertResult.rows[0];
  const token = generateToken({ id: user.id, email: user.email, role: user.role });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      number_stores: user.number_stores ?? 1,
      reminders_enabled: Boolean(user.reminders_enabled),
      reminder_days_after_creation: user.reminder_days_after_creation ?? 30,
      reminder_days_after_last_payment: user.reminder_days_after_last_payment ?? 15,
      reminder_interval_days: user.reminder_interval_days ?? 7,
    },
    token,
  };
}

/**
 * Recuperar contraseña: solicitar código por email.
 * @param {string} email - Email del usuario
 * @param {string} [locale] - Idioma para el correo ('es' | 'en').
 * @returns {Promise<{ sent: boolean }>}
 */
export async function requestPasswordResetCode(email, locale = 'es') {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await findUserByEmail(normalizedEmail);
  if (!user) {
    // Por seguridad, no revelar si el email existe o no
    return { sent: true };
  }

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await query(
    "UPDATE email_verification_codes SET used_at = NOW() WHERE email = $1 AND type = 'password_reset'"
  , [normalizedEmail]);

  await query(
    `INSERT INTO email_verification_codes (email, code, type, expires_at)
     VALUES ($1, $2, 'password_reset', $3)`,
    [normalizedEmail, code, expiresAt]
  );

  const result = await sendPasswordResetCode(normalizedEmail, code, user.name || '', locale);
  if (!result.success) {
    throw new Error(result.error || 'Error al enviar el correo');
  }

  return { sent: true };
}

/**
 * Restablecer contraseña con código de verificación.
 * @param {string} email - Email del usuario
 * @param {string} code - Código de 6 dígitos
 * @param {string} newPassword - Nueva contraseña
 */
export async function resetPasswordWithCode(email, code, newPassword) {
  const normalizedEmail = email.toLowerCase().trim();
  const codeStr = String(code || '').trim();

  if (!newPassword || newPassword.length < 6) {
    throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
  }

  const result = await query(
    `SELECT id, expires_at, used_at
     FROM email_verification_codes
     WHERE email = $1 AND type = 'password_reset' AND code = $2
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail, codeStr]
  );

  if (result.rows.length === 0) {
    throw new Error('Código inválido o expirado');
  }

  const row = result.rows[0];
  if (row.used_at) {
    throw new Error('Este código ya fue utilizado');
  }
  if (new Date(row.expires_at) < new Date()) {
    throw new Error('El código ha expirado. Solicita uno nuevo.');
  }

  await query('UPDATE email_verification_codes SET used_at = NOW() WHERE id = $1', [row.id]);

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(newPassword, saltRounds);
  await query(
    'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2',
    [passwordHash, normalizedEmail]
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
    number_stores: user.number_stores ?? 1,
    ...(user.created_at && { created_at: user.created_at }),
    ...(user.updated_at && { updated_at: user.updated_at }),
    ...(user.last_login && { last_login: user.last_login }),
    ...(user.reminders_enabled !== undefined && { reminders_enabled: Boolean(user.reminders_enabled) }),
    ...(user.reminder_days_after_creation !== undefined && { reminder_days_after_creation: user.reminder_days_after_creation ?? 30 }),
    ...(user.reminder_days_after_last_payment !== undefined && { reminder_days_after_last_payment: user.reminder_days_after_last_payment ?? 15 }),
    ...(user.reminder_interval_days !== undefined && { reminder_interval_days: user.reminder_interval_days ?? 7 }),
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

/**
 * Actualizar configuración de recordatorios del usuario (solo sus propios datos).
 * @param {string} userId - ID del usuario
 * @param {Object} data - reminders_enabled?, reminder_days_after_creation?, reminder_days_after_last_payment?, reminder_interval_days?, reminder_min_days_age?
 * @returns {Promise<Object>} Usuario con campos de recordatorios actualizados
 */
export async function updateUserReminderSettings(userId, data) {
  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (data.reminders_enabled !== undefined) {
    updates.push(`reminders_enabled = $${paramIndex}`);
    values.push(Boolean(data.reminders_enabled));
    paramIndex++;
  }
  if (data.reminder_days_after_creation !== undefined) {
    // Día del mes para enviar el reporte (1-31)
    const day = Math.max(1, Math.min(31, Number(data.reminder_days_after_creation) || 1));
    updates.push(`reminder_days_after_creation = $${paramIndex}`);
    values.push(day);
    paramIndex++;
  }
  if (data.reminder_days_after_last_payment !== undefined) {
    // Flag 0/1: enviar reporte por correo
    const flag = Boolean(data.reminder_days_after_last_payment);
    updates.push(`reminder_days_after_last_payment = $${paramIndex}`);
    values.push(flag ? 1 : 0);
    paramIndex++;
  }
  if (data.reminder_interval_days !== undefined) {
    // Flag 0/1: enviar reporte por WhatsApp (teléfono)
    const flag = Boolean(data.reminder_interval_days);
    updates.push(`reminder_interval_days = $${paramIndex}`);
    values.push(flag ? 1 : 0);
    paramIndex++;
  }
  if (data.reminder_min_days_age !== undefined) {
    const days = Math.max(1, Math.min(365, Number(data.reminder_min_days_age) || 30));
    updates.push(`reminder_min_days_age = $${paramIndex}`);
    values.push(days);
    paramIndex++;
  }

  const defaultReturn = (user) =>
    user
      ? {
          reminders_enabled: Boolean(user.reminders_enabled),
          // Día del mes configurado para el reporte
          reminder_days_after_creation: user.reminder_days_after_creation ?? 1,
          // Flags 0/1 para canales
          reminder_days_after_last_payment: user.reminder_days_after_last_payment ?? 0,
          reminder_interval_days: user.reminder_interval_days ?? 0,
          // Días mínimos de antigüedad para incluir cuentas en el reporte
          reminder_min_days_age: user.reminder_min_days_age ?? 30,
        }
      : null;

  if (updates.length === 0) {
    const user = await getUserById(userId);
    return defaultReturn(user);
  }

  values.push(userId);
  await query(
    `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex}`,
    values
  );
  const user = await getUserById(userId);
  return defaultReturn(user);
}
