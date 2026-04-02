import express from 'express';
import { db, admin } from '../config/firebase.js';
import { requireAuth, requireStudentRole } from '../middleware/authenticate.js';
import canAccessCase from '../middleware/canAccessCase.js';

const router = express.Router();

// GET all visible cases
router.get('/', requireAuth, async (req, res) => {
  try {
    const currentUser = req.currentUser;

    if (!currentUser?.role) {
      return res.status(401).json({ error: 'Authenticated user info missing' });
    }

    const actorId = currentUser?.uid || currentUser?.user_id;

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    // Admin sees all cases
    if (currentUser.role === 'admin') {
      const snapshot = await db.collection('cases').get();

      const cases = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return res.status(200).json(cases);
    }

    // Law student sees only assigned cases
    if (currentUser.role === 'law_student') {
      const assignmentSnap = await db
        .collection('case_assignments')
        .where('user_id', '==', actorId)
        .get();

      const caseIds = assignmentSnap.docs.map((doc) => doc.data().case_id);

      if (!caseIds.length) {
        return res.status(200).json([]);
      }

      const casePromises = caseIds.map((caseId) =>
        db.collection('cases').doc(caseId).get()
      );

      const caseDocs = await Promise.all(casePromises);

      const cases = caseDocs
        .filter((doc) => doc.exists)
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

      return res.status(200).json(cases);
    }

    return res.status(403).json({ error: 'Access denied' });
  } catch (error) {
    console.error('Error fetching cases:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch cases' });
  }
});

// GET single case
router.get('/:caseId', requireAuth, canAccessCase, async (req, res) => {
  try {
    const { caseId } = req.params;

    const caseDoc = await db.collection('cases').doc(caseId).get();

    if (!caseDoc.exists) {
      return res.status(404).json({ error: 'Case not found' });
    }

    return res.status(200).json({
      id: caseDoc.id,
      ...caseDoc.data(),
    });
  } catch (error) {
    console.error('Error fetching case:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch case' });
  }
});

// CREATE case
router.post('/', requireAuth, requireStudentRole, async (req, res) => {
  try {
    const { client_name, case_type, offence } = req.body;

    if (!client_name || !case_type || !offence) {
      return res.status(400).json({
        error: 'Missing required fields: client_name, case_type, offence',
      });
    }

    const actorId = req.currentUser?.uid || req.currentUser?.user_id;

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    const newCase = {
      client_name,
      case_type,
      offence,
      created_by_student_id: actorId,
      status: 'open',
      date_opened: admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    const caseRef = await db.collection('cases').add(newCase);

    await db.collection('case_assignments').add({
      case_id: caseRef.id,
      user_id: actorId,
      assigned_at: admin.firestore.FieldValue.serverTimestamp(),
      assigned_by_user_id: actorId,
    });

    return res.status(201).json({
      message: 'Case created successfully',
      caseId: caseRef.id,
      case: {
        id: caseRef.id,
        ...newCase,
      },
    });
  } catch (error) {
    console.error('Error creating case:', error);
    return res.status(500).json({ error: error.message || 'Failed to create case' });
  }
});

// GET activities for a case
router.get('/:caseId/activities', requireAuth, canAccessCase, async (req, res) => {
  try {
    const { caseId } = req.params;

    const snapshot = await db
      .collection('activities')
      .where('case_id', '==', caseId)
      .get();

    const activities = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json(activities);
  } catch (error) {
    console.error('Error fetching activities:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch activities' });
  }
});

// LOG activity for a case
router.post('/:caseId/activities', requireAuth, canAccessCase, async (req, res) => {
  try {
    const { caseId } = req.params;
    const { court_name, description } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Missing required field: description' });
    }

    const actorId = req.currentUser?.uid || req.currentUser?.user_id;

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    const caseDoc = await db.collection('cases').doc(caseId).get();

    if (!caseDoc.exists) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const newActivity = {
      case_id: caseId,
      court_name: court_name || null,
      description,
      logged_by_user_id: actorId,
      logged_at: admin.firestore.FieldValue.serverTimestamp(),
      type: 'general_activity',
    };

    const activityRef = await db.collection('activities').add(newActivity);

    return res.status(201).json({
      message: 'Activity logged successfully',
      activityId: activityRef.id,
    });
  } catch (error) {
    console.error('Error logging activity:', error);
    return res.status(500).json({ error: error.message || 'Failed to log activity' });
  }
});

export default router;