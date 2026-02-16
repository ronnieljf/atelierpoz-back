/**
 * Controlador para endpoints relacionados con BCV
 */

import { fetchBCVHTML, getDolarElement, getBcvRates } from '../services/bcvService.js';

/**
 * Handler para obtener el HTML del BCV (endpoint temporal para pruebas)
 */
export async function getBCVHTMLHandler(req, res, next) {
  try {
    const html = await fetchBCVHTML();
    
    res.status(200).json({
      success: true,
      html: html,
      length: html.length,
    });
  } catch (error) {
    console.error('Error en getBCVHTMLHandler:', error);
    next(error);
  }
}

/**
 * Handler para obtener las tasas BCV (dólar y euro)
 */
export async function getDolarHandler(req, res, next) {
  try {
    const { dolar, euro } = await getBcvRates();

    res.status(200).json({
      success: true,
      dolar,
      euro,
    });
  } catch (error) {
    console.error('Error en getDolarHandler:', error);
    next(error);
  }
}
