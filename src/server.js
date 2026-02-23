/**
 * Servidor Express para Atelier Poz Backend
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import storeRoutes from './routes/storeRoutes.js';
import productRoutes from './routes/productRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import postRoutes from './routes/postRoutes.js';
import metaRoutes from './routes/metaRoutes.js';
import grokRoutes from './routes/grokRoutes.js';
import requestRoutes from './routes/requestRoutes.js';
import receivableRoutes from './routes/receivableRoutes.js';
import saleRoutes from './routes/saleRoutes.js';
import clientRoutes from './routes/clientRoutes.js';
import bcvRoutes from './routes/bcvRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import financeCategoryRoutes from './routes/financeCategoryRoutes.js';
import vendorRoutes from './routes/vendorRoutes.js';
import purchaseRoutes from './routes/purchaseRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import reminderRoutes from './routes/reminderRoutes.js';
import cron from 'node-cron';
import { flowPost } from './controllers/flowController.js';
import { runReceivableRemindersJob } from './services/reminderService.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/grok', grokRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/receivables', receivableRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/bcv', bcvRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/finance-categories', financeCategoryRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/reminders', reminderRoutes);

/** POST /api/flow — WhatsApp Flow data exchange (payload cifrado; respuesta cifrada). */
app.post('/api/flow', flowPost);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Ruta no encontrada',
  });
});

// Error handler (debe ir al final)
app.use(errorHandler);

// Job de recordatorios con node-cron (ej: "0 9 * * *" = diario a las 9:00)
const REMINDER_JOB_CRON = process.env.REMINDER_JOB_CRON || '0 9 * * *';

function runReminderJob() {
  runReceivableRemindersJob()
    .then((result) => {
      console.log(`[Recordatorios] Job ejecutado: ${result.remindersCreated} recordatorios, ${result.whatsappSent} WhatsApp enviados, ${result.usersProcessed} usuarios`);
    })
    .catch((err) => {
      console.error('[Recordatorios] Error en job:', err?.message || err);
    });
}

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  runReminderJob();
  if (cron.validate(REMINDER_JOB_CRON)) {
    cron.schedule(REMINDER_JOB_CRON, runReminderJob);
    console.log(`[Recordatorios] Cron programado: ${REMINDER_JOB_CRON}`);
  } else {
    console.warn(`[Recordatorios] Cron inválido "${REMINDER_JOB_CRON}", job no programado. Usa REMINDER_JOB_CRON (ej: 0 9 * * *).`);
  }
});
