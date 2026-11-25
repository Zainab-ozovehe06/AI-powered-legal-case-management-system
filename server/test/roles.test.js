import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createHarness } from '../testSupport/routerHarness.js';

const lawyer = { role: 'lawyer', uid: 'l1' };
const supervisor = { role: 'supervisor', uid: 'sup1' };
const student = { role: 'law_student', uid: 's1' };
const seed = (h) => {
  for (const [id, role] of [['s1', 'law_student'], ['s2', 'law_student'], ['l1', 'lawyer'], ['l2', 'lawyer'], ['sup1', 'supervisor'], ['admin-1', 'admin']]) {
    h.table('users').set(id, { role, name: id, status: 'active', secret: 'PROFILE SECRET' });
  }
  h.table('groups').set('g1', { name: 'Rights', leader_id: 's1', supervisor_id: 'sup1', status: 'active' });
  h.table('groups').set('g2', { name: 'Other unit', leader_id: 's2', supervisor_id: 'sup2', status: 'active' });
  for (const [groupId, uid] of [['g1', 's1'], ['g1', 'l1'], ['g2', 's2']]) h.table('group_members').set(`${groupId}_${uid}`, { group_id: groupId, user_id: uid });
  for (const [id, client, creator] of [['assigned', 'Assigned client', 's1'], ['unit', 'Unit client', 's2'], ['hidden', 'HIDDEN CLIENT', 's2']]) {
    h.table('cases').set(id, { client_name: client, created_by_student_id: creator, status: 'open', case_type: 'civil' });
  }
  h.table('case_assignments').set('lawyer', { case_id: 'assigned', user_id: 'l1', assigned_to_type: 'user', assignment_role: 'lawyer', assigned_by: 'admin-1' });
  h.table('case_assignments').set('unit', { case_id: 'unit', group_id: 'g1', assigned_to_type: 'group' });
  h.table('case_assignments').set('hidden', { case_id: 'hidden', group_id: 'g2', assigned_to_type: 'group' });
};
const caseRequest = (h, method, path, user, caseId = 'assigned', body = {}) => h.request(method, path, { ...user, params: { caseId }, body });

test('lawyers require direct lawyer assignments in lists and every case endpoint, even as unit members', async () => {
  const h = await createHarness('cases'); seed(h);
  assert.deepEqual((await h.request('get', '/', lawyer)).body.map((item) => item.id), ['assigned']);
  assert.equal((await caseRequest(h, 'get', '/:caseId', lawyer)).status, 200);
  for (const caseId of ['unit', 'hidden']) {
    for (const path of ['/:caseId', '/:caseId/activities', '/:caseId/group-reflections']) assert.equal((await caseRequest(h, 'get', path, lawyer, caseId)).status, 403);
    assert.equal((await caseRequest(h, 'post', '/:caseId/activities', lawyer, caseId, { description: 'Denied' })).status, 403);
    assert.equal((await caseRequest(h, 'patch', '/:caseId/status', lawyer, caseId, { status: 'closed' })).status, 403);
  }
  assert.equal((await caseRequest(h, 'get', '/:caseId', { role: 'lawyer', uid: 'l2' })).status, 403);
  h.table('case_assignments').set('self-student', { case_id: 'hidden', user_id: 'l1', assigned_to_type: 'user', assigned_by: 'l1' });
  assert.equal((await caseRequest(h, 'get', '/:caseId', lawyer, 'hidden')).status, 403);
  h.table('case_assignments').set('legacy-admin', { case_id: 'hidden', user_id: 'l1', assigned_by_user_id: 'admin-1' });
  assert.equal((await caseRequest(h, 'get', '/:caseId', lawyer, 'hidden')).status, 200);
  h.table('case_assignments').delete('lawyer');
  assert.equal((await caseRequest(h, 'get', '/:caseId', lawyer)).status, 403);
});

