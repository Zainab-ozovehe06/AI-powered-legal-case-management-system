import express from 'express';
import { admin, db } from '../config/firebase.js';
import {
  requireAdminRole,
  requireAuth,
  requireStudentRole,
} from '../middleware/authenticate.js';
import {
  getActorId,
  getGroupMemberDocId,
  getMembership,
  GROUP_MEMBER_ROLE,
  normalizeIdArray,
  normalizeText,
  serializeGroup,
  assertLawStudentUser,
} from '../utils/groupCollaboration.js';

const router = express.Router();

const GROUP_STATUSES = new Set(['active', 'inactive']);

const getGroupOr404 = async (groupId) => {
  const groupDoc = await db.collection('groups').doc(groupId).get();

  if (!groupDoc.exists) {
    const error = new Error('Group not found');
    error.statusCode = 404;
    throw error;
  }

  return groupDoc;
};

const validateLawStudentIds = async (userIds) => {
  const uniqueUserIds = normalizeIdArray(userIds);
  const users = await Promise.all(uniqueUserIds.map(assertLawStudentUser));

  return users;
};

const handleRouteError = (res, error, fallbackMessage) => {
  console.error(fallbackMessage, error);

  return res.status(error.statusCode || 500).json({
    error: error.statusCode ? error.message : fallbackMessage,
  });
};

