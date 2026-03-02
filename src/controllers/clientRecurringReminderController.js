/**
 * Controlador de recordatorios de pagos recurrentes por cliente.
 */

import {
  getRemindersByStore,
  getReminderById,
  createReminder,
  updateReminder,
  deleteReminder,
} from '../services/clientRecurringReminderService.js';
import { getUserStoreById } from '../services/storeService.js';

function checkStoreAccess(req, storeId) {
  const userId = req.user.id;
  return getUserStoreById(storeId, userId).then((s) => !!s);
}

/**
 * GET /api/client-recurring-reminders?storeId=&limit=&offset=
 */
export async function getRemindersHandler(req, res, next) {
  try {
    const { storeId, limit, offset } = req.query;
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const result = await getRemindersByStore(storeId, {
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
    res.json({
      success: true,
      reminders: result.reminders,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/client-recurring-reminders/:id?storeId=
 */
export async function getReminderByIdHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId } = req.query;
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const reminder = await getReminderById(id, storeId);
    if (!reminder) {
      return res.status(404).json({ success: false, error: 'Recordatorio no encontrado' });
    }
    res.json({ success: true, reminder });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/client-recurring-reminders
 * Body: { storeId, clientIds: string[], amount, currency?, intervalDays, daysBeforeDue, nextDueAt, contactChannel?, enabled? }
 */
export async function createReminderHandler(req, res, next) {
  try {
    const { storeId, clientIds, amount, currency, nextDueAt, dueDay, contact, contactChannel, enabled, serviceStartedAtByClientId } = req.body;
    if (!storeId || amount == null || !nextDueAt) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: storeId, amount, nextDueAt',
      });
    }
    const ids = Array.isArray(clientIds) ? clientIds.filter(Boolean) : [];
    if (ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debes agregar al menos un destinatario (clientIds)',
      });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const reminder = await createReminder({
      store_id: storeId,
      client_ids: ids,
      amount,
      currency: currency || 'USD',
      next_due_at: nextDueAt,
      due_day: dueDay,
      contact: contact,
      contact_channel: contactChannel,
      enabled: enabled !== false,
      service_started_at_by_client_id: serviceStartedAtByClientId || {},
    });
    res.status(201).json({ success: true, reminder });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/client-recurring-reminders/:id
 * Body: { storeId, clientIds?: string[], amount?, currency?, intervalDays?, daysBeforeDue?, nextDueAt?, contactChannel?, enabled? }
 */
export async function updateReminderHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId, clientIds, amount, currency, nextDueAt, dueDay, contact, contactChannel, enabled, serviceStartedAtByClientId } = req.body;
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const updates = {};
    if (amount !== undefined) updates.amount = amount;
    if (dueDay !== undefined) updates.due_day = dueDay;
    if (currency !== undefined) updates.currency = currency;
    if (nextDueAt !== undefined) updates.next_due_at = nextDueAt;
    if (contact !== undefined) {
      const contactVal = contact != null && String(contact).trim() ? String(contact).trim() : null;
      updates.contact = contactVal;
      if (contactChannel === undefined && contactVal) {
        updates.contact_channel = contactVal.includes('@') ? 'email' : 'phone';
      }
    }
    if (contactChannel !== undefined) updates.contact_channel = contactChannel;
    if (enabled !== undefined) updates.enabled = enabled;
    if (Array.isArray(clientIds)) updates.client_ids = clientIds.filter(Boolean);
    if (serviceStartedAtByClientId !== undefined) updates.service_started_at_by_client_id = serviceStartedAtByClientId;

    const reminder = await updateReminder(id, storeId, updates);
    if (!reminder) {
      return res.status(404).json({ success: false, error: 'Recordatorio no encontrado' });
    }
    res.json({ success: true, reminder });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/client-recurring-reminders/:id?storeId=
 */
export async function deleteReminderHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { storeId } = req.query;
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'storeId es requerido' });
    }
    const hasAccess = await checkStoreAccess(req, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta tienda' });
    }
    const deleted = await deleteReminder(id, storeId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Recordatorio no encontrado' });
    }
    res.json({ success: true, message: 'Recordatorio eliminado' });
  } catch (error) {
    next(error);
  }
}
