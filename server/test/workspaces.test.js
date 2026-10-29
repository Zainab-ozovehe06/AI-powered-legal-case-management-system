import assert from 'node:assert/strict';
import test from 'node:test';
import { createHarness } from '../testSupport/routerHarness.js';

const student = { role: 'law_student', uid: 's1' };
const otherStudent = { role: 'law_student', uid: 's2' };
const supervisor = { role: 'supervisor', uid: 'sup1' };
const params = { groupId: 'g1' };
const seed = (h) => {
  h.table('groups').set('g1', { name: 'Human Rights Unit', leader_id: 's1', supervisor_id: 'sup1', status: 'active' });
  h.table('groups').set('g2', { name: 'Migration Unit', supervisor_id: 'sup2', status: 'active' });
  for (const uid of ['s1', 's2']) {
    h.table('group_members').set(`g1_${uid}`, { group_id: 'g1', user_id: uid, role_in_group: uid === 's1' ? 'leader' : 'member' });
    h.table('users').set(uid, { name: uid, email: `${uid}@clinic.test`, role: 'law_student', secret: 'DO NOT EXPOSE', status: 'active' });
  }
  h.table('users').set('sup1', { name: 'Supervisor', role: 'supervisor', secret: 'DO NOT EXPOSE' });
};
const workspace = (h, user = student, groupId = 'g1') => h.request('get', '/:groupId/workspace', { ...user, params: { groupId } });
const create = (h, kind, body, user = student, groupId = 'g1') => h.request('post', `/:groupId/workspace/${kind}`, { ...user, params: { groupId }, body });

test('existing groups immediately become workspaces; membership and supervisor assignment control access', async () => {
  const h = await createHarness('workspaces'); seed(h);
  for (const [user, ids] of [[student, ['g1']], [supervisor, ['g1']], [{ role: 'admin' }, ['g1', 'g2']]]) {
    const result = await h.request('get', '/workspaces', user);
    assert.equal(result.status, 200); assert.deepEqual(result.body.map((item) => item.id), ids);
  }
  assert.equal((await workspace(h)).status, 200);
  assert.equal((await workspace(h, supervisor)).status, 200);
  assert.equal((await workspace(h, student, 'g2')).status, 403);
  assert.equal((await workspace(h, { role: 'lawyer', uid: 's1' })).status, 403);
  assert.equal((await workspace(h, student, 'missing')).status, 404);
  assert.ok(!JSON.stringify((await workspace(h)).body.group).includes('DO NOT EXPOSE'));
  h.table('group_members').delete('g1_s1');
  assert.equal((await workspace(h)).status, 403);
  assert.equal((await create(h, 'posts', { title: 'Denied', content: 'Removed member' })).status, 403);
  h.table('groups').get('g1').supervisor_id = 'sup2';
  assert.equal((await workspace(h, supervisor)).status, 403);
  assert.equal((await workspace(h, otherStudent)).status, 200);
  h.table('groups').get('g1').status = 'inactive';
  assert.equal((await workspace(h, otherStudent)).status, 403);
  assert.equal((await workspace(h, { role: 'admin' })).status, 200);
  assert.equal((await create(h, 'posts', { title: 'No', content: 'No' }, { role: 'admin' })).status, 403);
});

test('report submissions reuse reflections, bind to the verified URL unit and default to restricted', async () => {
  const h = await createHarness('workspaces'); seed(h);
  const body = { title: 'Weekly reflection', content: 'Learning outcomes', group_id: 'g2', submitted_by: 's2', status: 'reviewed' };
  const result = await create(h, 'reflections', body);
  assert.equal(result.status, 201);
  const saved = h.table('group_reflections').get(result.body.id);
  assert.equal(saved.group_id, 'g1'); assert.equal(saved.submitted_by, 's1');
  assert.equal(saved.visibility, 'restricted'); assert.equal(saved.status, 'submitted');
  assert.equal((await workspace(h)).body.reflections.length, 1);
  assert.equal((await workspace(h)).body.feed.length, 0);
  assert.equal((await workspace(h, otherStudent)).body.reflections.length, 0);
  assert.equal((await workspace(h, supervisor)).body.reflections.length, 1);
  assert.equal((await create(h, 'reflections', body, supervisor)).status, 403);
  assert.equal((await create(h, 'reflections', { ...body, visibility: 'public' })).status, 400);
  const shared = await create(h, 'reflections', { title: 'Outreach report', content: 'Approved public summary', visibility: 'unit' });
  assert.equal(shared.status, 201);
  assert.equal((await workspace(h, otherStudent)).body.feed[0].id, shared.body.id);
});

