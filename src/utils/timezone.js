/**
 * Utilidades de zona horaria para Caracas, Venezuela (America/Caracas).
 * Usado por jobs y servicios que deben operar en hora local de Venezuela.
 */

const TZ_CARACAS = 'America/Caracas';

/**
 * Obtiene la fecha de hoy (YYYY-MM-DD) en zona horaria Caracas.
 */
export function getTodayCaracas() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: TZ_CARACAS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '0';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Obtiene las partes de la fecha actual en Caracas.
 * @returns {{ year: number, month: number, day: number }}
 */
export function getDatePartsCaracas() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: TZ_CARACAS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  return {
    year: get('year'),
    month: get('month') - 1, // 0-indexed
    day: get('day'),
  };
}
