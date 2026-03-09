/**
 * Controlador de recordatorios (configuración y notificaciones in-app).
 */

import * as reminderService from '../services/reminderService.js';
import { updateUserReminderSettings } from '../services/authService.js';

/**
 * GET /api/reminders/settings — configuración de recordatorios del usuario actual.
 */
export async function getSettings(req, res, next) {
  try {
    const userId = req.user.id;
    const settings = await reminderService.getReminderSettings(userId);
    if (!settings) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/reminders/settings — actualizar configuración (reminders_enabled, reminder_days_after_creation, reminder_days_after_last_payment).
 */
export async function updateSettings(req, res, next) {
  try {
    const userId = req.user.id;
    const updated = await updateUserReminderSettings(userId, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    res.json({ success: true, settings: updated });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reminders/notifications — listar notificaciones de recordatorio (no descartadas).
 */
export async function getNotifications(req, res, next) {
  try {
    const userId = req.user.id;
    const list = await reminderService.getReminderNotifications(userId);
    res.json({ success: true, notifications: list });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/reminders/notifications/:id/dismiss — descartar una notificación.
 */
export async function dismissNotification(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updated = await reminderService.dismissReminderNotification(id, userId);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Notificación no encontrada o ya descartada' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/reminders/run-now — ejecutar el envío de recordatorios para el usuario actual.
 */
export async function runNow(req, res, next) {
  try {
    const userId = req.user.id;
    const result = await reminderService.runReceivableRemindersJobForUser(userId);
    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
}
