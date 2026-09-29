import express from 'express';
import { db, admin } from '../config/firebase.js';
import {
  requireAdminRole,
  requireAuth,
  requireStudentRole,
} from '../middleware/authenticate.js';
import canAccessCase from '../middleware/canAccessCase.js';
import requireGroupLeaderForCase from '../middleware/requireGroupLeaderForCase.js';
import {
  addActivity,
  ASSIGNMENT_TYPE,
  getActorId,
  getAssignedGroupsForCase,
  getDirectCaseIdsForUser,
  getGroupIdsForUser,
  getVisibleCaseIdsForStudent,
  isCaseAssignedToGroup,
  normalizeText,
} from '../utils/groupCollaboration.js';
import { assignLawyerToCase } from '../utils/lawyerAssignment.js';

const router = express.Router();

const CASE_STATUS_ALIASES = {
  open: 'open',
  opened: 'open',
  new: 'open',
  intake: 'open',
  incourt: 'incourt',
  court: 'incourt',
  hearing: 'incourt',
  trial: 'incourt',
  pending: 'pending',
  active: 'pending',
  review: 'pending',
  investigation: 'pending',
  assigned: 'pending',
  closed: 'closed',
  close: 'closed',
  resolved: 'closed',
  outcome: 'closed',
};

const normalizeCaseStatus = (status) => {
  if (!status) return null;

  const token = status
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  return CASE_STATUS_ALIASES[token] || null;
};

const isCaseDeleted = (caseData) => caseData?.is_deleted === true;

const getCasesByIds = async (caseIds) => {
  const uniqueCaseIds = [...new Set(caseIds.map(normalizeText).filter(Boolean))];

  if (!uniqueCaseIds.length) {
    return [];
  }

  const caseDocs = await Promise.all(
    uniqueCaseIds.map((caseId) => db.collection('cases').doc(caseId).get())
  );

  return caseDocs
    .filter((doc) => doc.exists && !isCaseDeleted(doc.data()))
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
};

const getCaseEditableFields = (body) => {
  const updates = {};
  const stringFields = ['client_name', 'case_type', 'offence', 'description'];

  stringFields.forEach((field) => {
    if (body[field] !== undefined) {
      updates[field] = body[field]?.toString().trim() || '';
    }
  });

  if (updates.client_name === '') {
    throw new Error('client_name cannot be empty');
  }

  if (updates.case_type === '') {
    throw new Error('case_type cannot be empty');
  }

  if (updates.offence === '') {
    throw new Error('offence cannot be empty');
  }

  return updates;
};

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

    // Admin sees all active cases
    if (currentUser.role === 'admin') {
      const snapshot = await db.collection('cases').get();

      const cases = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((caseItem) => !isCaseDeleted(caseItem));

      return res.status(200).json(cases);
    }

    // Law student sees cases they created, direct assignments, and group assignments.
    if (currentUser.role === 'law_student') {
      const caseIds = await getVisibleCaseIdsForStudent(actorId);
      const cases = await getCasesByIds(caseIds);

      return res.status(200).json(cases);
    }

    // Lawyers see cases directly assigned to them by an admin.
    if (currentUser.role === 'lawyer') {
      const caseIds = await getDirectCaseIdsForUser(actorId);
      const cases = await getCasesByIds(caseIds);

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

    const caseData = caseDoc.data();

    if (isCaseDeleted(caseData) && req.currentUser?.role !== 'admin') {
      return res.status(404).json({ error: 'Case not found' });
    }

    const actorId = getActorId(req);
    const assignedGroups = await getAssignedGroupsForCase(caseId, actorId);
    const visibleAssignedGroups =
      req.currentUser?.role === 'admin'
        ? assignedGroups
        : assignedGroups.filter((group) => group.current_user_role);

    return res.status(200).json({
      id: caseDoc.id,
      ...caseData,
      group_assignments: visibleAssignedGroups,
    });
  } catch (error) {
    console.error('Error fetching case:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch case' });
  }
});

