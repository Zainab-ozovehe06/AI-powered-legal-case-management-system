import { admin, db } from '../config/firebase.js';

export const GROUP_MEMBER_ROLE = {
  LEADER: 'leader',
  MEMBER: 'member',
};

export const ASSIGNMENT_TYPE = {
  USER: 'user',
  GROUP: 'group',
};

export const getActorId = (req) => req.currentUser?.uid || req.currentUser?.user_id;

export const normalizeText = (value) => (value || '').toString().trim();

export const normalizeIdArray = (value) => {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map((item) => normalizeText(item)).filter(Boolean))];
};

export const getGroupMemberDocId = (groupId, userId) => `${groupId}_${userId}`;

export const isCaseDeleted = (caseData) => caseData?.is_deleted === true;

export const assertLawStudentUser = async (userId) => {
  const safeUserId = normalizeText(userId);

  if (!safeUserId) {
    const error = new Error('Student user ID is required');
    error.statusCode = 400;
    throw error;
  }

  const userDoc = await db.collection('users').doc(safeUserId).get();

  if (!userDoc.exists) {
    const error = new Error('Student user not found');
    error.statusCode = 404;
    throw error;
  }

  const userData = userDoc.data();

  if (userData.role !== 'law_student') {
    const error = new Error('Only users with role law_student can be group members');
    error.statusCode = 400;
    throw error;
  }

  return {
    id: userDoc.id,
    ...userData,
  };
};

export const getUsersByIds = async (userIds) => {
  const uniqueUserIds = normalizeIdArray(userIds);
  const docs = await Promise.all(
    uniqueUserIds.map((userId) => db.collection('users').doc(userId).get())
  );
  const usersById = {};

  docs.forEach((doc) => {
    if (doc.exists) {
      usersById[doc.id] = {
        id: doc.id,
        ...doc.data(),
      };
    }
  });

  return usersById;
};

export const getUserDisplayName = (user) =>
  normalizeText(user?.name) ||
  normalizeText(user?.displayName) ||
  normalizeText(user?.email) ||
  'Unnamed user';