test('lawyer status changes use existing statuses, restrict fields and record an audit entry', async () => {
  const h = await createHarness('cases'); seed(h);
  for (const status of ['incourt', 'court_date', 'pending', 'closed', 'open']) {
    const changed = await caseRequest(h, 'patch', '/:caseId/status', lawyer, 'assigned', { status });
    assert.equal(changed.status, 200);
    assert.equal(h.table('cases').get('assigned').status, status === 'court_date' ? 'awaiting_hearing' : status);
  }
  assert.equal(h.table('activities').size, 5);
  assert.ok([...h.table('activities').values()].every((item) => item.type === 'case_status_updated' && item.logged_by_user_id === 'l1'));
  for (const body of [{ status: 'invalid' }, { status: 'closed', client_name: 'Overwrite' }, { status: 'closed', assigned_lawyer_id: 'l2' }]) {
    assert.equal((await caseRequest(h, 'patch', '/:caseId/status', lawyer, 'assigned', body)).status, 400);
  }
  assert.equal((await caseRequest(h, 'patch', '/:caseId', lawyer, 'assigned', { description: 'Overwrite' })).status, 403);
  assert.equal((await h.request('post', '/', { ...lawyer, body: { client_name: 'Denied' } })).status, 403);
  assert.equal((await caseRequest(h, 'patch', '/:caseId/status', supervisor, 'assigned', { status: 'closed' })).status, 403);
  h.table('cases').get('assigned').status = 'unknown';
  assert.equal((await caseRequest(h, 'patch', '/:caseId/status', lawyer, 'assigned', { status: 'closed' })).status, 409);
});

test('lawyers log case activities but cannot alter other users or audit entries; supervisors cannot write', async () => {
  const h = await createHarness('cases'); seed(h);
  const added = await caseRequest(h, 'post', '/:caseId/activities', lawyer, 'assigned', { description: 'Client interview', logged_by_user_id: 's2' });
  assert.equal(added.status, 201);
  assert.equal(h.table('activities').get(added.body.activityId).logged_by_user_id, 'l1');
  const params = { caseId: 'assigned', activityId: added.body.activityId };
  assert.equal((await h.request('patch', '/:caseId/activities/:activityId', { ...lawyer, params, body: { description: 'Updated interview' } })).status, 200);
  h.table('activities').set('audit', { case_id: 'assigned', logged_by_user_id: 'l1', type: 'case_status_updated' });
  for (const method of ['patch', 'delete']) {
    assert.equal((await h.request(method, '/:caseId/activities/:activityId', { ...lawyer, params: { ...params, activityId: 'audit' }, body: { description: 'Erase audit' } })).status, 403);
    assert.equal((await h.request(method, '/:caseId/activities/:activityId', { ...supervisor, params, body: { description: 'Overwrite' } })).status, 403);
  }
  assert.equal((await caseRequest(h, 'post', '/:caseId/activities', supervisor, 'assigned', { description: 'Denied' })).status, 403);
});

