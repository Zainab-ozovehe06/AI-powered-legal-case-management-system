import express from 'express';
import { db, admin } from '../config/firebase.js';
import { requireAuth } from '../middleware/authenticate.js';

const router = express.Router();

const requireAdmin = (req, res, next) => {
  const currentUser = req.currentUser;

  if (!currentUser) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  if (currentUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only' });
  }

  return next();
};

const SETTINGS_COLLECTION = 'system_settings';
const SETTINGS_DOC_ID = 'general';

const defaultSettings = {
  clinic_name: 'Law Clinic AI',
  allow_registration: true,
  default_case_status: 'open',
  inactivity_threshold_days: 14,
};

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const settingsRef = db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID);
    const settingsDoc = await settingsRef.get();

    if (!settingsDoc.exists) {
      return res.status(200).json(defaultSettings);
    }

    return res.status(200).json({
      ...defaultSettings,
      ...settingsDoc.data(),
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch settings' });
  }
});

router.put('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      clinic_name,
      allow_registration,
      default_case_status,
      inactivity_threshold_days,
    } = req.body;

    const allowedStatuses = ['open', 'closed'];

    if (
      default_case_status &&
      !allowedStatuses.includes(default_case_status)
    ) {
      return res.status(400).json({ error: 'Invalid default_case_status value' });
    }

    if (
      inactivity_threshold_days !== undefined &&
      (!Number.isInteger(inactivity_threshold_days) || inactivity_threshold_days < 1)
    ) {
      return res.status(400).json({
        error: 'inactivity_threshold_days must be a positive integer',
      });
    }

    const updates = {
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (clinic_name !== undefined) {
      updates.clinic_name = clinic_name;
    }

    if (allow_registration !== undefined) {
      updates.allow_registration = allow_registration;
    }

    if (default_case_status !== undefined) {
      updates.default_case_status = default_case_status;
    }

    if (inactivity_threshold_days !== undefined) {
      updates.inactivity_threshold_days = inactivity_threshold_days;
    }

    const settingsRef = db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID);

    await settingsRef.set(updates, { merge: true });

    return res.status(200).json({
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return res.status(500).json({ error: error.message || 'Failed to update settings' });
  }
});

export default router;