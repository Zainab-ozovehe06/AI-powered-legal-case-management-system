import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVENT_TYPE_OPTIONS,
  LEGACY_EVENT_TYPE_OPTIONS,
  getEventTypeMeta,
} from '../../frontend/src/components/calendar/eventUtils.js';

import { createHarness } from '../testSupport/routerHarness.js';

const payload = (overrides = {}) => ({
  title: 'Clinic event', event_type: 'summit', case_id: null,
  date: '2026-10-20', start_time: '09:00', end_time: '10:00',
  reminder_minutes_before: 30, status: 'upcoming', ...overrides,
});
const seedCases = (h) => {
  h.table('cases').set('case-1', { client_name: 'Client', offence: 'Matter' });
  h.table('cases').set('case-2', { client_name: 'Other client' });
  h.table('cases').set('deleted-case', { is_deleted: true });
  h.table('case_assignments').set('student', { case_id: 'case-1', user_id: 'student-1' });
  h.table('case_assignments').set('lawyer', { case_id: 'case-1', user_id: 'lawyer-1' });
};

test('all 13 stakeholder types retain their labels and work with and without a case', async () => {
  const labels = ['Summit', 'Conference', 'Street Lawyering', 'Reform Pre Trial Detention',
    'Community Outreach', 'Workshop', 'Training', 'Orientation', 'Competitions',
    'Virtual Events', 'Seminars and Webinars', 'Law Clinic Meetings', 'Unit meetings'];
  assert.deepEqual(EVENT_TYPE_OPTIONS.map((option) => option.label), labels);
  const h = await createHarness();
  seedCases(h);
  for (const option of EVENT_TYPE_OPTIONS) {
    assert.equal(getEventTypeMeta(option.value).label, option.label);
    for (const caseId of [null, 'case-1']) {
      const result = await h.request('post', '/events', { body: payload({ event_type: option.value, case_id: caseId }) });
      assert.equal(result.status, 201);
      const saved = h.table('events').get(result.body.eventId);
      assert.equal(saved.case_id, caseId);
      assert.equal(saved.case_title, caseId ? 'Client - Matter' : null);
      assert.equal(saved.reminder_minutes_before, 30);
      assert.equal(saved.event_type, option.value);
    }
  }
  assert.equal(h.table('activities').size, 13);
});

test('general event create, read, edit, cancel and permanent delete never access cases or log case activity', async () => {
  const h = await createHarness();
  const { case_id: _caseId, ...withoutCase } = payload();
  const created = await h.request('post', '/events', { body: withoutCase });
  assert.equal(created.status, 201);
  assert.equal(created.body.event.case_id, null);
  const params = { eventId: created.body.eventId };
  assert.equal((await h.request('get', '/events/:eventId', { params })).status, 200);
  assert.equal((await h.request('get', '/events')).body.length, 1);
  const updated = await h.request('patch', '/events/:eventId', { params, body: { title: 'Updated', reminder_minutes_before: 60 } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.event.reminder_minutes_before, 60);
  assert.equal(updated.body.event.case_id, null);
  assert.equal((await h.request('delete', '/events/:eventId', { params })).body.event.status, 'cancelled');
  assert.equal((await h.request('delete', '/events/:eventId', { params, query: { mode: 'delete' } })).status, 200);
  assert.equal(h.table('events').size, 0);
  assert.equal(h.table('activities').size, 0);
  assert.ok(h.reads.every((name) => name === 'events'));
});

test('legacy types retain their labels and survive editing and cancellation', async () => {
  const h = await createHarness();
  seedCases(h);
  for (const option of LEGACY_EVENT_TYPE_OPTIONS) {
    const id = `legacy-${option.value}`;
    h.table('events').set(id, payload({ case_id: 'case-1', event_type: option.value }));
    assert.equal(getEventTypeMeta(option.value).label, option.label);
    const edited = await h.request('patch', '/events/:eventId', { params: { eventId: id }, body: { title: 'Edited legacy' } });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.event.event_type, option.value);
    assert.equal(edited.body.event.case_id, 'case-1');
    const cancelled = await h.request('patch', '/events/:eventId', { params: { eventId: id }, body: { status: 'cancelled' } });
    assert.equal(cancelled.body.event.status, 'cancelled');
  }
});

test('omitting case_id preserves a link; explicit null removes it without a case activity', async () => {
  const h = await createHarness();
  seedCases(h);
  h.table('events').set('linked', payload({ case_id: 'case-1' }));
  const params = { eventId: 'linked' };
  const preserved = await h.request('patch', '/events/:eventId', { params, body: { title: 'Still linked' } });
  assert.equal(preserved.body.event.case_id, 'case-1');
  const count = h.table('activities').size;
  const detached = await h.request('patch', '/events/:eventId', { params, body: { case_id: null } });
  assert.equal(detached.status, 200);
  assert.equal(detached.body.event.case_id, null);
  assert.equal(detached.body.event.case_title, null);
  assert.equal(h.table('activities').size, count);
});

