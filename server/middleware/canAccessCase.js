import { db } from '../config/firebase.js';

const canAccessCase = async (req, res, next) => {
  try {
    const { caseId } = req.params;
    const currentUser = req.currentUser;

    if (!currentUser) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }

    // Admin can access any case
    if (currentUser.role === 'admin') {
      return next();
    }

    // Law student can access only assigned cases
    if (currentUser.role === 'law_student') {
      const assignmentSnap = await db
        .collection('case_assignments')
        .where('case_id', '==', caseId)
        .where('user_id', '==', currentUser.uid)
        .limit(1)
        .get();

      if (assignmentSnap.empty) {
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