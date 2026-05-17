import { db } from '../config/firebase.js';
import {
  getActorId,
  isCaseAssignedToGroup,
  isCaseDeleted,
  normalizeText,
} from '../utils/groupCollaboration.js';

const requireGroupLeaderForCase = async (req, res, next) => {
  try {
    const actorId = getActorId(req);
    const { caseId } = req.params;
    const groupId = normalizeText(req.body?.group_id || req.query?.group_id);

    if (!req.currentUser || !actorId) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    if (!groupId) {
      return res.status(400).json({ error: 'group_id is required' });
    }

    const [caseDoc, groupDoc] = await Promise.all([
      db.collection('cases').doc(caseId).get(),
      db.collection('groups').doc(groupId).get(),
    ]);

    if (!caseDoc.exists || isCaseDeleted(caseDoc.data())) {
      return res.status(404).json({ error: 'Case not found' });
    }

    if (!groupDoc.exists) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const caseAssignedToGroup = await isCaseAssignedToGroup(caseId, groupId);

    if (!caseAssignedToGroup) {
      return res.status(403).json({ error: 'This case is not assigned to that group' });
    }

    if (groupDoc.data().leader_id !== actorId) {
      return res.status(403).json({
        error: 'Only the group leader can submit the group reflection',
      });
    }

    req.groupLeaderAccess = {
      caseDoc,
      groupDoc,
      groupId,
    };

    return next();
  } catch (error) {
    console.error('Error checking group leader access:', error);
    return res.status(500).json({ error: 'Failed to verify group leader access' });
  }
};

export default requireGroupLeaderForCase;