test('legacy and case-linked reflections never enter community; case access and leader rules are retained', async () => {
  const h = await createHarness('workspaces'); seed(h);
  h.table('cases').set('case1', { client_name: 'Private client' });
  h.table('cases').set('case2', { client_name: 'Other private client' });
  h.table('case_assignments').set('a1', { case_id: 'case1', group_id: 'g1', assigned_to_type: 'group' });
  h.table('group_reflections').set('legacy', { group_id: 'g1', case_id: 'case1', submitted_by: 's1', title: 'Legacy secret', content: 'Private content' });
  h.table('group_reflections').set('wrong-visibility', { group_id: 'g1', case_id: 'case2', visibility: 'unit', submitted_by: 's1', content: 'Private content' });
  const visible = await workspace(h);
  assert.equal(visible.body.feed.length, 0);
  assert.deepEqual(visible.body.reflections.map((item) => item.id), ['legacy']);
  assert.equal((await workspace(h, otherStudent)).body.reflections.length, 0);
  assert.equal((await workspace(h, supervisor)).body.reflections.length, 0);
  const body = { title: 'Case report', content: 'Private content', case_id: 'case1' };
  assert.equal((await create(h, 'reflections', { ...body, visibility: 'unit' })).status, 400);
  assert.equal((await create(h, 'reflections', body, otherStudent)).status, 403);
  assert.equal((await create(h, 'reflections', { ...body, case_id: 'case2' })).status, 403);
  assert.equal((await create(h, 'reflections', body)).status, 201);
  assert.equal((await workspace(h)).body.feed.length, 0);
});

test('discussions validate the parent item, sharing visibility and membership on reads and writes', async () => {
  const h = await createHarness('workspaces'); seed(h);
  const report = await create(h, 'reflections', { title: 'Shared', content: 'Public summary', visibility: 'unit' });
  const path = '/:groupId/workspace/:kind/:itemId/comments';
  const target = { ...params, kind: 'reflection', itemId: report.body.id };
  assert.equal((await h.request('post', path, { ...otherStudent, params: target, body: { content: 'Thoughtful feedback', author_role: 'supervisor' } })).status, 201);
  const listed = await h.request('get', path, { ...student, params: target });
  assert.equal(listed.body[0].author_role, 'law_student');
  assert.equal(listed.body[0].created_by, 's2');
  const privateReport = await create(h, 'reflections', { title: 'Private', content: 'Private summary' });
  assert.equal((await h.request('get', path, { ...student, params: { ...target, itemId: privateReport.body.id } })).status, 403);
  assert.equal((await h.request('post', path, { ...student, params: { ...target, itemId: privateReport.body.id }, body: { content: 'No leak' } })).status, 403);
  assert.equal((await h.request('get', path, { ...student, params: { ...target, itemId: 'missing' } })).status, 404);
  h.table('group_reflections').get(report.body.id).group_id = 'g2';
  assert.equal((await h.request('get', path, { ...student, params: target })).status, 404);
});

test('task assignees must be unit members and only assignees, authors and managers update progress', async () => {
  const h = await createHarness('workspaces'); seed(h);
  assert.equal((await create(h, 'tasks', { title: 'Task', assigned_to: 'outsider' })).status, 400);
  assert.equal((await create(h, 'tasks', { title: 'Task', assigned_to: 's2', due_date: '2026-02-30' })).status, 400);
  const created = await create(h, 'tasks', { title: 'Research', assigned_to: 's2', due_date: '2026-11-01' });
  assert.equal(created.status, 201);
  const target = { ...params, itemId: created.body.id };
  const update = (user, body = { status: 'completed' }) => h.request('patch', '/:groupId/workspace/tasks/:itemId', { ...user, params: target, body });
  assert.equal((await update(otherStudent)).status, 200);
  assert.equal((await workspace(h)).body.tasks[0].status, 'completed');
  assert.ok((await workspace(h)).body.feed.some((item) => item.kind === 'task'));
  assert.equal((await update(supervisor, { status: 'in_progress' })).status, 200);
  h.table('group_members').set('g1_s3', { group_id: 'g1', user_id: 's3' });
  assert.equal((await update({ role: 'law_student', uid: 's3' })).status, 403);
  assert.equal((await update(student, { status: 'invalid' })).status, 400);
});

test('announcements, resources, reviews and deletion obey role and unit boundaries', async () => {
  const h = await createHarness('workspaces'); seed(h);
  assert.equal((await create(h, 'posts', { title: 'Announcement', content: 'News', post_type: 'announcement' }, otherStudent)).status, 403);
  assert.equal((await create(h, 'posts', { title: 'Announcement', content: 'News', post_type: 'announcement' }, supervisor)).status, 201);
  assert.equal((await create(h, 'posts', { title: 'Question', content: 'Discuss' }, otherStudent)).status, 201);
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///secret', 'https://user:password@example.org', 'broken']) {
    assert.equal((await create(h, 'resources', { title: 'Unsafe', url })).status, 400);
  }
  const resource = await create(h, 'resources', { title: 'Reading', url: 'https://example.org/reading' });
  assert.equal(resource.status, 201);
  const target = { ...params, kind: 'resources', itemId: resource.body.id };
  assert.equal((await h.request('delete', '/:groupId/workspace/:kind/:itemId', { ...otherStudent, params: target })).status, 403);
  assert.equal((await h.request('delete', '/:groupId/workspace/:kind/:itemId', { ...student, params: { ...target, groupId: 'g2' } })).status, 403);
  assert.equal((await h.request('delete', '/:groupId/workspace/:kind/:itemId', { ...supervisor, params: target })).status, 200);
  const report = await create(h, 'reflections', { title: 'Report', content: 'Learnings', visibility: 'unit' });
  const review = (user) => h.request('patch', '/:groupId/workspace/reflections/:itemId', { ...user,
    params: { ...params, itemId: report.body.id }, body: { status: 'reviewed', supervisor_feedback: 'Useful work' } });
  assert.equal((await review(student)).status, 403);
  assert.equal((await review(supervisor)).status, 200);
  assert.equal((await workspace(h, otherStudent)).body.feed.find((item) => item.id === report.body.id).supervisor_feedback, 'Useful work');
});