test('type, status, exact date, date range, case, sorting and limit filters work for both event kinds', async () => {
  const h = await createHarness();
  seedCases(h);
  h.table('events').set('general', payload());
  h.table('events').set('linked', payload({ case_id: 'case-1', event_type: 'court_date', date: '2026-10-21' }));
  h.table('events').set('cancelled', payload({ status: 'cancelled', date: '2026-10-22' }));
  for (const [query, ids] of [
    [{ event_type: 'summit', status: 'upcoming' }, ['general']],
    [{ event_type: 'court_date' }, ['linked']],
    [{ date: '2026-10-20' }, ['general']],
    [{ date_from: '2026-10-21', date_to: '2026-10-22' }, ['linked', 'cancelled']],
    [{ from: '2026-10-21', to: '2026-10-21' }, ['linked']],
    [{ case_id: 'case-1' }, ['linked']],
    [{ status: 'cancelled' }, ['cancelled']],
    [{ event_type: 'all', status: 'all', case_id: 'all', limit: '2' }, ['general', 'linked']],
  ]) {
    const result = await h.request('get', '/events', { query });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.map((event) => event.id), ids);
  }
  const result = await h.request('get', '/cases/:caseId/events', { params: { caseId: 'case-1' }, query: { event_type: 'court_date' } });
  assert.deepEqual(result.body.map((event) => event.id), ['linked']);
});

test('case assignments, group membership, deleted cases, lawyer read-only and admin-only deletion remain enforced', async () => {
  const h = await createHarness();
  seedCases(h);
  h.table('events').set('linked', payload({ case_id: 'case-1' }));
  h.table('events').set('hidden', payload({ case_id: 'case-2' }));
  h.table('events').set('deleted', payload({ case_id: 'deleted-case' }));
  h.table('case_assignments').set('deleted', { case_id: 'deleted-case', user_id: 'student-1' });
  h.table('case_assignments').set('group', { case_id: 'case-1', assigned_to_type: 'group', group_id: 'group-1' });
  h.table('group_members').set('group-student', { group_id: 'group-1', user_id: 'group-student' });
  const params = { eventId: 'linked' };
  for (const uid of ['student-1', 'group-student']) {
    const user = { role: 'law_student', uid };
    const listed = await h.request('get', '/events', user);
    assert.deepEqual(listed.body.map((event) => event.id), ['linked']);
    assert.equal((await h.request('patch', '/events/:eventId', { ...user, params, body: { title: 'Edited by student' } })).status, 200);
    assert.equal((await h.request('get', '/events/:eventId', { ...user, params: { eventId: 'hidden' } })).status, 403);
    const created = await h.request('post', '/events', { ...user, body: payload({ case_id: 'case-1' }) });
    assert.equal(created.status, 201);
    assert.ok(created.body.event.assigned_users.includes('group-student'));
    assert.ok(created.body.event.assigned_users.includes('lawyer-1'));
    // Keep the list fixture fixed for the next user's visibility check.
    h.table('events').delete(created.body.eventId);
  }
  const lawyer = { role: 'lawyer', uid: 'lawyer-1' };
  assert.equal((await h.request('get', '/events/:eventId', { ...lawyer, params })).status, 200);
  assert.equal((await h.request('get', '/events/:eventId', { ...lawyer, params: { eventId: 'hidden' } })).status, 403);
  assert.equal((await h.request('post', '/events', { ...lawyer, body: payload({ case_id: 'case-1' }) })).status, 403);
  assert.equal((await h.request('patch', '/events/:eventId', { ...lawyer, params, body: { title: 'Denied' } })).status, 403);
  assert.equal((await h.request('delete', '/events/:eventId', { ...lawyer, params })).status, 403);
  const student = { role: 'law_student', uid: 'student-1', params };
  assert.equal((await h.request('patch', '/events/:eventId', { ...student, body: { assigned_users: ['unassigned'] } })).status, 403);
  assert.equal((await h.request('delete', '/events/:eventId', { ...student, query: { hard: 'true' } })).status, 403);
  assert.equal((await h.request('delete', '/events/:eventId', student)).status, 200);
  assert.equal(h.table('events').get('linked').status, 'cancelled');
  assert.equal((await h.request('delete', '/events/:eventId', { params, query: { mode: 'delete' } })).status, 200);
  assert.equal(h.table('events').has('linked'), false);
});

