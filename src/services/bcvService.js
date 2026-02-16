/**
 * Servicio para obtener información del Banco Central de Venezuela (BCV)
 */

import https from 'https';
import * as cheerio from 'cheerio';

// Caché para las tasas BCV (dólar y euro, 1 hora)
let ratesCache = {
  dolar: null,
  euro: null,
  timestamp: null,
};

const CACHE_DURATION = 60 * 60 * 1000; // 1 hora en milisegundos

/**
 * Extrae el valor numérico de un elemento jQuery de tipo BCV (#dolar o #euro)
 * @param {object} $ - Cheerio
 * @param {string} elementId - Id del elemento ('dolar' o 'euro')
 * @returns {number} Valor parseado o 0
 */
function extractRateFromElement($, elementId) {
  const el = $(`#${elementId}`);
  if (el.length === 0) return 0;
  const strongEl = el.find('strong');
  let numberText = strongEl.length > 0 ? strongEl.text().trim() : el.text().trim();
  const numberMatch = numberText.match(/[\d.,]+/);
  if (!numberMatch) return 0;
  const normalized = numberMatch[0].replace(',', '.');
  const value = parseFloat(normalized);
  return !Number.isNaN(value) && value > 0 ? parseFloat(value.toFixed(2)) : 0;
}

/**
 * Obtiene el HTML de la página principal del BCV
 * @returns {Promise<string>} El HTML de la página
 */
export async function fetchBCVHTML() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.bcv.org.ve',
      port: 443,
      path: '/',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
      // Desactivar verificación SSL para sitios con certificados problemáticos
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      let html = '';

      res.on('data', (chunk) => {
        html += chunk;
      });

      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(html);
        } else {
          reject(new Error(`Error al obtener el HTML del BCV: ${res.statusCode} ${res.statusMessage}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('Error en fetchBCVHTML:', error);
      reject(error);
    });

    req.end();
  });
}

/**
 * Obtiene el elemento con id "dolar" del BCV
 * @returns {Promise<string>} El contenido del elemento con id "dolar"
 */
export async function getDolarElement() {
  try {
    const html = await fetchBCVHTML();
    const $ = cheerio.load(html);
    
    const dolarElement = $('#dolar');
    
    if (dolarElement.length === 0) {
      throw new Error('No se encontró el elemento con id "dolar"');
    }
    
    // Retornar el HTML del elemento
    return dolarElement.html() || dolarElement.text() || '';
  } catch (error) {
    console.error('Error en getDolarElement:', error);
    throw error;
  }
}

/**
 * Obtiene las tasas del dólar y del euro del BCV en una sola petición.
 * Usa caché de 1 hora.
 * @returns {Promise<{ dolar: number, euro: number }>}
 */
export async function getBcvRates() {
  const now = Date.now();
  if (
    ratesCache.dolar !== null &&
    ratesCache.timestamp !== null &&
    (now - ratesCache.timestamp) < CACHE_DURATION
  ) {
    console.log('Retornando tasas BCV desde caché');
    return { dolar: ratesCache.dolar, euro: ratesCache.euro };
  }

  try {
    const html = await fetchBCVHTML();
    const $ = cheerio.load(html);

    const dolarValue = extractRateFromElement($, 'dolar');
    const euroValue = extractRateFromElement($, 'euro');

    if (dolarValue > 0 || euroValue > 0) {
      ratesCache.dolar = dolarValue > 0 ? dolarValue : ratesCache.dolar;
      ratesCache.euro = euroValue > 0 ? euroValue : ratesCache.euro;
      ratesCache.timestamp = now;
      console.log('Tasas BCV actualizadas en caché - dolar:', ratesCache.dolar, 'euro:', ratesCache.euro);
    }

    return {
      dolar: dolarValue > 0 ? dolarValue : (ratesCache.dolar ?? 0),
      euro: euroValue > 0 ? euroValue : (ratesCache.euro ?? 0),
    };
  } catch (error) {
    console.error('Error en getBcvRates:', error);
    return {
      dolar: ratesCache.dolar ?? 0,
      euro: ratesCache.euro ?? 0,
    };
  }
}

/**
 * Obtiene el valor del dólar del BCV en formato numérico (float con máximo 2 decimales)
 * Utiliza caché de 1 hora para evitar múltiples requests
 * @returns {Promise<number>} El valor del dólar como número, o 0 si hay algún error
 */
export async function getDolarValue() {
  const rates = await getBcvRates();
  return rates.dolar;
}

/**
 * Obtiene el valor del euro del BCV en formato numérico (float con máximo 2 decimales)
 * @returns {Promise<number>} El valor del euro como número, o 0 si hay algún error
 */
export async function getEuroValue() {
  const rates = await getBcvRates();
  return rates.euro;
}