// UPDATE case status
router.patch(
  '/:caseId/status',
  requireAuth,
  requireStudentRole,
  canAccessCase,
  async (req, res) => {
    try {
      const { caseId } = req.params;
      const nextStatus = normalizeCaseStatus(req.body?.status);

      if (!nextStatus) {
        return res.status(400).json({
          error: 'Invalid status. Use one of: open, incourt, pending, closed',
        });
      }

      const actorId = req.currentUser?.uid || req.currentUser?.user_id;

      if (!actorId) {
        return res.status(401).json({ error: 'Authenticated user ID missing' });
      }

      const caseRef = db.collection('cases').doc(caseId);
      const caseDoc = await caseRef.get();

      if (!caseDoc.exists) {
        return res.status(404).json({ error: 'Case not found' });
      }

      if (isCaseDeleted(caseDoc.data())) {
        return res.status(409).json({
          error: 'Case has been deleted. Restore it before updating the status.',
        });
      }

      await caseRef.update({
        status: nextStatus,
        status_updated_at: admin.firestore.FieldValue.serverTimestamp(),
        status_updated_by_user_id: actorId,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        message: 'Case status updated successfully',
        case: {
          id: caseId,
          status: nextStatus,
        },
      });
    } catch (error) {
      console.error('Error updating case status:', error);
      return res
        .status(500)
        .json({ error: error.message || 'Failed to update case status' });
    }
  }
);

// UPDATE case details
router.patch('/:caseId', requireAuth, canAccessCase, async (req, res) => {
  try {
    const { caseId } = req.params;
    const actorId = req.currentUser?.uid || req.currentUser?.user_id;

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    if (!['admin', 'law_student'].includes(req.currentUser?.role)) {
      return res.status(403).json({ error: 'Only admins and students can edit case details' });
    }

    let updates;

    try {
      updates = getCaseEditableFields(req.body || {});
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        error: 'Provide at least one case field to update',
      });
    }

    const caseRef = db.collection('cases').doc(caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      return res.status(404).json({ error: 'Case not found' });
    }

    if (isCaseDeleted(caseDoc.data())) {
      return res.status(409).json({
        error: 'Case has been deleted. Restore it before updating details.',
      });
    }

    const updatePayload = {
      ...updates,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by_user_id: actorId,
    };

    await caseRef.update(updatePayload);

    return res.status(200).json({
      message: 'Case updated successfully',
      case: {
        id: caseId,
        ...updates,
      },
    });
  } catch (error) {
    console.error('Error updating case:', error);
    return res.status(500).json({ error: error.message || 'Failed to update case' });
  }
});

