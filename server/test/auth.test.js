import assert from 'node:assert/strict';
import test from 'node:test';
import { createHarness } from '../testSupport/routerHarness.js';

const TIMEOUT = 15 * 60 * 1000;
async function setup(role = 'law_student', provider = 'password') {
  let now = 1800000000000;
  let authTime = Math.floor(now / 1000);
  let failure;
  const options = {
    realAuth: true, now: () => now,
    verifyToken: async (token) => {
      if (failure) throw Object.assign(new Error(failure), { code: failure });
      if (token !== 'valid') throw Object.assign(new Error('Invalid token'), { code: 'auth/argument-error' });
      return { uid: 'existing-uid', email: 'person@example.com', auth_time: authTime, firebase: { sign_in_provider: provider } };
    },
  };
  const h = await createHarness('authRoutes', new Map(), options);
  h.table('users').set('existing-uid', { uid: 'untrusted-profile-uid', role, status: 'active', name: 'Existing Person', supervisor_id: 'keep-this' });
  const headers = { authorization: 'Bearer valid' };
  return {
    h, options, headers,
    advance(ms) { now += ms; },
    reauthenticate() { authTime = Math.floor(now / 1000); },
    fail(code) { failure = code; },
    async start() {
      const response = await h.request('post', '/session', { headers });
      if (response.status === 201) headers['x-session-id'] = response.body.session.id;
      return response;
    },
    request(method = 'get', path = '/session', body = {}) { return h.request(method, path, { headers, body }); },
  };
}

for (const provider of ['password', 'google.com']) {
  test(`${provider}: first sign-in preserves UID, all roles and existing profile fields`, async () => {
    for (const role of ['admin', 'law_student', 'supervisor', 'lawyer', 'client']) {
      const s = await setup(role, provider);
      const before = structuredClone(s.h.table('users').get('existing-uid'));
      const result = await s.start();
      assert.equal(result.status, 201);
      assert.equal(result.body.user.uid, 'existing-uid');
      assert.equal(result.body.user.role, role);
      assert.equal(result.body.session.expiresAt - result.body.session.serverNow, TIMEOUT);
      assert.equal((await s.request()).status, 200);
      assert.equal((await s.request('get', '/me')).body.user.supervisor_id, 'keep-this');
      assert.deepEqual(s.h.table('users').get('existing-uid'), before);
      assert.equal(s.h.table('users').size, 1);
      assert.ok(s.h.tokenChecks.every((check) => check.checkRevoked === true));
    }
  });
}

test('Firebase credentials alone and malformed session secrets cannot access protected endpoints', async () => {
  const s = await setup();
  assert.equal((await s.h.request('get', '/me')).status, 401);
  assert.equal((await s.request('get', '/me')).body.code, 'SESSION_EXPIRED');
  assert.equal((await s.h.request('post', '/session', { headers: { authorization: 'Bearer invalid' } })).status, 401);
  await s.start();
  for (const id of ['', '../../users/admin', 'x'.repeat(43)]) {
    const headers = { ...s.headers, 'x-session-id': id };
    assert.equal((await s.h.request('get', '/me', { headers })).status, 401);
  }
  assert.equal((await s.request('get', '/me')).headers['cache-control'], 'private, no-store');
});

test('exact 15-minute boundary rejects reads and activity; refreshed Firebase tokens cannot resurrect it', async () => {
  const s = await setup(); await s.start();
  s.advance(TIMEOUT - 1);
  assert.equal((await s.request('get', '/me')).status, 200);
  s.advance(1);
  assert.equal((await s.request()).status, 401);
  assert.equal((await s.request('put', '/session/activity')).status, 401);
  assert.equal((await s.start()).body.code, 'REAUTHENTICATION_REQUIRED');
  s.reauthenticate();
  assert.equal((await s.start()).status, 201);
  assert.equal((await s.request()).status, 200);
});