// POST /api/groups
router.post('/', requireAuth, requireAdminRole, async (req, res) => {
  try {
    const actorId = getActorId(req);
    const name = normalizeText(req.body?.name);
    const description = normalizeText(req.body?.description);
    const leaderId = normalizeText(req.body?.leader_id);
    const requestedMemberIds = normalizeIdArray(req.body?.member_ids);

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    if (!leaderId) {
      return res.status(400).json({ error: 'Group leader is required' });
    }

    await assertLawStudentUser(leaderId);

    const allMemberIds = normalizeIdArray([leaderId, ...requestedMemberIds]);
    await validateLawStudentIds(allMemberIds);

    const groupRef = db.collection('groups').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    batch.set(groupRef, {
      name,
      description,
      leader_id: leaderId,
      created_by: actorId,
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    allMemberIds.forEach((userId) => {
      const memberRef = db
        .collection('group_members')
        .doc(getGroupMemberDocId(groupRef.id, userId));

      batch.set(memberRef, {
        group_id: groupRef.id,
        user_id: userId,
        role_in_group:
          userId === leaderId ? GROUP_MEMBER_ROLE.LEADER : GROUP_MEMBER_ROLE.MEMBER,
        added_by: actorId,
        joined_at: now,
      });
    });

    await batch.commit();

    const createdGroup = await groupRef.get();

    return res.status(201).json({
      message: 'Group created successfully',
      group: await serializeGroup(createdGroup),
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to create group');
  }
});

// GET /api/groups
router.get('/', requireAuth, requireAdminRole, async (req, res) => {
  try {
    const snapshot = await db.collection('groups').get();
    const groups = await Promise.all(
      snapshot.docs.map((groupDoc) => serializeGroup(groupDoc))
    );

    groups.sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json(groups);
  } catch (error) {
    return handleRouteError(res, error, 'Failed to fetch groups');
  }
});

// GET /api/groups/my-groups
router.get('/my-groups', requireAuth, requireStudentRole, async (req, res) => {
  try {
    const actorId = getActorId(req);

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    const membershipSnap = await db
      .collection('group_members')
      .where('user_id', '==', actorId)
      .get();

    const groupDocs = await Promise.all(
      membershipSnap.docs.map((memberDoc) =>
        db.collection('groups').doc(memberDoc.data().group_id).get()
      )
    );

    const groups = await Promise.all(
      groupDocs
        .filter((groupDoc) => groupDoc.exists)
        .map((groupDoc) => serializeGroup(groupDoc, actorId))
    );

    groups.sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json(groups);
  } catch (error) {
    return handleRouteError(res, error, 'Failed to fetch your groups');
  }
});

// GET /api/groups/:groupId
router.get('/:groupId', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const actorId = getActorId(req);
    const groupDoc = await getGroupOr404(groupId);

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    if (req.currentUser.role !== 'admin') {
      const membership = await getMembership(groupId, actorId);

      if (!membership) {
        return res.status(403).json({ error: 'You are not a member of this group' });
      }
    }

    return res.status(200).json(await serializeGroup(groupDoc, actorId));
  } catch (error) {
    return handleRouteError(res, error, 'Failed to fetch group');
  }
});

// POST /api/groups/:groupId/members
router.post('/:groupId/members', requireAuth, requireAdminRole, async (req, res) => {
  try {
    const { groupId } = req.params;
    const actorId = getActorId(req);
    const memberIds = normalizeIdArray(req.body?.member_ids);

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    if (!memberIds.length) {
      return res.status(400).json({ error: 'member_ids must include at least one user' });
    }

    const groupDoc = await getGroupOr404(groupId);
    await validateLawStudentIds(memberIds);

    const existingChecks = await Promise.all(
      memberIds.map(async (userId) => ({
        userId,
        membership: await getMembership(groupId, userId),
      }))
    );
    const duplicateUserIds = existingChecks
      .filter((item) => item.membership)
      .map((item) => item.userId);

    if (duplicateUserIds.length) {
      return res.status(409).json({
        error: 'One or more students are already members of this group',
        duplicate_user_ids: duplicateUserIds,
      });
    }

    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    memberIds.forEach((userId) => {
      batch.set(db.collection('group_members').doc(getGroupMemberDocId(groupId, userId)), {
        group_id: groupId,
        user_id: userId,
        role_in_group: GROUP_MEMBER_ROLE.MEMBER,
        added_by: actorId,
        joined_at: now,
      });
    });

    await batch.commit();

    return res.status(200).json({
      message: 'Group members added successfully',
      group: await serializeGroup(groupDoc),
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to add group members');
  }
});

// DELETE /api/groups/:groupId/members/:userId
router.delete(
  '/:groupId/members/:userId',
  requireAuth,
  requireAdminRole,
  async (req, res) => {
    try {
      const { groupId, userId } = req.params;
      const groupDoc = await getGroupOr404(groupId);

      if (groupDoc.data().leader_id === userId) {
        return res.status(409).json({
          error: 'Assign another leader before removing the current group leader',
        });
      }

      const memberRef = db
        .collection('group_members')
        .doc(getGroupMemberDocId(groupId, userId));
      const memberDoc = await memberRef.get();

      if (!memberDoc.exists) {
        return res.status(404).json({ error: 'Group member not found' });
      }

      await memberRef.delete();

      const updatedGroup = await getGroupOr404(groupId);

      return res.status(200).json({
        message: 'Group member removed successfully',
        group: await serializeGroup(updatedGroup),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Failed to remove group member');
    }
  }
);

// PATCH /api/groups/:groupId/leader
router.patch('/:groupId/leader', requireAuth, requireAdminRole, async (req, res) => {
  try {
    const { groupId } = req.params;
    const actorId = getActorId(req);
    const leaderId = normalizeText(req.body?.leader_id);

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    if (!leaderId) {
      return res.status(400).json({ error: 'leader_id is required' });
    }

    const groupDoc = await getGroupOr404(groupId);
    await assertLawStudentUser(leaderId);

    const members = await db
      .collection('group_members')
      .where('group_id', '==', groupId)
      .get();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    members.docs.forEach((memberDoc) => {
      const member = memberDoc.data();

      if (
        member.role_in_group === GROUP_MEMBER_ROLE.LEADER &&
        member.user_id !== leaderId
      ) {
        batch.update(memberDoc.ref, {
          role_in_group: GROUP_MEMBER_ROLE.MEMBER,
        });
      }
    });

    const newLeaderRef = db
      .collection('group_members')
      .doc(getGroupMemberDocId(groupId, leaderId));
    const newLeaderDoc = await newLeaderRef.get();

    if (newLeaderDoc.exists) {
      batch.update(newLeaderRef, {
        role_in_group: GROUP_MEMBER_ROLE.LEADER,
      });
    } else {
      batch.set(newLeaderRef, {
        group_id: groupId,
        user_id: leaderId,
        role_in_group: GROUP_MEMBER_ROLE.LEADER,
        added_by: actorId,
        joined_at: now,
      });
    }

    batch.update(groupDoc.ref, {
      leader_id: leaderId,
      updated_at: now,
    });

    await batch.commit();

    const updatedGroup = await getGroupOr404(groupId);

    return res.status(200).json({
      message: 'Group leader updated successfully',
      group: await serializeGroup(updatedGroup),
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to update group leader');
  }
});

// PATCH /api/groups/:groupId/status
router.patch('/:groupId/status', requireAuth, requireAdminRole, async (req, res) => {
  try {
    const { groupId } = req.params;
    const status = normalizeText(req.body?.status);
    const groupDoc = await getGroupOr404(groupId);

    if (!GROUP_STATUSES.has(status)) {
      return res.status(400).json({
        error: 'Invalid status. Use active or inactive',
      });
    }

    await groupDoc.ref.update({
      status,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updatedGroup = await getGroupOr404(groupId);

    return res.status(200).json({
      message: 'Group status updated successfully',
      group: await serializeGroup(updatedGroup),
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to update group status');
  }
});

export default router;
