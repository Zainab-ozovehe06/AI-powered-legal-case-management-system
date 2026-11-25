import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthClientHarness } from '../testSupport/authClientHarness.js';

test('frontend automatically expires at exactly 15 minutes; polling never sends activity', async () => {
  const h = await createAuthClientHarness();
  await h.api.beginSession(h.auth.currentUser);
  let expired = 0;
  const stop = h.api.monitorSession(() => { expired += 1; });
  await h.advance(899999);
  assert.ok(h.api.readSession()); assert.equal(expired, 0);
  await h.advance(1);
  assert.equal(h.api.readSession(), null); assert.equal(expired, 1);
  assert.ok(!h.requests.some(({ options }) => options.method === 'PUT'));
  stop();
});

test('trusted activity renews the session but synthetic events cannot keep it alive', async () => {
  const h = await createAuthClientHarness();
  await h.api.beginSession(h.auth.currentUser);
  const stop = h.api.monitorSession(() => {});
  await h.advance(14 * 60000);
  h.window.dispatchEvent({ type: 'pointerdown', isTrusted: true });
  await h.flush();
  assert.equal(h.requests.filter(({ options }) => options.method === 'PUT').length, 1);
  await h.advance(14 * 60000);
  h.window.dispatchEvent({ type: 'keydown', isTrusted: false });
  await h.advance(60000);
  assert.equal(h.api.readSession(), null);
  stop();
});

test('expired Firebase tokens refresh once without discarding a valid app session', async () => {
  const h = await createAuthClientHarness(); await h.api.beginSession(h.auth.currentUser);
  h.server.failure = 'TOKEN_EXPIRED';
  const response = await h.api.authenticatedFetch('https://api.test/api/cases');
  assert.equal(response.status, 200);
  assert.equal(h.tokenCalls.filter(Boolean).length, 1);
  assert.ok(h.api.readSession());
});

test('app session expiry is never retried as a token refresh or silently replaced', async () => {
  const h = await createAuthClientHarness(); await h.api.beginSession(h.auth.currentUser);
  h.server.failure = 'SESSION_EXPIRED';
  assert.equal((await h.api.authenticatedFetch('https://api.test/api/cases')).status, 401);
  assert.equal(h.api.readSession(), null);
  assert.ok(!h.tokenCalls.includes(true));
  assert.equal(h.requests.filter(({ options }) => options.method === 'POST').length, 1);
});

test('restored Firebase users without an app session cannot fetch protected information', async () => {
  const h = await createAuthClientHarness();
  await assert.rejects(h.api.authenticatedFetch('https://api.test/api/cases'), { code: 'SESSION_EXPIRED' });
  assert.equal(h.requests.length, 0);
});

test('forged client expiry cannot bypass the server deadline', async () => {
  const h = await createAuthClientHarness(); await h.api.beginSession(h.auth.currentUser);
  const session = h.api.readSession();
  h.sessionStorage.setItem(h.api.SESSION_KEY, JSON.stringify({ ...session, expiresAt: Number.MAX_SAFE_INTEGER }));
  await h.advance(900000);
  assert.equal((await h.api.authenticatedFetch('https://api.test/api/documents')).status, 401);
  assert.equal(h.api.readSession(), null);
});

test('logout clears tab credentials, revokes the server session and broadcasts no secret', async () => {
  const h = await createAuthClientHarness(); await h.api.beginSession(h.auth.currentUser);
  const sessionId = h.api.readSession().id;
  await h.api.endSession();
  assert.equal(h.api.readSession(), null); assert.equal(h.server.revoked, true);
  const notification = h.localStorage.getItem(h.api.LOGOUT_KEY);
  assert.equal(JSON.parse(notification).uid, 'existing-uid');
  assert.ok(!notification.includes(sessionId));
  assert.ok(!notification.includes('Bearer'));
});

test('JSON, multipart and download requests all carry the session alongside Firebase authentication', async () => {
  const h = await createAuthClientHarness(); await h.api.beginSession(h.auth.currentUser);
  for (const path of ['/cases', '/documents/id/upload', '/documents/id/download', '/ai/assistant']) {
    const response = await h.api.authenticatedFetch(`https://api.test/api${path}`, { method: 'POST' });
    assert.equal(response.status, 200);
    const request = h.requests.at(-1);
    assert.equal(request.options.headers.get('X-Session-Id'), 'A'.repeat(43));
    assert.equal(request.options.headers.get('Authorization'), 'Bearer valid');
    assert.equal(request.options.cache, 'no-store');
    assert.equal(request.options.headers.has('Content-Type'), false);
  }
});

test('Firebase token revocation during SDK refresh clears the application session', async () => {
  const h = await createAuthClientHarness(); await h.api.beginSession(h.auth.currentUser);
  h.auth.currentUser.getIdToken = async () => { throw Object.assign(new Error('Revoked'), { code: 'auth/user-token-expired' }); };
  await assert.rejects(h.api.authenticatedFetch('https://api.test/api/cases'), { code: 'auth/user-token-expired' });
  assert.equal(h.api.readSession(), null);
});

test('activity arriving during a validation request is recorded after that request finishes', async () => {
  const h = await createAuthClientHarness(); await h.api.beginSession(h.auth.currentUser);
  let release;
  h.server.beforeRequest = () => {
    h.server.beforeRequest = null;
    return new Promise((resolve) => { release = resolve; });
  };
  const stop = h.api.monitorSession(() => {});
  await h.advance(60000);
  h.window.dispatchEvent({ type: 'pointerdown', isTrusted: true });
  release();
  await h.flush(); await h.flush();
  assert.equal(h.requests.filter(({ options }) => options.method === 'PUT').length, 1);
  assert.ok(h.api.readSession());
  stop();
});

test('disabled-account errors are not replaced with an inactivity message', async () => {
  const h = await createAuthClientHarness(); await h.api.beginSession(h.auth.currentUser);
  let expired = 0;
  h.server.failure = 'ACCOUNT_INACTIVE'; h.server.failureStatus = 403;
  const stop = h.api.monitorSession(() => { expired += 1; });
  await h.advance(60000);
  assert.equal(h.api.readSession(), null); assert.equal(expired, 0);
  stop();
});

test('the UI locks at the deadline even if a validation request is still waiting for the network', async () => {
  const h = await createAuthClientHarness(); await h.api.beginSession(h.auth.currentUser);
  let release;
  h.server.beforeRequest = () => {
    h.server.beforeRequest = null;
    return new Promise((resolve) => { release = resolve; });
  };
  const locks = [];
  let expired = 0;
  const stop = h.api.monitorSession(() => { expired += 1; }, (locked) => locks.push(locked));
  await h.advance(899999);
  assert.deepEqual(locks, []);
  await h.advance(1);
  assert.deepEqual(locks, [true]);
  release(); await h.flush(); await h.flush();
  assert.equal(h.api.readSession(), null); assert.equal(expired, 1);
  stop();
});