test('supervisor scope follows live group/student records and never inherits unrelated group cases', async () => {
  const h = await createHarness('cases'); seed(h);
  h.table('groups').set('lawyer-only', { name: 'Lawyer unit', supervisor_id: 'sup1', status: 'active' });
  h.table('group_members').set('lawyer-only_l1', { group_id: 'lawyer-only', user_id: 'l1' });
  h.table('case_assignments').set('lawyer-only', { case_id: 'hidden', group_id: 'lawyer-only', assigned_to_type: 'group' });
  h.table('group_members').set('g2_s1', { group_id: 'g2', user_id: 's1' });
  h.table('users').get('s2').supervisor_id = 'sup1'; // Stale display metadata is not authority.
  const listed = await h.request('get', '/', supervisor);
  assert.deepEqual(listed.body.map((item) => item.id).sort(), ['assigned', 'unit']);
  assert.equal((await caseRequest(h, 'get', '/:caseId', supervisor, 'hidden')).status, 403);
  const detail = await caseRequest(h, 'get', '/:caseId', supervisor, 'unit');
  assert.equal(detail.status, 200);
  assert.ok(!JSON.stringify(detail.body).includes('PROFILE SECRET'));
  assert.deepEqual((await h.request('get', '/', { ...supervisor, query: { group_id: 'g2' } })).body, []);
  assert.deepEqual((await h.request('get', '/', { ...supervisor, query: { student_id: 's2' } })).body, []);
  h.table('group_members').delete('g1_s1');
  assert.equal((await caseRequest(h, 'get', '/:caseId', supervisor)).status, 403);
  assert.deepEqual((await h.request('get', '/', supervisor)).body, []); // Lawyer membership is insufficient.
  h.table('group_members').set('g1_s1', { group_id: 'g1', user_id: 's1' });
  h.table('users').get('s1').status = 'inactive';
  assert.deepEqual((await h.request('get', '/', supervisor)).body, []);
  h.table('users').get('s1').status = 'active';
  h.table('groups').get('g1').supervisor_id = 'replacement';
  assert.equal((await caseRequest(h, 'get', '/:caseId', supervisor)).status, 403);
});

test('supervisors review existing reports without changing ownership; lawyers cannot read restricted reports', async () => {
  const h = await createHarness('workspaces'); seed(h);
  h.table('group_reflections').set('report', { group_id: 'g1', case_id: 'assigned', submitted_by: 's1', title: 'Student report', content: 'Case reflection', visibility: 'restricted' });
  h.table('group_reflections').set('unrelated', { group_id: 'g2', submitted_by: 's2', content: 'SECRET REPORT' });
  const get = (user) => h.request('get', '/:groupId/workspace', { ...user, params: { groupId: 'g1' } });
  h.table('case_assignments').set('report-case', { case_id: 'assigned', assigned_to_type: 'group', group_id: 'g1' });
  h.table('group_reflections').set('former-student', { group_id: 'g1', case_id: 'assigned', submitted_by: 's2', content: 'Former student confidential report', visibility: 'restricted' });
  assert.equal((await get(supervisor)).body.reflections.length, 1);
  assert.equal((await get(lawyer)).body.reflections.length, 0);
  const cases = await createHarness('cases', h.tables);
  assert.equal((await caseRequest(cases, 'get', '/:caseId/group-reflections', lawyer)).status, 403);
  assert.equal((await caseRequest(cases, 'get', '/:caseId/group-reflections', supervisor)).body.length, 1);
  const reviewed = await h.request('patch', '/:groupId/workspace/reflections/:itemId', { ...supervisor, params: { groupId: 'g1', itemId: 'report' }, body: {
    status: 'reviewed', supervisor_feedback: 'Please clarify the chronology', submitted_by: 's2', group_id: 'g2', content: 'Overwrite',
  } });
  assert.equal(reviewed.status, 200);
  assert.equal(h.table('group_reflections').get('report').submitted_by, 's1');
  assert.equal(h.table('group_reflections').get('report').group_id, 'g1');
  assert.equal(h.table('group_reflections').get('report').content, 'Case reflection');
  assert.equal((await get(student)).body.reflections[0].supervisor_feedback, 'Please clarify the chronology');
  assert.equal((await h.request('get', '/:groupId/workspace', { ...supervisor, params: { groupId: 'g2' } })).status, 403);
});

