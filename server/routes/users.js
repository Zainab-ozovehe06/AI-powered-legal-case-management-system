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

// GET all users
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();

    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch users' });
  }
});

// PATCH update user role and/or status
router.patch('/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, status } = req.body;

    if (!role && !status) {
      return res.status(400).json({
        error: 'Provide at least one field to update: role or status',
      });
    }

    const allowedRoles = ['admin', 'law_student', 'supervisor', 'lawyer'];
    const allowedStatuses = ['active', 'inactive'];

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates = {
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (role) {
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role value' });
      }
      updates.role = role;
    }

    if (status) {
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      updates.status = status;
    }

    await userRef.update(updates);

    return res.status(200).json({
      message: 'User updated successfully',
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ error: error.message || 'Failed to update user' });
  }
});

export default router;