test('invalid event fields are rejected without saving records', async () => {
  const h = await createHarness();
  for (const invalid of [
    { title: '' }, { event_type: 'invalid_type' }, { date: '20/10/2026' },
    { start_time: '25:00' }, { end_time: '08:00' }, { status: 'invalid' },
    { reminder_minutes_before: -1 }, { reminder_minutes_before: 1.5 },
  ]) {
    assert.equal((await h.request('post', '/events', { body: payload(invalid) })).status, 400);
  }
  assert.equal(h.table('events').size, 0);
  assert.equal((await h.request('get', '/events/:eventId', { params: { eventId: 'missing' } })).status, 404);
});

test('general events are visible only to admins, their creator and assigned users, even with no visible cases', async () => {
  const h = await createHarness();
  h.table('events').set('general', payload({ created_by: 'creator', assigned_users: ['assigned-student', 'assigned-lawyer'] }));
  const params = { eventId: 'general' };
  for (const [role, uid, visible] of [
    ['admin', 'admin-1', true],
    ['law_student', 'creator', true],
    ['law_student', 'assigned-student', true],
    ['lawyer', 'assigned-lawyer', true],
    ['law_student', 'other-student', false],
    ['lawyer', 'other-lawyer', false],
    ['supervisor', 'creator', false],
  ]) {
    const user = { role, uid };
    const listed = await h.request('get', '/events', user);
    assert.equal(listed.status, 200);
    if (listed.status === 200) assert.equal(listed.body.length, visible ? 1 : 0);
    assert.equal((await h.request('get', '/events/:eventId', { ...user, params })).status, visible ? 200 : 403);
  }
});

test('students manage only their own general events; assigned viewers cannot modify, cancel, delete or relink them', async () => {
  const h = await createHarness();
  seedCases(h);
  const owner = { role: 'law_student', uid: 'creator' };
  const created = await h.request('post', '/events', { ...owner, body: payload({ assigned_users: ['student-1', 'lawyer-1'] }) });
  assert.equal(created.status, 201);
  assert.equal(created.body.event.created_by, 'creator');
  const params = { eventId: created.body.eventId };
  for (const [role, uid] of [['law_student', 'student-1'], ['lawyer', 'lawyer-1']]) {
    const viewer = { role, uid, params };
    for (const body of [{ title: 'Denied' }, { status: 'cancelled' }, { case_id: 'case-1' }]) {
      assert.equal((await h.request('patch', '/events/:eventId', { ...viewer, body })).status, 403);
    }
    assert.equal((await h.request('delete', '/events/:eventId', viewer)).status, 403);
    assert.equal((await h.request('delete', '/events/:eventId', { ...viewer, query: { hard: 'true' } })).status, 403);
  }
  assert.equal((await h.request('post', '/events', { role: 'lawyer', uid: 'lawyer-1', body: payload() })).status, 403);
  assert.equal((await h.request('patch', '/events/:eventId', { ...owner, params, body: { title: 'Owner edit' } })).status, 200);
  assert.equal((await h.request('delete', '/events/:eventId', { ...owner, params, query: { hard: 'true' } })).status, 403);
  assert.equal((await h.request('delete', '/events/:eventId', { ...owner, params })).status, 200);
  assert.equal((await h.request('patch', '/events/:eventId', { params, body: { status: 'upcoming' } })).status, 200);
  assert.equal((await h.request('delete', '/events/:eventId', { params, query: { mode: 'delete' } })).status, 200);
  assert.equal(h.table('activities').size, 0);
});

test('students cannot remove the case link from another creator\'s event to bypass general-event ownership', async () => {
  const h = await createHarness();
  seedCases(h);
  const student = { role: 'law_student', uid: 'student-1', params: { eventId: 'linked' } };
  h.table('events').set('linked', payload({ case_id: 'case-1', created_by: 'another-user' }));
  assert.equal((await h.request('patch', '/events/:eventId', { ...student, body: { case_id: null } })).status, 403);
  assert.equal(h.table('events').get('linked').case_id, 'case-1');
  h.table('events').get('linked').created_by = 'student-1';
  assert.equal((await h.request('patch', '/events/:eventId', { ...student, body: { case_id: null } })).status, 200);
  assert.equal(h.table('events').get('linked').case_id, null);
  assert.equal(h.table('activities').size, 0);
});

const seedUnits = (h) => {
  h.table('groups').set('unit-1', { name: 'Rights', supervisor_id: 'supervisor-1', status: 'active' });
  h.table('groups').set('unit-2', { name: 'Migration', supervisor_id: 'supervisor-2', status: 'active' });
  h.table('group_members').set('unit-1_student-1', { group_id: 'unit-1', user_id: 'student-1' });
};

