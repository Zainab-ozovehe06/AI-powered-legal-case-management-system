import express from 'express';
import { admin, db } from '../config/firebase.js';
import {
  requireAdminRole,
  requireAuth,
} from '../middleware/authenticate.js';
import {
  getActorId,
  normalizeIdArray,
  normalizeText,
} from '../utils/groupCollaboration.js';
import { assignLawyerToCase } from '../utils/lawyerAssignment.js';

const router = express.Router();

const getMemberIdsFromGroupData = (groupData) => {
  const ids = [];
  const memberFields = [
    groupData?.member_ids,
    groupData?.student_ids,
    groupData?.members,
  ];

  memberFields.forEach((field) => {
    if (!Array.isArray(field)) return;

    field.forEach((member) => {
      if (typeof member === 'string') {
        ids.push(member);
        return;
      }

      ids.push(
        member?.user_id ||
          member?.student_id ||
          member?.uid 
      );
    });
  });

  return normalizeIdArray(ids);
};

const getGroupMemberIds = async (groupId, groupData) => {
  let memberIds = getMemberIdsFromGroupData(groupData);

  if (!memberIds.length) {
    const memberSnapshot = await db
      .collection('group_members')
      .where('group_id', '==', groupId)
      .get();

    memberIds = memberSnapshot.docs.map((doc) => doc.data()?.user_id);
  }

  if (!normalizeIdArray(memberIds).length) {
    return [];
  }

  return normalizeIdArray(
    groupData?.leader_id ? [...memberIds, groupData.leader_id] : memberIds
  );
};

const getSupervisorName = (supervisor) =>
  normalizeText(supervisor?.name) ||
  normalizeText(supervisor?.email) ||
  'Supervisor';

router.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({
    message: 'Current user fetched successfully',
    user: req.currentUser,
  });
});

// PATCH /api/admin/cases/:caseId/assign-lawyer
router.patch(
  '/cases/:caseId/assign-lawyer',
  requireAuth,
  requireAdminRole,
  async (req, res) => {
    try {
      const { caseId } = req.params;
      const actorId = getActorId(req);
      const lawyerId = normalizeText(req.body?.lawyer_id || req.body?.lawyerId);
      const result = await assignLawyerToCase({ caseId, lawyerId, actorId });

      return res.status(200).json(result);
    } catch (error) {
      console.error('Failed to assign lawyer to case', error);
      return res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to assign lawyer to case',
      });
    }
  }
);

// PATCH /api/admin/groups/:groupId/assign-supervisor
router.patch(
  '/groups/:groupId/assign-supervisor',
  requireAuth,
  requireAdminRole,
  async (req, res) => {
    try {
      const { groupId } = req.params;
      const actorId = getActorId(req);
      const supervisorId = normalizeText(req.body?.supervisorId);

      if (!actorId) {
        return res.status(401).json({ error: 'Authenticated user ID missing' });
      }

      if (!supervisorId) {
        return res.status(400).json({ error: 'supervisorId is required' });
      }

      const groupRef = db.collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const groupData = groupDoc.data();
      const memberIds = await getGroupMemberIds(groupId, groupData);

      if (!memberIds.length) {
        return res.status(400).json({
          error:
            'Group must include members in member_ids, student_ids, members, or group_members',
        });
      }

      const supervisorRef = db.collection('users').doc(supervisorId);
      const supervisorDoc = await supervisorRef.get();

      if (!supervisorDoc.exists) {
        return res.status(404).json({ error: 'Supervisor not found' });
      }

      const supervisor = supervisorDoc.data();

      if (supervisor.role !== 'supervisor') {
        return res.status(400).json({ error: 'Selected user is not a supervisor' });
      }

      const studentDocs = await Promise.all(
        memberIds.map((memberId) => db.collection('users').doc(memberId).get())
      );
      const missingStudentIds = studentDocs
        .filter((studentDoc) => !studentDoc.exists)
        .map((studentDoc, index) => memberIds[index]);

      if (missingStudentIds.length) {
        return res.status(404).json({
          error: 'One or more group students were not found',
          missingStudentIds,
        });
      }

      const invalidStudentIds = studentDocs
        .filter((studentDoc) => studentDoc.data()?.role !== 'law_student')
        .map((studentDoc) => studentDoc.id);

      if (invalidStudentIds.length) {
        return res.status(400).json({
          error: 'Group members must have role law_student',
          invalidStudentIds,
        });
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const supervisorName = getSupervisorName(supervisor);
      const groupName = normalizeText(groupData?.name) || groupId;
      const batch = db.batch();

      batch.update(groupRef, {
        supervisor_id: supervisorId,
        supervisor_name: supervisorName,
        supervisor_assigned_at: now,
        supervisor_assigned_by: actorId,
        updated_at: now,
      });

      studentDocs.forEach((studentDoc) => {
        batch.update(studentDoc.ref, {
          group_id: groupId,
          group_name: groupName,
          supervisor_id: supervisorId,
          supervisor_name: supervisorName,
          supervisor_assigned_at: now,
          supervisor_assigned_by: actorId,
          updated_at: now,
        });
      });

      await batch.commit();

      return res.status(200).json({
        message: 'Supervisor assigned to group successfully',
        groupId,
        supervisorId,
        updatedStudentsCount: studentDocs.length,
      });
    } catch (error) {
      console.error('Failed to assign supervisor to group', error);
      return res.status(500).json({
        error: error.message || 'Failed to assign supervisor to group',
      });
    }
  }
);

export default router;