test('student activity feed redacts unrelated case details and enforces student/date filters', async () => {
  const h = await createHarness('workspaces'); seed(h);
  for (const [id, caseId, uid, day] of [['visible', 'assigned', 's1', 1793491200], ['restricted', 'hidden', 's1', 1793577600], ['other', 'assigned', 's2', 1793664000]]) {
    h.table('activities').set(id, { case_id: caseId, description: 'PRIVATE DESCRIPTION', court_name: 'PRIVATE COURT', private_field: 'PRIVATE EXTRA', logged_by_user_id: uid, logged_at: { _seconds: day } });
  }
  const request = (user = supervisor, query = {}) => h.request('get', '/:groupId/workspace/activities', { ...user, params: { groupId: 'g1' }, query });
  const listed = await request();
  assert.equal(listed.status, 200); assert.equal(listed.body.length, 2);
  const redacted = listed.body.find((item) => item.id === 'restricted');
  assert.equal(redacted.case_id, null); assert.equal(redacted.case_title, null); assert.equal(redacted.court_name, null);
  assert.ok(!JSON.stringify(redacted).includes('PRIVATE'));
  assert.equal((await request(lawyer)).status, 403);
  assert.equal((await request(supervisor, { student_id: 's2' })).status, 403);
  assert.equal((await request(supervisor, { date_from: 'bad' })).status, 400);
  assert.equal((await request(supervisor, { date_from: '2099-01-01' })).body.length, 0);
});

test('admin lawyer assignment preserves student/group assignments and mixed membership supports supervision', async () => {
  const h = await createHarness('cases'); seed(h);
  h.table('case_assignments').set('student', { case_id: 'assigned', user_id: 's1', assigned_to_type: 'user' });
  const assigned = await h.request('post', '/:caseId/assign-lawyer', { params: { caseId: 'assigned' }, body: { lawyer_id: 'l2' } });
  assert.equal(assigned.status, 200);
  assert.ok(h.table('case_assignments').has('student')); assert.ok(h.table('case_assignments').has('unit'));
  assert.equal((await caseRequest(h, 'get', '/:caseId', lawyer)).status, 403);
  assert.equal((await caseRequest(h, 'get', '/:caseId', { role: 'lawyer', uid: 'l2' })).status, 200);
  const groups = await createHarness('groups', h.tables);
  assert.equal((await groups.request('post', '/:groupId/members', { params: { groupId: 'g1' }, body: { member_ids: ['l2'] } })).status, 200);
  assert.equal((await groups.request('patch', '/:groupId/leader', { params: { groupId: 'g1' }, body: { leader_id: 'l2' } })).status, 400);
  const admin = await createHarness('adminRoutes', h.tables);
  assert.equal((await admin.request('patch', '/groups/:groupId/assign-supervisor', { params: { groupId: 'g1' }, body: { supervisorId: 'sup1' } })).status, 200);
  assert.equal(h.table('users').get('l1').supervisor_id, undefined);
});

test('document list/upload/download require assignment; supervisors can read but cannot mutate', async () => {
  const h = await createHarness('documents'); seed(h);
  const file = { originalname: 'evidence.pdf', mimetype: 'application/pdf', size: 12, buffer: Buffer.from('%PDF-1.7\nOK') };
  const upload = (user, caseId) => h.request('post', '/:caseId/upload', { ...user, params: { caseId }, file });
  assert.equal((await upload(lawyer, 'unit')).status, 403);
  assert.equal((await upload(supervisor, 'assigned')).status, 403);
  assert.equal(h.storageCalls.length, 0);
  const saved = await upload(lawyer, 'assigned'); assert.equal(saved.status, 201);
  const doc = h.table('documents').get(saved.body.documentId);
  assert.equal(doc.storage_provider, 'firebase_storage'); assert.equal(doc.file_path, null);
  assert.equal(doc.uploaded_by_user_id, 'l1');
  assert.equal(h.storageCalls[0][2].metadata.cacheControl, 'private, no-store');
  const list = await h.request('get', '/:caseId', { ...supervisor, params: { caseId: 'assigned' } });
  assert.equal(list.status, 200); assert.equal(list.body[0].storage_file_path, undefined);
  for (const user of [lawyer, supervisor, student]) {
    const downloaded = await h.request('get', '/:documentId/download', { ...user, params: { documentId: saved.body.documentId } });
    assert.equal(downloaded.status, 200); assert.deepEqual(downloaded.body, file.buffer);
  }
  for (const method of ['patch', 'delete']) for (const user of [lawyer, supervisor]) {
    assert.equal((await h.request(method, '/:documentId', { ...user, params: { documentId: saved.body.documentId }, body: { name: 'Overwrite' } })).status, 403);
  }
  h.table('case_assignments').delete('lawyer');
  assert.equal((await h.request('get', '/:documentId/download', { ...lawyer, params: { documentId: saved.body.documentId } })).status, 403);
});

