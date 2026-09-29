import { db } from '../config/firebase.js';
import {
  canStudentAccessCase,
  getActorId,
  getDirectCaseIdsForUser,
  isCaseDeleted,
} from '../utils/groupCollaboration.js';

const canAccessCase = async (req, res, next) => {
  try {
    const { caseId } = req.params;
    const currentUser = req.currentUser;
    const actorId = getActorId(req);

    if (!currentUser || !actorId) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }

    if (currentUser.role === 'admin') {
      return next();
    }

    if (currentUser.role === 'law_student') {
      const caseDoc = await db.collection('cases').doc(caseId).get();

      if (!caseDoc.exists || isCaseDeleted(caseDoc.data())) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const hasAccess = await canStudentAccessCase(actorId, caseId, caseDoc.data());

      if (!hasAccess) {
        return res.status(403).json({ error: 'You are not assigned to this case' });
      }

      return next();
    }

    if (currentUser.role === 'lawyer') {
      const caseDoc = await db.collection('cases').doc(caseId).get();

      if (!caseDoc.exists || isCaseDeleted(caseDoc.data())) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const visibleCaseIds = await getDirectCaseIdsForUser(actorId);

      if (!visibleCaseIds.includes(caseId)) {
        return res.status(403).json({ error: 'You are not assigned to this case' });
      }

      return next();
    }

    return res.status(403).json({ error: 'Access denied' });
  } catch (error) {
    console.error('Error checking case access:', error);
    return res.status(500).json({ error: 'Failed to verify case access' });
  }
};

export default canAccessCase;