// DELETE case
router.delete('/:caseId', requireAuth, requireAdminRole, async (req, res) => {
  try {
    const { caseId } = req.params;
    const actorId = req.currentUser?.uid || req.currentUser?.user_id;

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    const caseRef = db.collection('cases').doc(caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      return res.status(404).json({ error: 'Case not found' });
    }

    if (!isCaseDeleted(caseDoc.data())) {
      await caseRef.update({
        is_deleted: true,
        deleted_at: admin.firestore.FieldValue.serverTimestamp(),
        deleted_by_user_id: actorId,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return res.status(200).json({
      message: 'Case deleted successfully',
      case: {
        id: caseId,
        is_deleted: true,
      },
    });
  } catch (error) {
    console.error('Error deleting case:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete case' });
  }
});

// RESTORE deleted case
router.post('/:caseId/restore', requireAuth, requireAdminRole, async (req, res) => {
  try {
    const { caseId } = req.params;
    const actorId = req.currentUser?.uid || req.currentUser?.user_id;

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    const caseRef = db.collection('cases').doc(caseId);
    const caseDoc = await caseRef.get();

    if (!caseDoc.exists) {
      return res.status(404).json({ error: 'Case not found' });
    }

    await caseRef.update({
      is_deleted: false,
      deleted_at: admin.firestore.FieldValue.delete(),
      deleted_by_user_id: admin.firestore.FieldValue.delete(),
      restored_at: admin.firestore.FieldValue.serverTimestamp(),
      restored_by_user_id: actorId,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      message: 'Case restored successfully',
      case: {
        id: caseId,
        is_deleted: false,
      },
    });
  } catch (error) {
    console.error('Error restoring case:', error);
    return res.status(500).json({ error: error.message || 'Failed to restore case' });
  }
});

// CREATE case
router.post('/', requireAuth, requireStudentRole, async (req, res) => {
  try {
    const { client_name, case_type, offence, description } = req.body;

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
      description: description?.toString().trim() || '',
      created_by_student_id: actorId,
      status: 'open',
      date_opened: admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    const caseRef = await db.collection('cases').add(newCase);

    await db.collection('case_assignments').add({
      case_id: caseRef.id,
      assigned_to_type: ASSIGNMENT_TYPE.USER,
      user_id: actorId,
      group_id: null,
      assigned_by: actorId,
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

// ASSIGN case to group
router.post('/:caseId/assign-group', requireAuth, requireAdminRole, async (req, res) => {
  try {
    const { caseId } = req.params;
    const groupId = normalizeText(req.body?.group_id);
    const actorId = getActorId(req);

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    if (!groupId) {
      return res.status(400).json({ error: 'group_id is required' });
    }

    const [caseDoc, groupDoc] = await Promise.all([
      db.collection('cases').doc(caseId).get(),
      db.collection('groups').doc(groupId).get(),
    ]);

    if (!caseDoc.exists) {
      return res.status(404).json({ error: 'Case not found' });
    }

    if (isCaseDeleted(caseDoc.data())) {
      return res.status(409).json({
        error: 'Case has been deleted. Restore it before assigning a group.',
      });
    }

    if (!groupDoc.exists) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (groupDoc.data().status !== 'active') {
      return res.status(409).json({ error: 'Only active groups can be assigned cases' });
    }

    const alreadyAssigned = await isCaseAssignedToGroup(caseId, groupId);

    if (alreadyAssigned) {
      return res.status(409).json({
        error: 'This group is already assigned to the case',
      });
    }

    const assignment = {
      case_id: caseId,
      assigned_to_type: ASSIGNMENT_TYPE.GROUP,
      user_id: null,
      group_id: groupId,
      assigned_by: actorId,
      assigned_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    const assignmentRef = await db.collection('case_assignments').add(assignment);

    await addActivity({
      caseId,
      actorId,
      description: `Assigned group: ${groupDoc.data().name || groupId}`,
      type: 'group_assignment',
    });

    return res.status(201).json({
      message: 'Case assigned to group successfully',
      assignmentId: assignmentRef.id,
      assignment: {
        id: assignmentRef.id,
        ...assignment,
      },
    });
  } catch (error) {
    console.error('Error assigning case to group:', error);
    return res
      .status(500)
      .json({ error: 'Failed to assign case to group' });
  }
});

// ASSIGN case to lawyer
router.post('/:caseId/assign-lawyer', requireAuth, requireAdminRole, async (req, res) => {
  try {
    const { caseId } = req.params;
    const lawyerId = normalizeText(req.body?.lawyer_id || req.body?.lawyerId);
    const actorId = getActorId(req);
    const result = await assignLawyerToCase({ caseId, lawyerId, actorId });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error assigning case to lawyer:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to assign case to lawyer',
    });
  }
});

// SUBMIT group reflection for a case
router.post(
  '/:caseId/group-reflections',
  requireAuth,
  requireStudentRole,
  requireGroupLeaderForCase,
  async (req, res) => {
    try {
      const { caseId } = req.params;
      const actorId = getActorId(req);
      const title = normalizeText(req.body?.title);
      const content = normalizeText(req.body?.content);
      const groupId = req.groupLeaderAccess.groupId;

      if (!actorId) {
        return res.status(401).json({ error: 'Authenticated user ID missing' });
      }

      if (!title) {
        return res.status(400).json({ error: 'Reflection title is required' });
      }

      if (!content) {
        return res.status(400).json({ error: 'Reflection content is required' });
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const reflection = {
        case_id: caseId,
        group_id: groupId,
        submitted_by: actorId,
        title,
        content,
        status: 'submitted',
        role: 'supervisor',
        supervisor_id: null,
        submitted_at: now,
        updated_at: now,
      };
      const reflectionRef = await db.collection('group_reflections').add(reflection);

      await addActivity({
        caseId,
        actorId,
        description: `Submitted group reflection: ${title}`,
        type: 'group_reflection_submitted',
      });

      const savedReflection = await reflectionRef.get();

      return res.status(201).json({
        message: 'Group reflection submitted successfully',
        reflection: {
          id: savedReflection.id,
          ...savedReflection.data(),
        },
      });
    } catch (error) {
      console.error('Error submitting group reflection:', error);
      return res.status(500).json({
        error: 'Failed to submit group reflection',
      });
    }
  }
);

// GET group reflections for a case
router.get(
  '/:caseId/group-reflections',
  requireAuth,
  canAccessCase,
  async (req, res) => {
    try {
      const { caseId } = req.params;
      const actorId = getActorId(req);
      let authorizedGroupIds = null;

      if (!actorId) {
        return res.status(401).json({ error: 'Authenticated user ID missing' });
      }

      if (req.currentUser.role !== 'admin') {
        const userGroupIds = await getGroupIdsForUser(actorId);
        const assignmentChecks = await Promise.all(
          userGroupIds.map(async (groupId) => ({
            groupId,
            assigned: await isCaseAssignedToGroup(caseId, groupId),
          }))
        );

        authorizedGroupIds = assignmentChecks
          .filter((item) => item.assigned)
          .map((item) => item.groupId);

        if (!authorizedGroupIds.length) {
          return res.status(403).json({
            error: 'You are not authorized to view group reflections for this case',
          });
        }
      }

      const reflectionSnap = await db
        .collection('group_reflections')
        .where('case_id', '==', caseId)
        .get();

      const reflections = reflectionSnap.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter(
          (reflection) =>
            !authorizedGroupIds || authorizedGroupIds.includes(reflection.group_id)
        )
        .sort((a, b) => {
          const aMillis = a.submitted_at?.toMillis?.() || 0;
          const bMillis = b.submitted_at?.toMillis?.() || 0;
          return bMillis - aMillis;
        });

      return res.status(200).json(reflections);
    } catch (error) {
      console.error('Error fetching group reflections:', error);
      return res.status(500).json({
        error: 'Failed to fetch group reflections',
      });
    }
  }
);

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

// UPDATE activity
router.patch(
  '/:caseId/activities/:activityId',
  requireAuth,
  canAccessCase,
  async (req, res) => {
    try {
      const { caseId, activityId } = req.params;
      const actorId = req.currentUser?.uid || req.currentUser?.user_id;
      const description = req.body?.description?.toString().trim();
      const hasCourtName = req.body?.court_name !== undefined;

      if (!actorId) {
        return res.status(401).json({ error: 'Authenticated user ID missing' });
      }

      if (!description && !hasCourtName) {
        return res.status(400).json({
          error: 'Provide a description or court_name to update',
        });
      }

      if (req.body?.description !== undefined && !description) {
        return res.status(400).json({ error: 'description cannot be empty' });
      }

      const activityRef = db.collection('activities').doc(activityId);
      const activityDoc = await activityRef.get();

      if (!activityDoc.exists) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      if (activityDoc.data().case_id !== caseId) {
        return res.status(400).json({ error: 'Activity does not belong to this case' });
      }

      const updates = {
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_by_user_id: actorId,
      };

      if (description) {
        updates.description = description;
      }

      if (hasCourtName) {
        updates.court_name = req.body.court_name?.toString().trim() || null;
      }

      await activityRef.update(updates);

      return res.status(200).json({
        message: 'Activity updated successfully',
        activity: {
          id: activityId,
          ...(description ? { description } : {}),
          ...(hasCourtName ? { court_name: updates.court_name } : {}),
        },
      });
    } catch (error) {
      console.error('Error updating activity:', error);
      return res
        .status(500)
        .json({ error: error.message || 'Failed to update activity' });
    }
  }
);

// DELETE activity
router.delete(
  '/:caseId/activities/:activityId',
  requireAuth,
  canAccessCase,
  async (req, res) => {
    try {
      const { caseId, activityId } = req.params;
      const activityRef = db.collection('activities').doc(activityId);
      const activityDoc = await activityRef.get();

      if (!activityDoc.exists) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      if (activityDoc.data().case_id !== caseId) {
        return res.status(400).json({ error: 'Activity does not belong to this case' });
      }

      await activityRef.delete();

      return res.status(200).json({
        message: 'Activity deleted successfully',
        activityId,
      });
    } catch (error) {
      console.error('Error deleting activity:', error);
      return res
        .status(500)
        .json({ error: error.message || 'Failed to delete activity' });
    }
  }
);

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