test('real multipart uploads validate file type and 5 MB limit before Storage writes', async () => {
  const h = await createHarness('documents'); seed(h);
  const app = express();
  app.use((req, _res, next) => { req.currentUser = { ...lawyer }; next(); });
  app.use(h.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}/assigned/upload`;
    for (const [name, type, data, expected] of [
      ['payload.exe', 'application/octet-stream', 'bad', 400],
      ['payload.pdf', 'text/html', '<script>bad</script>', 400],
      ['large.pdf', 'application/pdf', new Uint8Array(5 * 1024 * 1024 + 1), 413],
      ['evidence.pdf', 'application/pdf', '%PDF-1.7\nEvidence', 201],
    ]) {
      const form = new FormData(); form.append('file', new Blob([data], { type }), name);
      const result = await fetch(endpoint, { method: 'POST', body: form });
      assert.equal(result.status, expected, await result.text());
    }
    assert.equal(h.storageCalls.filter(([kind]) => kind === 'save').length, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('legacy Firebase documents use authenticated bucket reads without forwarding token URLs', async () => {
  const h = await createHarness('documents'); seed(h);
  h.storedFiles.set('legacy.pdf', Buffer.from('%PDF legacy'));
  h.table('documents').set('legacy', { case_id: 'assigned', file_path: 'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/legacy.pdf?alt=media&token=OLD-TOKEN', name: 'legacy.pdf' });
  const result = await h.request('get', '/:documentId/download', { ...lawyer, params: { documentId: 'legacy' } });
  assert.equal(result.status, 200); assert.equal(result.body.toString(), '%PDF legacy');
  const list = await h.request('get', '/:caseId', { ...lawyer, params: { caseId: 'assigned' } });
  assert.ok(!JSON.stringify(list.body).includes('OLD-TOKEN'));
});

test('lawyer AI retrieves assigned context only and rejects explicit unassigned case requests before provider calls', async () => {
  const requests = [];
  const h = await createHarness('ai', new Map(), { fetch: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"overview":"Advisory response"}' }] } }] }) };
  } }); seed(h);
  h.table('case_assignments').set('report-case', { case_id: 'assigned', assigned_to_type: 'group', group_id: 'g1' });
  h.table('group_reflections').set('student-report', { group_id: 'g1', case_id: 'assigned', submitted_by: 's1', title: 'RESTRICTED STUDENT REPORT', content: 'RESTRICTED STUDENT REPORT' });
  h.table('activities').set('hidden', { case_id: 'hidden', description: 'HIDDEN ACTIVITY' });
  h.table('events').set('private', { case_id: 'assigned', visibility: 'private', created_by: 's2', description: 'PRIVATE EVENT', title: 'PRIVATE EVENT' });
  h.table('documents').set('evidence', { case_id: 'assigned', name: 'evidence.pdf', document_type: 'application/pdf', storage_file_path: 'evidence.pdf', size: 8 });
  h.storedFiles.set('evidence.pdf', Buffer.from('%PDF-1.7'));
  const ask = (body) => h.request('post', '/assistant', { ...lawyer, body, files: [] });
  assert.equal((await ask({ prompt: 'Show hidden', case_id: 'hidden' })).status, 403);
  assert.equal(requests.length, 0); assert.ok(!h.reads.includes('activities'));
  const result = await ask({ prompt: 'Summarize the case documents', case_id: 'assigned' });
  assert.equal(result.status, 200); assert.equal(result.body.retrieval.visibleCaseCount, 1);
  const sent = JSON.stringify(requests[0]);
  assert.ok(sent.includes('Assigned client')); assert.ok(!sent.includes('HIDDEN')); assert.ok(!sent.includes('Unit client')); assert.ok(!sent.includes('PRIVATE EVENT')); assert.ok(!sent.includes('RESTRICTED STUDENT REPORT'));
  assert.ok(h.storageCalls.some(([kind]) => kind === 'download'));
  assert.equal(h.table('cases').get('assigned').status, 'open');
  h.table('case_assignments').delete('lawyer');
  assert.equal((await ask({ prompt: 'Try again', case_id: 'assigned' })).status, 403);
  assert.equal(requests.length, 1);
});

test('case scheduling requires direct lawyer assignment, private audience and reminder ownership', async () => {
  const h = await createHarness('events'); seed(h);
  const payload = { title: 'Case reminder', case_id: 'assigned', event_type: 'follow_up', date: '2026-11-20', start_time: '09:00', end_time: '10:00' };
  assert.equal((await h.request('post', '/events', { ...lawyer, body: { ...payload, case_id: 'unit' } })).status, 403);
  const saved = await h.request('post', '/events', { ...lawyer, body: payload }); assert.equal(saved.status, 201);
  const params = { eventId: saved.body.eventId };
  assert.equal((await h.request('patch', '/events/:eventId', { ...lawyer, params, body: { title: 'Updated' } })).status, 200);
  assert.equal((await h.request('patch', '/events/:eventId', { ...supervisor, params, body: { title: 'Denied' } })).status, 403);
  assert.equal((await h.request('delete', '/events/:eventId', { ...supervisor, params })).status, 403);
  assert.equal((await h.request('delete', '/events/:eventId', { ...lawyer, params })).status, 200);
  h.table('events').set('private', { ...payload, visibility: 'private', created_by: 's2', assigned_users: ['s2'] });
  assert.equal((await h.request('get', '/events/:eventId', { ...lawyer, params: { eventId: 'private' } })).status, 403);
  assert.ok(!(await h.request('get', '/events', lawyer)).body.some((event) => event.id === 'private'));
  assert.equal((await h.request('get', '/cases/:caseId/events', { ...lawyer, params: { caseId: 'assigned' } })).body.length, 1);
  h.table('events').set('group-bypass', { ...payload, case_id: 'unit', created_by: 's1' });
  assert.equal((await h.request('get', '/events/:eventId', { ...lawyer, params: { eventId: 'group-bypass' } })).status, 403);
});

test('real authentication rejects missing/invalid tokens and inactive accounts and uses stored role/verified UID', async () => {
  const authTime = Math.floor(Date.now() / 1000);
  const h = await createHarness('cases', new Map(), { realAuth: true, authUid: 'l1', authTime }); seed(h);
  assert.equal((await h.request('get', '/')).status, 401);
  assert.equal((await h.request('get', '/', { headers: { authorization: 'Bearer invalid' } })).status, 401);
  const signIn = await createHarness('authRoutes', h.tables, { realAuth: true, authUid: 'l1', authTime });
  const started = await signIn.request('post', '/session', { headers: { authorization: 'Bearer valid' } });
  const headers = { authorization: 'Bearer valid', 'x-session-id': started.body.session.id };
  h.table('users').get('l1').status = 'inactive';
  assert.equal((await h.request('get', '/', { headers })).status, 403);
  h.table('users').get('l1').status = 'active';
  h.table('users').get('l1').uid = 'admin-1';
  const result = await h.request('get', '/', { role: 'admin', uid: 'admin-1', headers });
  assert.equal(result.status, 200); assert.deepEqual(result.body.map((item) => item.id), ['assigned']);
  assert.ok(h.tokenChecks.every((check) => check.checkRevoked === true));
});
