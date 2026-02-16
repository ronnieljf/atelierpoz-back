/**
 * Controlador para integración con Meta/Instagram
 */

import * as metaService from '../services/metaService.js';
import * as metaIntegrationService from '../services/metaIntegrationService.js';
import { query } from '../config/database.js';
import crypto from 'node:crypto';

/**
 * Iniciar flujo de autorización OAuth de Meta
 */
export async function initiateAuthHandler(req, res, next) {
  try {
    const userId = req.user.id;
    
    // Generar estado único que incluye el userId de forma segura
    // Formato: userId:randomBytes (codificado en base64)
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const stateData = `${userId}:${randomBytes}`;
    const state = Buffer.from(stateData).toString('base64');
    
    const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/meta/callback`;
    const authUrl = metaService.getMetaAuthUrl(redirectUri, state);
    
    res.json({
      success: true,
      data: {
        authUrl,
        state,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Callback de OAuth de Meta
 */
export async function callbackHandler(req, res, next) {
  try {
    const { code, state, error, error_reason, error_description } = req.query;
    
    // Extraer userId del estado
    let userId = null;
    if (state) {
      try {
        const stateData = Buffer.from(state, 'base64').toString('utf-8');
        const [decodedUserId] = stateData.split(':');
        userId = decodedUserId;
      } catch (e) {
        console.error('Error al decodificar estado:', e);
      }
    }
    
    if (!userId) {
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/posts?error=${encodeURIComponent('No se pudo identificar el usuario. Por favor, intenta conectarte nuevamente.')}`
      );
    }
    
    if (error) {
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/posts?error=${encodeURIComponent(error_description || error_reason || 'Error de autorización')}`
      );
    }
    
    if (!code) {
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/posts?error=${encodeURIComponent('Código de autorización no recibido')}`
      );
    }
    
    const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/meta/callback`;
    
    // Intercambiar código por token
    const tokenData = await metaService.exchangeCodeForToken(code, redirectUri);
    
    // Obtener token de larga duración
    const longLivedTokenData = await metaService.getLongLivedToken(tokenData.access_token);
    
    // Obtener páginas del usuario
    const pages = await metaService.getUserPages(longLivedTokenData.access_token);
    
    if (pages.length === 0) {
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/posts?error=${encodeURIComponent('No se encontraron páginas de Facebook asociadas. Asegúrate de tener una página y que esté conectada a una cuenta de Instagram Business.')}`
      );
    }
    
    // Buscar página con cuenta de Instagram Business
    let selectedPage = null;
    let instagramAccount = null;
    
    for (const page of pages) {
      if (page.instagram_business_account) {
        selectedPage = page;
        instagramAccount = page.instagram_business_account;
        break;
      }
    }
    
    // Si ninguna página tiene Instagram, intentar obtener cuenta de la primera página
    if (!selectedPage && pages.length > 0) {
      selectedPage = pages[0];
      instagramAccount = await metaService.getInstagramAccount(selectedPage.id, longLivedTokenData.access_token);
    }
    
    if (!instagramAccount) {
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/posts?error=${encodeURIComponent('No se encontró una cuenta de Instagram Business asociada. Asegúrate de que tu página de Facebook esté conectada a una cuenta de Instagram Business.')}`
      );
    }
    
    // Calcular fecha de expiración (60 días para tokens de larga duración)
    const expiresAt = longLivedTokenData.expires_in
      ? new Date(Date.now() + longLivedTokenData.expires_in * 1000)
      : null;
    
    // Guardar integración en la base de datos
    await metaIntegrationService.saveMetaIntegration({
      userId,
      pageId: selectedPage.id,
      pageName: selectedPage.name,
      instagramAccountId: instagramAccount.id,
      instagramUsername: instagramAccount.username,
      accessToken: longLivedTokenData.access_token,
      tokenType: longLivedTokenData.token_type || 'bearer',
      expiresAt,
      isLongLived: true,
    });
    
    res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/posts?success=${encodeURIComponent('Cuenta de Instagram conectada exitosamente')}`
    );
  } catch (error) {
    console.error('Error en callback de Meta:', error);
    res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/posts?error=${encodeURIComponent(error.message || 'Error al conectar con Instagram')}`
    );
  }
}

/**
 * Obtener estado de la integración de Meta
 */
export async function getIntegrationStatusHandler(req, res, next) {
  try {
    const userId = req.user.id;
    
    const integration = await metaIntegrationService.getMetaIntegrationByUser(userId);
    
    if (!integration) {
      return res.json({
        success: true,
        data: {
          connected: false,
          integration: null,
        },
      });
    }
    
    // Verificar si el token está expirado
    const isExpired = integration.expiresAt
      ? new Date(integration.expiresAt) < new Date()
      : false;
    
    res.json({
      success: true,
      data: {
        connected: !isExpired,
        integration: {
          pageName: integration.pageName,
          instagramUsername: integration.instagramUsername,
          expiresAt: integration.expiresAt,
          isExpired,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Desconectar integración de Meta
 */
export async function disconnectHandler(req, res, next) {
  try {
    const userId = req.user.id;
    
    const deleted = await metaIntegrationService.deleteMetaIntegration(userId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró una integración para desconectar',
      });
    }
    
    res.json({
      success: true,
      message: 'Integración desconectada exitosamente',
    });
  } catch (error) {
    next(error);
  }
}
