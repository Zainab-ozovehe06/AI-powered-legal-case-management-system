import { createHash, randomBytes } from 'node:crypto';
import { db } from '../config/firebase.js';

export const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const RECENT_SIGN_IN_MS = 5 * 60 * 1000;
const sessionError = () => Object.assign(new Error('Your session expired. Please sign in again.'), {
  statusCode: 401, code: 'SESSION_EXPIRED',
});
const sessionRef = (id) => {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(id)) throw sessionError();
  // Only a hash of the session secret is stored in Firestore.
  return db.collection('auth_sessions').doc(createHash('sha256').update(id).digest('hex'));
};
const assertSession = (data, identity, now) => {
  if (!data || data.uid !== identity.uid || data.authTime !== identity.auth_time
    || data.revokedAt != null || !Number.isFinite(data.lastActivityAt)
    || now - data.lastActivityAt >= SESSION_TIMEOUT_MS || data.lastActivityAt > now) {
    throw sessionError();
  }
};
const sessionInfo = (data, now) => ({
  uid: data.uid, expiresAt: data.lastActivityAt + SESSION_TIMEOUT_MS, serverNow: now,
});

export async function createSession(identity) {
  const now = Date.now();
  // Token refresh does not change auth_time. An old Firebase session cannot
  // create a new application session after the inactivity deadline.
  const signedInAt = identity.auth_time * 1000;
  if (!Number.isFinite(signedInAt) || now - signedInAt > RECENT_SIGN_IN_MS || signedInAt > now + 5000) {
    throw Object.assign(new Error('Please authenticate again to start a new session.'), {
      statusCode: 401, code: 'REAUTHENTICATION_REQUIRED',
    });
  }
  const id = randomBytes(32).toString('base64url');
  const data = { uid: identity.uid, authTime: identity.auth_time, createdAt: now, lastActivityAt: now, revokedAt: null };
  await sessionRef(id).set(data);
  return { id, ...sessionInfo(data, now) };
}

export async function validateSession(id, identity) {
  const snap = await sessionRef(id).get();
  const now = Date.now();
  const data = snap.exists ? snap.data() : null;
  assertSession(data, identity, now);
  return sessionInfo(data, now);
}

export async function recordSessionActivity(id, identity) {
  const ref = sessionRef(id);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const now = Date.now();
    const data = snap.exists ? snap.data() : null;
    assertSession(data, identity, now);
    transaction.update(ref, { lastActivityAt: now });
    return sessionInfo({ ...data, lastActivityAt: now }, now);
  });
}

export async function revokeSession(id, identity) {
  const ref = sessionRef(id);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.exists ? snap.data() : null;
    if (data?.uid === identity.uid && data.authTime === identity.auth_time && data.revokedAt == null) {
      transaction.update(ref, { revokedAt: Date.now() });
    }
  });
}