test('unit event audiences use live memberships and supervisor assignments in lists and details', async () => {
  const h = await createHarness(); seedUnits(h);
  const student = { role: 'law_student', uid: 'student-1' };
  const created = await h.request('post', '/events', { ...student, body: payload({ group_id: 'unit-1', visibility: 'unit' }) });
  assert.equal(created.status, 201); assert.equal(created.body.event.case_id, null);
  const params = { eventId: created.body.eventId };
  for (const [role, uid, allowed] of [['law_student', 'student-1', true], ['supervisor', 'supervisor-1', true],
    ['supervisor', 'supervisor-2', false], ['law_student', 'outsider', false], ['lawyer', 'student-1', false]]) {
    const user = { role, uid };
    assert.equal((await h.request('get', '/events', user)).body.length, allowed ? 1 : 0);
    assert.equal((await h.request('get', '/events/:eventId', { ...user, params })).status, allowed ? 200 : 403);
  }
  const supervisor = { role: 'supervisor', uid: 'supervisor-1' };
  assert.equal((await h.request('patch', '/events/:eventId', { ...supervisor, params, body: { title: 'Supervisor update' } })).status, 200);
  assert.equal((await h.request('post', '/events', { ...student, body: payload({ group_id: 'unit-2', visibility: 'unit' }) })).status, 403);
  assert.equal((await h.request('post', '/events', { ...supervisor, body: payload({ group_id: 'unit-1', visibility: 'unit' }) })).status, 201);
  h.table('group_members').delete('unit-1_student-1');
  assert.equal((await h.request('get', '/events', student)).body.length, 0);
  assert.equal((await h.request('get', '/events/:eventId', { ...student, params })).status, 403);
  assert.equal((await h.request('delete', '/events/:eventId', { ...student, params })).status, 403);
});

test('clinic-wide events require admin publication; private events retain their existing audience', async () => {
  const h = await createHarness(); seedUnits(h);
  assert.equal((await h.request('post', '/events', { role: 'law_student', uid: 'student-1', body: payload({ visibility: 'clinic' }) })).status, 403);
  assert.equal((await h.request('post', '/events', { role: 'supervisor', uid: 'supervisor-1', body: payload({ visibility: 'clinic' }) })).status, 403);
  assert.equal((await h.request('post', '/events', { body: payload({ visibility: 'clinic' }) })).status, 201);
  assert.equal((await h.request('post', '/events', { body: payload() })).status, 201);
  for (const role of ['law_student', 'lawyer', 'supervisor']) {
    const result = await h.request('get', '/events', { role, uid: 'outsider' });
    assert.equal(result.status, 200); assert.equal(result.body.length, 1); assert.equal(result.body[0].visibility, 'clinic');
    assert.equal((await h.request('delete', '/events/:eventId', { role, uid: 'outsider', params: { eventId: result.body[0].id } })).status, 403);
  }
});

test('unit calendar includes existing assigned-case events without exposing unassigned case data', async () => {
  const h = await createHarness(); seedUnits(h); seedCases(h);
  h.table('case_assignments').set('unit-case', { case_id: 'case-1', group_id: 'unit-1', assigned_to_type: 'group' });
  h.table('events').set('legacy-case', payload({ case_id: 'case-1' }));
  h.table('events').set('other-case', payload({ case_id: 'case-2', group_id: 'unit-1' }));
  h.table('events').set('unit', payload({ group_id: 'unit-1', visibility: 'unit' }));
  h.table('events').set('clinic', payload({ visibility: 'clinic' }));
  const student = { role: 'law_student', uid: 'student-1', query: { group_id: 'unit-1' } };
  const listed = await h.request('get', '/events', student);
  assert.equal(listed.status, 200); assert.deepEqual(listed.body.map((item) => item.id), ['legacy-case', 'unit']);
  assert.equal((await h.request('get', '/events', { ...student, uid: 'outsider' })).status, 403);
  assert.equal((await h.request('get', '/events', { ...student, role: 'supervisor', uid: 'supervisor-1' })).body.length, 1);
});

test('event categories, real dates, multi-day end dates and unit-case relationships are validated', async () => {
  const h = await createHarness(); seedUnits(h); seedCases(h);
  for (const change of [{ category: 'case' }, { date: '2026-02-30' }, { end_date: '2026-10-19' },
    { group_id: 'unit-1', visibility: 'private' }, { visibility: 'unit' }, { visibility: 'everyone' },
    { case_id: 'case-1', group_id: 'unit-1' }]) {
    assert.equal((await h.request('post', '/events', { body: payload(change) })).status, 400);
  }
  const multi = await h.request('post', '/events', { body: payload({ end_date: '2026-10-21', end_time: '08:00' }) });
  assert.equal(multi.status, 201); assert.equal(multi.body.event.end_date, '2026-10-21');
  const sameDay = await h.request('post', '/events', { body: payload() });
  const moved = await h.request('patch', '/events/:eventId', { params: { eventId: sameDay.body.eventId }, body: { date: '2026-11-02' } });
  assert.equal(moved.status, 200); assert.equal(moved.body.event.end_date, '2026-11-02');
});