test('existing case listing intersects explicit group assignments with existing case visibility', async () => {
  const h = await createHarness('cases'); seed(h);
  h.table('cases').set('unit-case', { client_name: 'Unit client' });
  h.table('cases').set('own-case', { created_by_student_id: 's1' });
  h.table('cases').set('hidden-case', { client_name: 'Confidential' });
  h.table('cases').set('deleted-case', { is_deleted: true });
  h.table('case_assignments').set('unit', { case_id: 'unit-case', group_id: 'g1', assigned_to_type: 'group' });
  h.table('case_assignments').set('other', { case_id: 'hidden-case', group_id: 'g2', assigned_to_type: 'group' });
  h.table('case_assignments').set('deleted', { case_id: 'deleted-case', group_id: 'g1', assigned_to_type: 'group' });
  assert.deepEqual((await h.request('get', '/', { ...student, query: { group_id: 'g1' } })).body.map((item) => item.id), ['unit-case']);
  assert.equal((await h.request('get', '/', { ...student, query: { group_id: 'g2' } })).body.length, 0);
  assert.equal((await h.request('get', '/', { ...supervisor, query: { group_id: 'g1' } })).status, 403);
  assert.equal((await h.request('get', '/:caseId', { ...student, params: { caseId: 'hidden-case' } })).status, 403);
  assert.equal((await h.request('get', '/', student)).body.length, 2);
});

test('authors can revise reports without spoofing reviews, moving units or sharing case data', async () => {
  const h = await createHarness('workspaces'); seed(h);
  const created = await create(h, 'reflections', { title: 'Draft', content: 'Learning', visibility: 'unit' });
  const target = { ...params, itemId: created.body.id };
  const edit = (body, user = student) => h.request('patch', '/:groupId/workspace/reflections/:itemId', { ...user, params: target, body });
  assert.equal((await edit({ title: 'Stolen report', content: 'No' }, otherStudent)).status, 403);
  assert.equal((await edit({ status: 'reviewed', supervisor_feedback: 'Spoofed' })).status, 403);
  assert.equal((await edit({ title: 'Revised report', content: 'Updated learning', visibility: 'restricted', group_id: 'g2', case_id: 'other-case' })).status, 200);
  const saved = h.table('group_reflections').get(created.body.id);
  assert.equal(saved.group_id, 'g1'); assert.equal(saved.case_id, null); assert.equal(saved.status, 'submitted');
  assert.equal((await workspace(h, otherStudent)).body.reflections.length, 0);
  assert.equal((await workspace(h)).body.feed.length, 0);
  assert.equal((await h.request('get', '/:groupId/workspace/:kind/:itemId/comments', { ...otherStudent, params: { ...target, kind: 'reflection' } })).status, 403);
});

test('existing admin group creation and membership changes automatically provision and revoke workspace access', async () => {
  const groups = await createHarness('groups');
  groups.table('users').set('s1', { name: 'Leader', role: 'law_student' });
  groups.table('users').set('s2', { name: 'Student', role: 'law_student' });
  const created = await groups.request('post', '/', { body: { name: 'New Law Clinic Unit', leader_id: 's1' } });
  assert.equal(created.status, 201);
  const groupId = created.body.group.id;
  const units = await createHarness('workspaces', groups.tables);
  assert.equal((await workspace(units, student, groupId)).status, 200);
  assert.equal((await workspace(units, otherStudent, groupId)).status, 403);
  const added = await groups.request('post', '/:groupId/members', { params: { groupId }, body: { member_ids: ['s2'] } });
  assert.equal(added.status, 200);
  assert.equal((await workspace(units, otherStudent, groupId)).status, 200);
  assert.equal((await groups.request('delete', '/:groupId/members/:userId', { params: { groupId, userId: 's2' } })).status, 200);
  assert.equal((await workspace(units, otherStudent, groupId)).status, 403);
  assert.equal(groups.table('groups').size, 1);
  assert.equal(groups.tables.has('workspaces'), false);
});
