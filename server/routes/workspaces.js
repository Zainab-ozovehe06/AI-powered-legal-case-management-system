import express from 'express';
import { admin, db } from '../config/firebase.js';
import { requireAuth } from '../middleware/authenticate.js';
import {
  addActivity, canStudentAccessCase, getGroupMembers, getUsersByIds,
  getVisibleCaseIdsForStudent, isCaseAssignedToGroup,
} from '../utils/groupCollaboration.js';
import {
  getWorkspaceGroupIds, loadWorkspace, publicProfile, requiredText,
  validDate, workspaceError, workspaceManager,
} from '../utils/unitWorkspace.js';

const router = express.Router();
const now = () => admin.firestore.FieldValue.serverTimestamp();
const serialize = (doc) => ({ ...doc.data(), id: doc.id });
const millis = (value) => value?.toMillis?.() || (value?._seconds || value?.seconds || 0) * 1000;
const recent = (items) => items.sort((a, b) => millis(b.updated_at || b.submitted_at || b.created_at) - millis(a.updated_at || a.submitted_at || a.created_at));
const records = async (collection, groupId) => (await db.collection(collection).where('group_id', '==', groupId).get()).docs.map(serialize);
const route = (handler) => async (req, res) => {
  try { await handler(req, res); }
  catch (error) {
    if (!error.statusCode) console.error('Unit workspace error:', error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Unable to load or update the unit workspace' });
  }
};
const access = (req, write = false) => loadWorkspace(req.params.groupId, req.currentUser, { write });

const visibleReflections = async (groupId, user) => {
  const reflections = await records('group_reflections', groupId);
  let caseIds = user.role === 'law_student' && reflections.some((item) => item.case_id)
    ? await getVisibleCaseIdsForStudent(user.uid) : [];
  if (caseIds.length) {
    const referenced = new Set(reflections.map((item) => item.case_id).filter(Boolean));
    const docs = await Promise.all(caseIds.filter((id) => referenced.has(id)).map((id) => db.collection('cases').doc(id).get()));
    caseIds = docs.filter((doc) => doc.exists && !doc.data().is_deleted).map((doc) => doc.id);
  }
  return recent(reflections.filter((item) => {
    // Case-linked content keeps case-level protection even if a legacy record
    // accidentally has a unit visibility flag. Legacy reflections stay restricted.
    if (item.case_id && user.role !== 'admin' && !caseIds.includes(item.case_id)) return false;
    if (!item.case_id && item.visibility === 'unit') return true;
    return workspaceManager(user) || item.submitted_by === user.uid;
  }));
};

const membersFor = async (group) => {
  const memberships = await getGroupMembers(group.id);
  const users = await getUsersByIds([...memberships.map((member) => member.user_id), group.supervisor_id]);
  const members = memberships.map((member) => ({
    ...publicProfile(users[member.user_id], member.user_id),
    role_in_group: member.role_in_group,
    joined_at: member.joined_at || null,
  }));
  const supervisors = group.supervisor_id
    ? [publicProfile(users[group.supervisor_id], group.supervisor_id)] : [];
  return { members, supervisors };
};

router.get('/workspaces', requireAuth, route(async (req, res) => {
  const user = req.currentUser;
  if (!['admin', 'supervisor', 'law_student'].includes(user.role)) throw workspaceError(403, 'Access denied');
  const docs = user.role === 'admin'
    ? (await db.collection('groups').get()).docs
    : await Promise.all((await getWorkspaceGroupIds(user)).map((id) => db.collection('groups').doc(id).get()));
  res.json(docs.filter((doc) => doc.exists && (user.role === 'admin' || doc.data().status !== 'inactive'))
    .map((doc) => {
      const group = doc.data();
      return { id: doc.id, name: group.name, description: group.description || '', status: group.status,
        supervisor_name: group.supervisor_name || null };
    }).sort((a, b) => a.name.localeCompare(b.name)));
}));

router.get('/:groupId/workspace', requireAuth, route(async (req, res) => {
  const group = await access(req);
  const [people, reflections, posts, tasks, resources] = await Promise.all([
    membersFor(group), visibleReflections(group.id, req.currentUser),
    records('group_posts', group.id), records('group_tasks', group.id), records('group_resources', group.id),
  ]);
  // Use explicit safe fields: user profiles and confidential case documents are
  // never copied into the community or exposed through membership serialization.
  const feed = recent([
    ...posts.map((item) => ({ ...item, kind: 'post' })),
    ...reflections.filter((item) => item.visibility === 'unit' && !item.case_id).map((item) => ({ ...item, kind: 'reflection' })),
    ...tasks.map((item) => ({ ...item, kind: 'task' })),
    ...resources.map((item) => ({ ...item, kind: 'resource' })),
  ]);
  res.json({ group: { id: group.id, name: group.name, description: group.description || '', status: group.status,
    leader_id: group.leader_id, supervisor_id: group.supervisor_id || null, ...people },
  reflections, feed, tasks: recent(tasks), resources: recent(resources) });
}));

router.post('/:groupId/workspace/reflections', requireAuth, route(async (req, res) => {
  const group = await access(req, true);
  const user = req.currentUser;
  if (user.role !== 'law_student') throw workspaceError(403, 'Only students can submit reflections');
  const title = requiredText(req.body.title, 'Title', 200);
  const content = requiredText(req.body.content, 'Reflection', 20000);
  const visibility = req.body.visibility || 'restricted';
  if (!['unit', 'restricted'].includes(visibility)) throw workspaceError(400, 'Invalid reflection visibility');
  const caseId = typeof req.body.case_id === 'string' ? req.body.case_id.trim() : null;
  if (caseId) {
    if (visibility === 'unit') throw workspaceError(400, 'Case reflections must have restricted visibility');
    const caseDoc = await db.collection('cases').doc(caseId).get();
    if (!caseDoc.exists || caseDoc.data().is_deleted) throw workspaceError(404, 'Case not found');
    if (group.leader_id !== user.uid || !await isCaseAssignedToGroup(caseId, group.id)
      || !await canStudentAccessCase(user.uid, caseId, caseDoc.data())) {
      throw workspaceError(403, 'Only the leader of the assigned group can submit a case reflection');
    }
  }
  const ref = await db.collection('group_reflections').add({
    group_id: group.id, case_id: caseId || null, title, content, visibility,
    submitted_by: user.uid, author_name: publicProfile(user, user.uid).name,
    status: 'submitted', role: 'supervisor', supervisor_id: group.supervisor_id || null,
    submitted_at: now(), updated_at: now(),
  });
  if (caseId) await addActivity({ caseId, actorId: user.uid, description: `Submitted group reflection: ${title}`, type: 'group_reflection_submitted' });
  res.status(201).json(serialize(await ref.get()));
}));

router.patch('/:groupId/workspace/reflections/:itemId', requireAuth, route(async (req, res) => {
  const group = await access(req, true);
  const reflection = (await visibleReflections(group.id, req.currentUser)).find((item) => item.id === req.params.itemId);
  if (!reflection) throw workspaceError(404, 'Reflection not found');
  if (req.currentUser.role === 'law_student') {
    if (req.body.status !== undefined || req.body.supervisor_feedback !== undefined) throw workspaceError(403, 'Only supervisors and administrators can review reports');
    if (reflection.submitted_by !== req.currentUser.uid) throw workspaceError(403, 'You can only edit your own reports');
    if (reflection.case_id && group.leader_id !== req.currentUser.uid) throw workspaceError(403, 'Only the group leader can resubmit case reflections');
    const visibility = req.body.visibility || reflection.visibility || 'restricted';
    if (!['unit', 'restricted'].includes(visibility) || (reflection.case_id && visibility !== 'restricted')) {
      throw workspaceError(400, 'Case reflections must stay restricted; select unit or restricted visibility for general reports');
    }
    await db.collection('group_reflections').doc(reflection.id).update({
      title: requiredText(req.body.title, 'Title', 200), content: requiredText(req.body.content, 'Reflection', 20000),
      visibility, status: 'submitted', resubmitted_at: now(), updated_at: now(),
    });
    if (reflection.case_id) await addActivity({ caseId: reflection.case_id, actorId: req.currentUser.uid, description: `Resubmitted group reflection: ${req.body.title.trim()}`, type: 'group_reflection_resubmitted' });
    return res.json({ message: 'Report resubmitted' });
  }
  if (!workspaceManager(req.currentUser)) throw workspaceError(403, 'Only unit supervisors and administrators can review reports');
  if (!['reviewed', 'revision_requested'].includes(req.body.status)) throw workspaceError(400, 'Invalid review status');
  await db.collection('group_reflections').doc(reflection.id).update({ status: req.body.status,
    supervisor_feedback: requiredText(req.body.supervisor_feedback, 'Feedback'),
    reviewed_by: req.currentUser.uid, reviewer_name: publicProfile(req.currentUser, req.currentUser.uid).name,
    reviewed_at: now(), updated_at: now() });
  res.json({ message: 'Review saved' });
}));

router.post('/:groupId/workspace/posts', requireAuth, route(async (req, res) => {
  const group = await access(req, true);
  const postType = req.body.post_type || 'discussion';
  if (!['discussion', 'announcement'].includes(postType)) throw workspaceError(400, 'Invalid post type');
  if (postType === 'announcement' && !workspaceManager(req.currentUser) && group.leader_id !== req.currentUser.uid) {
    throw workspaceError(403, 'Only unit leaders and supervisors can publish announcements');
  }
  const ref = await db.collection('group_posts').add({ group_id: group.id,
    title: requiredText(req.body.title, 'Title', 200), content: requiredText(req.body.content, 'Post'), post_type: postType,
    created_by: req.currentUser.uid, author_name: publicProfile(req.currentUser, req.currentUser.uid).name,
    created_at: now(), updated_at: now() });
  res.status(201).json(serialize(await ref.get()));
}));

router.post('/:groupId/workspace/tasks', requireAuth, route(async (req, res) => {
  const group = await access(req, true);
  const assignee = req.body.assigned_to || req.currentUser.uid;
  const members = await getGroupMembers(group.id);
  if (!members.some((member) => member.user_id === assignee)) throw workspaceError(400, 'Assign the task to a current unit member');
  if (req.body.due_date && !validDate(req.body.due_date)) throw workspaceError(400, 'Invalid due date');
  const ref = await db.collection('group_tasks').add({ group_id: group.id,
    title: requiredText(req.body.title, 'Title', 200), content: req.body.content ? requiredText(req.body.content, 'Description') : '',
    assigned_to: assignee, due_date: req.body.due_date || null, status: 'todo',
    created_by: req.currentUser.uid, author_name: publicProfile(req.currentUser, req.currentUser.uid).name,
    created_at: now(), updated_at: now() });
  res.status(201).json(serialize(await ref.get()));
}));

router.patch('/:groupId/workspace/tasks/:itemId', requireAuth, route(async (req, res) => {
  const group = await access(req, true);
  const ref = db.collection('group_tasks').doc(req.params.itemId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().group_id !== group.id) throw workspaceError(404, 'Task not found');
  const task = doc.data();
  if (!workspaceManager(req.currentUser) && ![task.created_by, task.assigned_to].includes(req.currentUser.uid)) {
    throw workspaceError(403, 'Only the assignee, author or unit supervisor can update this task');
  }
  if (!['todo', 'in_progress', 'completed'].includes(req.body.status)) throw workspaceError(400, 'Invalid task status');
  await ref.update({ status: req.body.status, updated_by: req.currentUser.uid,
    updated_by_name: publicProfile(req.currentUser, req.currentUser.uid).name,
    completed_at: req.body.status === 'completed' ? now() : null, updated_at: now() });
  res.json(serialize(await ref.get()));
}));

router.post('/:groupId/workspace/resources', requireAuth, route(async (req, res) => {
  const group = await access(req, true);
  const url = requiredText(req.body.url, 'Resource URL', 2000);
  let parsed;
  try { parsed = new URL(url); } catch { throw workspaceError(400, 'Enter a valid resource URL'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw workspaceError(400, 'Use an HTTP or HTTPS resource URL without credentials');
  const ref = await db.collection('group_resources').add({ group_id: group.id,
    title: requiredText(req.body.title, 'Title', 200), url: parsed.href,
    content: req.body.content ? requiredText(req.body.content, 'Description') : '',
    created_by: req.currentUser.uid, author_name: publicProfile(req.currentUser, req.currentUser.uid).name,
    created_at: now(), updated_at: now() });
  res.status(201).json(serialize(await ref.get()));
}));

const commentTarget = async (req) => {
  const collections = { post: 'group_posts', reflection: 'group_reflections', task: 'group_tasks', resource: 'group_resources' };
  const collection = collections[req.params.kind];
  if (!collection) throw workspaceError(404, 'Discussion not found');
  const doc = await db.collection(collection).doc(req.params.itemId).get();
  if (!doc.exists || doc.data().group_id !== req.params.groupId) throw workspaceError(404, 'Discussion not found');
  if (req.params.kind === 'reflection' && (doc.data().visibility !== 'unit' || doc.data().case_id)) {
    throw workspaceError(403, 'This reflection is not shared with the unit');
  }
};

router.get('/:groupId/workspace/:kind/:itemId/comments', requireAuth, route(async (req, res) => {
  await access(req);
  await commentTarget(req);
  const comments = (await records('group_comments', req.params.groupId))
    .filter((item) => item.target_kind === req.params.kind && item.target_id === req.params.itemId);
  res.json(comments.sort((a, b) => millis(a.created_at) - millis(b.created_at)));
}));

router.post('/:groupId/workspace/:kind/:itemId/comments', requireAuth, route(async (req, res) => {
  await access(req, true);
  await commentTarget(req);
  const ref = await db.collection('group_comments').add({ group_id: req.params.groupId,
    target_kind: req.params.kind, target_id: req.params.itemId,
    content: requiredText(req.body.content, 'Comment', 4000), created_by: req.currentUser.uid,
    author_name: publicProfile(req.currentUser, req.currentUser.uid).name,
    author_role: req.currentUser.role, created_at: now() });
  res.status(201).json(serialize(await ref.get()));
}));

router.delete('/:groupId/workspace/:kind/:itemId', requireAuth, route(async (req, res) => {
  await access(req, true);
  const collection = { posts: 'group_posts', tasks: 'group_tasks', resources: 'group_resources' }[req.params.kind];
  if (!collection) throw workspaceError(404, 'Item not found');
  const ref = db.collection(collection).doc(req.params.itemId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().group_id !== req.params.groupId) throw workspaceError(404, 'Item not found');
  if (!workspaceManager(req.currentUser) && doc.data().created_by !== req.currentUser.uid) throw workspaceError(403, 'You cannot remove this item');
  await ref.delete();
  res.json({ message: 'Item removed' });
}));

export default router;
