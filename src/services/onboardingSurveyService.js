/**
 * Encuesta de onboarding post-registro (tipo de negocio, tamaño, productos, edad).
 */

import { query } from '../config/database.js';

/**
 * Obtener encuesta de onboarding por user_id.
 * @param {string} userId
 * @returns {Promise<{ business_type?: string, business_size?: string, product_line?: string, age?: number } | null>}
 */
export async function getOnboardingSurveyByUserId(userId) {
  const result = await query(
    `SELECT business_type, business_size, product_line, age, created_at, updated_at
     FROM user_onboarding_survey WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    business_type: row.business_type ?? undefined,
    business_size: row.business_size ?? undefined,
    product_line: row.product_line ?? undefined,
    age: row.age != null ? Number(row.age) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Crear o actualizar encuesta de onboarding para un usuario.
 * @param {string} userId
 * @param {{ business_type?: string, business_size?: string, product_line?: string, age?: number }} data
 */
export async function upsertOnboardingSurvey(userId, data) {
  const business_type = (data.business_type || '').trim().slice(0, 255) || null;
  const business_size = (data.business_size || '').trim().slice(0, 100) || null;
  const product_line = (data.product_line || '').trim() || null;
  const age = data.age != null && Number.isFinite(Number(data.age)) ? Math.min(120, Math.max(1, Math.floor(Number(data.age)))) : null;

  await query(
    `INSERT INTO user_onboarding_survey (user_id, business_type, business_size, product_line, age, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       business_type = COALESCE(EXCLUDED.business_type, user_onboarding_survey.business_type),
       business_size = COALESCE(EXCLUDED.business_size, user_onboarding_survey.business_size),
       product_line = COALESCE(EXCLUDED.product_line, user_onboarding_survey.product_line),
       age = COALESCE(EXCLUDED.age, user_onboarding_survey.age),
       updated_at = CURRENT_TIMESTAMP`,
    [userId, business_type, business_size, product_line, age]
  );
}
