/**
 * Rutas para Groq AI (generación de contenido)
 */

import express from 'express';
import { generateHandler } from '../controllers/grokController.js';

const router = express.Router();

/**
 * POST /api/grok/generate
 * Genera título, descripción o hashtags con Groq.
 *
 * Body: { prompt: string, type?: 'title' | 'description' | 'hashtags' }
 * Response: { content: string }
 */
router.post('/generate', generateHandler);

export default router;
