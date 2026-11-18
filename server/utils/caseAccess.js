import { db } from '../config/firebase.js';
import {
  ASSIGNMENT_TYPE, canStudentAccessCase, getDirectCaseIdsForUser,
  getGroupMembers, getUsersByIds, getVisibleCaseIdsForStudent, isCaseDeleted,
} from './groupCollaboration.js';

// Supervision comes from current, active groups and current student membership.
// Cached supervisor_id/group_id fields on user profiles are never authority.
export const getSupervisionScope = async (user, groupId = null) => {
  const snapshot = await db.collection('groups').where('supervisor_id', '==', user.uid).get();
  const groups = snapshot.docs.filter((doc) => doc.data().status !== 'inactive' && (!groupId || doc.id === groupId));
  const memberships = (await Promise.all(groups.map((doc) => getGroupMembers(doc.id)))).flat();
  const users = await getUsersByIds(memberships.map((member) => member.user_id));
  const studentIds = [...new Set(memberships.map((member) => member.user_id))]
    .filter((id) => users[id]?.role === 'law_student' && users[id]?.status === 'active');
  const studentIdsByGroup = new Map(groups.map((doc) => [doc.id,
    memberships.filter((member) => member.group_id === doc.id && studentIds.includes(member.user_id)).map((member) => member.user_id),
  ]));
  return { groupIds: groups.map((doc) => doc.id), studentIds, studentIdsByGroup };
};

export const getVisibleCaseIdsForSupervisor = async (user, groupId = null, studentId = null) => {
  const scope = await getSupervisionScope(user, groupId);
  if (studentId && !scope.studentIds.includes(studentId)) return [];
  const students = studentId ? [studentId] : scope.studentIds;
  if (!students.length) return [];
  const [studentCases, groupAssignments] = await Promise.all([
    Promise.all(students.map(async (id) => {
      const [assigned, created] = await Promise.all([
        getDirectCaseIdsForUser(id), db.collection('cases').where('created_by_student_id', '==', id).get(),
      ]);
      return [...assigned, ...created.docs.map((doc) => doc.id)];
    })),
    Promise.all(scope.groupIds.map(async (id) => {
      if (!scope.studentIdsByGroup.get(id)?.length) return [];
      // When filtering a student, include only groups they actually belong to.
      if (studentId && !scope.studentIdsByGroup.get(id).includes(studentId)) return [];
      const assignments = await db.collection('case_assignments').where('group_id', '==', id).get();
      return assignments.docs.filter((doc) => doc.data().assigned_to_type === ASSIGNMENT_TYPE.GROUP).map((doc) => doc.data().case_id);
    })),
  ]);
  return [...new Set([...studentCases.flat(), ...groupAssignments.flat()].filter(Boolean))];
};

export const getVisibleCaseIds = async (user) => {
  if (user.role === 'law_student') return getVisibleCaseIdsForStudent(user.uid);
  if (user.role === 'lawyer') {
    const snapshot = await db.collection('case_assignments').where('user_id', '==', user.uid).get();
    const direct = snapshot.docs.map((doc) => doc.data()).filter((item) =>
      item.assigned_to_type === undefined || item.assigned_to_type === ASSIGNMENT_TYPE.USER);
    const legacy = direct.filter((item) => !item.assignment_role);
    const assigners = await getUsersByIds(legacy.map((item) => item.assigned_by || item.assigned_by_user_id));
    return [...new Set(direct.filter((item) => item.assignment_role === 'lawyer' ||
      (!item.assignment_role && assigners[item.assigned_by || item.assigned_by_user_id]?.role === 'admin'))
      .map((item) => item.case_id).filter(Boolean))];
  }
  if (user.role === 'supervisor') return getVisibleCaseIdsForSupervisor(user);
  return [];
};

export const canUserAccessCase = async (user, caseId, caseData) => {
  if (!user?.uid || !caseId) return false;
  if (user.role === 'admin') return true;
  if (isCaseDeleted(caseData)) return false;
  if (user.role === 'law_student') return canStudentAccessCase(user.uid, caseId, caseData);
  return (await getVisibleCaseIds(user)).includes(caseId);
};