test('real activity extends a valid session using server time; client timestamps and background reads do not', async () => {
  const s = await setup();
  const created = await s.start();
  s.advance(14 * 60 * 1000);
  const active = await s.request('put', '/session/activity', { lastActivityAt: 9999999999999, expiresAt: 9999999999999 });
  assert.equal(active.status, 200);
  assert.equal(active.body.session.expiresAt - created.body.session.expiresAt, 14 * 60 * 1000);
  s.advance(TIMEOUT - 1);
  assert.equal((await s.request()).status, 200);
  assert.equal((await s.request('get', '/me')).status, 200);
  s.advance(1);
  assert.equal((await s.request()).status, 401);
});

test('logout revokes the session durably and neither tab copies nor API calls can reuse it', async () => {
  const s = await setup(); await s.start();
  const copiedHeaders = { ...s.headers };
  assert.equal((await s.request('delete', '/session')).status, 200);
  assert.equal((await s.request()).status, 401);
  const cold = await createHarness('authRoutes', s.h.tables, s.options);
  assert.equal((await cold.request('get', '/me', { headers: copiedHeaders })).status, 401);
  assert.equal((await cold.request('put', '/session/activity', { headers: copiedHeaders })).status, 401);
  s.advance(1000); s.reauthenticate();
  assert.equal((await s.start()).status, 201);
});

test('expiry survives serverless cold starts, concurrent activity and forged browser state', async () => {
  const s = await setup(); await s.start();
  const cold = await createHarness('authRoutes', s.h.tables, s.options);
  s.advance(TIMEOUT);
  const results = await Promise.all([
    s.request('put', '/session/activity'),
    cold.request('put', '/session/activity', { headers: s.headers, body: { expiresAt: Number.MAX_SAFE_INTEGER } }),
    cold.request('get', '/me', { headers: s.headers }),
  ]);
  assert.ok(results.every((result) => result.status === 401));
});

test('sessions are bound to both the verified UID and the original Firebase authentication event', async () => {
  const s = await setup(); await s.start();
  const other = await createHarness('authRoutes', s.h.tables, {
    realAuth: true,
    verifyToken: () => ({ uid: 'other-uid', auth_time: 1800000000 }),
  });
  s.h.table('users').set('other-uid', { status: 'active', role: 'admin' });
  assert.equal((await other.request('get', '/me', { headers: s.headers })).status, 401);
  s.advance(1000); s.reauthenticate();
  assert.equal((await s.request()).status, 401);
});

test('missing/inactive profiles and unknown roles fail without creating or duplicating profiles', async () => {
  const s = await setup('admin', 'google.com');
  s.h.table('users').get('existing-uid').status = 'inactive';
  assert.equal((await s.start()).body.code, 'ACCOUNT_INACTIVE');
  s.h.table('users').get('existing-uid').status = 'active';
  s.h.table('users').get('existing-uid').role = 'superadmin';
  assert.equal((await s.start()).body.code, 'ROLE_INVALID');
  s.h.table('users').delete('existing-uid');
  s.h.table('users').set('different-uid', { email: 'person@example.com', status: 'active', role: 'admin' });
  assert.equal((await s.start()).body.code, 'PROFILE_NOT_FOUND');
  assert.equal(s.h.table('users').size, 1);
  assert.equal(s.h.table('auth_sessions').size, 0);
});

test('expired/revoked Firebase tokens differ from infrastructure failures', async () => {
  const s = await setup(); await s.start();
  s.fail('auth/id-token-expired');
  assert.equal((await s.request()).body.code, 'TOKEN_EXPIRED');
  s.fail('auth/id-token-revoked');
  assert.equal((await s.request()).status, 401);
  s.fail('auth/network-request-failed');
  assert.equal((await s.request()).status, 503);
  s.fail('auth/internal-error');
  assert.equal((await s.request()).status, 503);
});

test('protected case and document endpoints reject an expired application session before reading clinic data', async () => {
  const s = await setup(); await s.start();
  const cases = await createHarness('cases', s.h.tables, s.options);
  const documents = await createHarness('documents', s.h.tables, s.options);
  s.advance(TIMEOUT);
  assert.equal((await cases.request('get', '/', { headers: s.headers })).status, 401);
  assert.equal((await documents.request('get', '/:caseId', { headers: s.headers, params: { caseId: 'private' } })).status, 401);
  assert.ok(!cases.reads.includes('cases'));
  assert.ok(!documents.reads.includes('documents'));
});
