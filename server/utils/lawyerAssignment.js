import { admin, db } from '../config/firebase.js';
import {
  ASSIGNMENT_TYPE,
  getUserDisplayName,
  isCaseDeleted,
  normalizeText,
} from './groupCollaboration.js';

export const assignLawyerToCase = async ({ caseId, lawyerId, actorId }) => {
  const safeCaseId = normalizeText(caseId);
  const safeLawyerId = normalizeText(lawyerId);
  const safeActorId = normalizeText(actorId);

  if (!safeActorId) {
    const error = new Error('Authenticated user ID missing');
    error.statusCode = 401;
    throw error;
  }

  if (!safeCaseId) {
    const error = new Error('caseId is required');
    error.statusCode = 400;
    throw error;
  }

  if (!safeLawyerId) {
    const error = new Error('lawyer_id is required');
    error.statusCode = 400;
    throw error;
  }

  const [caseDoc, lawyerDoc] = await Promise.all([
    db.collection('cases').doc(safeCaseId).get(),
    db.collection('users').doc(safeLawyerId).get(),
  ]);

  if (!caseDoc.exists) {
    const error = new Error('Case not found');
    error.statusCode = 404;
    throw error;
  }

  if (isCaseDeleted(caseDoc.data())) {
    const error = new Error(
      'Case has been deleted. Restore it before assigning a lawyer.'
    );
    error.statusCode = 409;
    throw error;
  }

  if (!lawyerDoc.exists) {
    const error = new Error('Lawyer not found');
    error.statusCode = 404;
    throw error;
  }

  const lawyer = {
    id: lawyerDoc.id,
    ...lawyerDoc.data(),
  };

  if (lawyer.role !== 'lawyer') {
    const error = new Error('Selected user is not a lawyer');
    error.statusCode = 400;
    throw error;
  }

  const lawyerName = getUserDisplayName(lawyer);
  const lawyerEmail = lawyer.email || null;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const assignmentSnapshot = await db
    .collection('case_assignments')
    .where('case_id', '==', safeCaseId)
    .get();
  const lawyerAssignmentDocs = assignmentSnapshot.docs.filter((doc) => {
    const assignment = doc.data();

    return (
      assignment.assigned_to_type === ASSIGNMENT_TYPE.USER &&
      assignment.assignment_role === 'lawyer'
    );
  });
  const existingAssignment = lawyerAssignmentDocs.find(
    (doc) => doc.data()?.user_id === safeLawyerId
  );
  const assignment = {
    case_id: safeCaseId,
    assigned_to_type: ASSIGNMENT_TYPE.USER,
    assignment_role: 'lawyer',
    user_id: safeLawyerId,
    group_id: null,
    assigned_by: safeActorId,
    assigned_by_user_id: safeActorId,
    assigned_at: now,
  };
  const assignmentRef =
    existingAssignment?.ref || db.collection('case_assignments').doc();
  const batch = db.batch();

  lawyerAssignmentDocs
    .filter((doc) => doc.id !== existingAssignment?.id)
    .forEach((doc) => batch.delete(doc.ref));

  if (existingAssignment) {
    batch.update(assignmentRef, assignment);
  } else {
    batch.set(assignmentRef, assignment);
  }

  batch.update(caseDoc.ref, {
    assigned_lawyer_id: safeLawyerId,
    assigned_lawyer_name: lawyerName,
    assigned_lawyer_email: lawyerEmail,
    assigned_lawyer_at: now,
    assigned_lawyer_by_user_id: safeActorId,
    updated_at: now,
  });

  batch.set(db.collection('activities').doc(), {
    case_id: safeCaseId,
    court_name: null,
    description: `Assigned lawyer: ${lawyerName}`,
    logged_by_user_id: safeActorId,
    logged_at: now,
    type: 'lawyer_assignment',
  });

  await batch.commit();

  return {
    message: 'Case assigned to lawyer successfully',
    assignmentId: assignmentRef.id,
    assignment: {
      id: assignmentRef.id,
      case_id: safeCaseId,
      assigned_to_type: ASSIGNMENT_TYPE.USER,
      assignment_role: 'lawyer',
      user_id: safeLawyerId,
      group_id: null,
      assigned_by: safeActorId,
      assigned_by_user_id: safeActorId,
    },
    case: {
      id: safeCaseId,
      assigned_lawyer_id: safeLawyerId,
      assigned_lawyer_name: lawyerName,
      assigned_lawyer_email: lawyerEmail,
    },
  };
};