export const getGroupMembers = async (groupId) => {
  const snapshot = await db
    .collection('group_members')
    .where('group_id', '==', groupId)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const getMembership = async (groupId, userId) => {
  if (!groupId || !userId) return null;

  const memberDoc = await db
    .collection('group_members')
    .doc(getGroupMemberDocId(groupId, userId))
    .get();

  if (!memberDoc.exists) return null;

  return {
    id: memberDoc.id,
    ...memberDoc.data(),
  };
};

export const isUserInGroup = async (userId, groupId) => {
  const membership = await getMembership(groupId, userId);
  return Boolean(membership);
};

export const isGroupLeader = async (userId, groupId) => {
  const groupDoc = await db.collection('groups').doc(groupId).get();
  return groupDoc.exists && groupDoc.data()?.leader_id === userId;
};

export const isCaseAssignedToGroup = async (caseId, groupId) => {
  if (!caseId || !groupId) return false;

  const snapshot = await db
    .collection('case_assignments')
    .where('group_id', '==', groupId)
    .get();

  return snapshot.docs.some((doc) => {
    const assignment = doc.data();
    return (
      assignment.case_id === caseId &&
      assignment.assigned_to_type === ASSIGNMENT_TYPE.GROUP
    );
  });
};

export const getGroupIdsForUser = async (userId) => {
  const snapshot = await db
    .collection('group_members')
    .where('user_id', '==', userId)
    .get();

  return [
    ...new Set(
      snapshot.docs
        .map((doc) => normalizeText(doc.data()?.group_id))
        .filter(Boolean)
    ),
  ];
};

export const getDirectCaseIdsForUser = async (userId) => {
  const snapshot = await db
    .collection('case_assignments')
    .where('user_id', '==', userId)
    .get();

  return snapshot.docs
    .map((doc) => doc.data())
    .filter(
      (assignment) =>
        assignment.assigned_to_type === undefined ||
        assignment.assigned_to_type === ASSIGNMENT_TYPE.USER
    )
    .map((assignment) => normalizeText(assignment.case_id))
    .filter(Boolean);
};

export const getGroupCaseIdsForUser = async (userId) => {
  const groupIds = await getGroupIdsForUser(userId);

  if (!groupIds.length) return [];

  const assignmentSnapshots = await Promise.all(
    groupIds.map((groupId) =>
      db.collection('case_assignments').where('group_id', '==', groupId).get()
    )
  );

  return assignmentSnapshots
    .flatMap((snapshot) => snapshot.docs.map((doc) => doc.data()))
    .filter((assignment) => assignment.assigned_to_type === ASSIGNMENT_TYPE.GROUP)
    .map((assignment) => normalizeText(assignment.case_id))
    .filter(Boolean);
};

export const getVisibleCaseIdsForStudent = async (userId) => {
  const [directCaseIds, groupCaseIds, createdCasesSnap] = await Promise.all([
    getDirectCaseIdsForUser(userId),
    getGroupCaseIdsForUser(userId),
    db.collection('cases').where('created_by_student_id', '==', userId).get(),
  ]);

  const createdCaseIds = createdCasesSnap.docs.map((doc) => doc.id);

  return [...new Set([...directCaseIds, ...groupCaseIds, ...createdCaseIds])];
};

export const canStudentAccessCase = async (userId, caseId, caseData = null) => {
  if (!userId || !caseId) return false;

  if (caseData?.created_by_student_id === userId) {
    return true;
  }

  const visibleCaseIds = await getVisibleCaseIdsForStudent(userId);
  return visibleCaseIds.includes(caseId);
};

export const getAssignedGroupsForCase = async (caseId, viewerUserId = null) => {
  const assignmentSnap = await db
    .collection('case_assignments')
    .where('case_id', '==', caseId)
    .get();

  const groupIds = [
    ...new Set(
      assignmentSnap.docs
        .map((doc) => doc.data())
        .filter((assignment) => assignment.assigned_to_type === ASSIGNMENT_TYPE.GROUP)
        .map((assignment) => normalizeText(assignment.group_id))
        .filter(Boolean)
    ),
  ];

  if (!groupIds.length) return [];

  const groupDocs = await Promise.all(
    groupIds.map((groupId) => db.collection('groups').doc(groupId).get())
  );
  const membersByGroup = await Promise.all(groupIds.map(getGroupMembers));
  const allUserIds = [
    ...new Set(
      membersByGroup
        .flat()
        .map((member) => member.user_id)
        .concat(groupDocs.map((doc) => doc.data()?.leader_id))
        .filter(Boolean)
    ),
  ];
  const usersById = await getUsersByIds(allUserIds);

  return groupDocs
    .map((groupDoc, index) => {
      if (!groupDoc.exists) return null;

      const groupData = groupDoc.data();
      const members = membersByGroup[index]
        .map((member) => {
          const user = usersById[member.user_id] || null;

          return {
            ...member,
            user,
            user_name: getUserDisplayName(user),
            user_email: user?.email || null,
          };
        })
        .sort((a, b) => {
          if (a.role_in_group === GROUP_MEMBER_ROLE.LEADER) return -1;
          if (b.role_in_group === GROUP_MEMBER_ROLE.LEADER) return 1;
          return a.user_name.localeCompare(b.user_name);
        });

      const leader = usersById[groupData.leader_id] || null;
      const currentMember = viewerUserId
        ? members.find((member) => member.user_id === viewerUserId)
        : null;

      return {
        id: groupDoc.id,
        ...groupData,
        leader,
        leader_name: getUserDisplayName(leader),
        members,
        member_count: members.length,
        current_user_role: currentMember?.role_in_group || null,
      };
    })
    .filter(Boolean);
};

export const serializeGroup = async (groupDoc, viewerUserId = null) => {
  const groupData = groupDoc.data();
  const members = await getGroupMembers(groupDoc.id);
  const usersById = await getUsersByIds(
    members.map((member) => member.user_id).concat(groupData.leader_id)
  );
  const leader = usersById[groupData.leader_id] || null;
  const serializedMembers = members
    .map((member) => {
      const user = usersById[member.user_id] || null;

      return {
        ...member,
        user,
        user_name: getUserDisplayName(user),
        user_email: user?.email || null,
      };
    })
    .sort((a, b) => {
      if (a.role_in_group === GROUP_MEMBER_ROLE.LEADER) return -1;
      if (b.role_in_group === GROUP_MEMBER_ROLE.LEADER) return 1;
      return a.user_name.localeCompare(b.user_name);
    });

  const currentMember = viewerUserId
    ? serializedMembers.find((member) => member.user_id === viewerUserId)
    : null;

  return {
    id: groupDoc.id,
    ...groupData,
    leader,
    leader_name: getUserDisplayName(leader),
    members: serializedMembers,
    member_count: serializedMembers.length,
    current_user_role: currentMember?.role_in_group || null,
  };
};

export const addActivity = async ({ caseId, actorId, description, type }) => {
  if (!caseId || !actorId || !description) return;

  await db.collection('activities').add({
    case_id: caseId,
    court_name: null,
    description,
    logged_by_user_id: actorId,
    logged_at: admin.firestore.FieldValue.serverTimestamp(),
    type,
  });
};
