import { auth } from './firebase';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
export const SESSION_KEY = 'law-clinic-session';
export const LOGOUT_KEY = 'law-clinic-logout';
export const SESSION_CHANGED = 'law-clinic-session-changed';
export const SESSION_ENDED = 'law-clinic-session-ended';
export const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const errorWithCode = (message, code) => Object.assign(new Error(message), { code });

export function readSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return session?.id && session.uid && Number.isFinite(session.expiresAt) ? session : null;
  } catch { return null; }
}

function saveSession(next, previous = {}, requestedAt = Date.now()) {
  const session = {
    id: next.id || previous.id,
    uid: next.uid || previous.uid,
    // Use server elapsed time rather than trusting the browser's clock.
    expiresAt: requestedAt + Math.max(0, next.expiresAt - next.serverNow),
  };
  if (!session.id || !session.uid || !Number.isFinite(session.expiresAt)) {
    throw errorWithCode('Unable to start a secure session.', 'SESSION_INVALID');
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(SESSION_CHANGED));
  return session;
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(SESSION_CHANGED));
}

function rejectSession(message) {
  clearSession();
  window.dispatchEvent(new CustomEvent(SESSION_ENDED, { detail: message }));
}

async function responseError(response) {
  const body = await response.json().catch(() => ({}));
  return errorWithCode(body.message || body.error || 'Authentication failed. Please try again.', body.code || 'AUTH_UNAVAILABLE');
}

async function sendAuthenticated(url, options, user, sessionId) {
  const send = async (refresh) => {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${await user.getIdToken(refresh)}`);
    if (sessionId) headers.set('X-Session-Id', sessionId);
    return fetch(url, { ...options, headers, cache: 'no-store' });
  };
  let response = await send(false);
  // Retry only a token that expired in transit. Never retry an expired app
  // session, revoked token, or a denied permission as a new login.
  if (response.status === 401 && (await response.clone().json().catch(() => ({}))).code === 'TOKEN_EXPIRED') {
    response = await send(true);
  }
  return response;
}

export async function getAuthHeaders(json = true) {
  const session = readSession();
  const user = auth.currentUser;
  if (!user || !session || session.uid !== user.uid) {
    rejectSession('Please sign in again.');
    throw errorWithCode('Please sign in again.', 'SESSION_EXPIRED');
  }
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    // authenticatedFetch obtains the Firebase token once and handles refresh.
    'X-Session-Id': session.id,
  };
}

export async function authenticatedFetch(url, options = {}) {
  const session = readSession();
  const user = auth.currentUser;
  if (!user || !session || session.uid !== user.uid) {
    rejectSession('Please sign in again.');
    throw errorWithCode('Please sign in again.', 'SESSION_EXPIRED');
  }
  let response;
  try {
    response = await sendAuthenticated(url, options, user, session.id);
  } catch (error) {
    if (['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-disabled'].includes(error.code)
      && readSession()?.id === session.id) rejectSession('Please sign in again.');
    throw error;
  }
  if (response.status === 401 || response.status === 403) {
    const error = await responseError(response.clone());
    const ended = response.status === 401 || ['ACCOUNT_INACTIVE', 'PROFILE_NOT_FOUND', 'ROLE_INVALID'].includes(error.code);
    if (ended && readSession()?.id === session.id) rejectSession(error.message);
  }
  return response;
}

export async function beginSession(user) {
  const requestedAt = Date.now();
  const response = await sendAuthenticated(`${API_BASE_URL}/auth/session`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
  }, user);
  if (!response.ok) throw await responseError(response);
  const result = await response.json();
  if (auth.currentUser?.uid !== user.uid) throw errorWithCode('Sign-in was cancelled.', 'auth/cancelled-popup-request');
  saveSession(result.session, {}, requestedAt);
  return result.user;
}

export async function validateCurrentSession(activity = false) {
  const requestedAt = Date.now();
  const before = readSession();
  const response = await authenticatedFetch(`${API_BASE_URL}/auth/session${activity ? '/activity' : ''}`, {
    method: activity ? 'PUT' : 'GET', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw await responseError(response);
  const result = await response.json();
  if (!before || readSession()?.id !== before.id) throw errorWithCode('Please sign in again.', 'SESSION_EXPIRED');
  saveSession(result.session, before, requestedAt);
  return result.user;
}

export async function endSession() {
  const session = readSession();
  const user = auth.currentUser;
  clearSession();
  if (session && user) {
    // Non-sensitive logout notification; Firebase credentials and session
    // secrets stay in tab-scoped sessionStorage.
    try { localStorage.setItem(LOGOUT_KEY, JSON.stringify({ uid: user.uid, at: Date.now(), nonce: Math.random() })); } catch { /* Storage may be disabled. */ }
    try {
      const response = await sendAuthenticated(`${API_BASE_URL}/auth/session`, {
        method: 'DELETE', keepalive: true, signal: AbortSignal.timeout(10000),
      }, user, session.id);
      if (!response.ok) throw await responseError(response);
    } catch { /* Local access is already cleared; the server also enforces inactivity. */ }
  }
}

// Timers enforce the UI deadline; the server checks it again on every request.
// Only user interaction sends activity. Polling and tab focus never renew it.
export function monitorSession(onExpire, onLock = () => {}) {
  let expiryTimer;
  let activityTimer;
  let lastSent = 0;
  let stopped = false;
  let checking = false;
  let pendingActivity = false;
  let locked = false;
  const lock = () => { if (!locked) { locked = true; onLock(true); } };
  const check = async (activity = false) => {
    if (stopped) return;
    if (readSession()?.expiresAt <= Date.now()) lock();
    if (checking) { pendingActivity ||= activity; return; }
    checking = true;
    try {
      await validateCurrentSession(activity);
      if (!stopped && readSession()?.expiresAt <= Date.now()) onExpire();
    }
    catch (error) {
      const session = readSession();
      if (!stopped && (session ? session.expiresAt <= Date.now() : error.code === 'SESSION_EXPIRED')) onExpire();
    } finally {
      checking = false;
      if (locked && !stopped) { locked = false; onLock(false); }
      scheduleExpiry();
      if (pendingActivity && !stopped && readSession()) { pendingActivity = false; check(true); }
    }
  };
  const scheduleExpiry = () => {
    clearTimeout(expiryTimer);
    if (stopped) return;
    const session = readSession();
    if (session) expiryTimer = setTimeout(() => {
      // Duplicated tabs may share a session. Confirm the authoritative deadline
      // before logging out a session still active in the other tab.
      lock();
      check();
    }, Math.max(0, session.expiresAt - Date.now()));
  };
  const sendActivity = () => {
    activityTimer = undefined;
    lastSent = Date.now();
    check(true);
  };
  const onActivity = (event) => {
    if (!event.isTrusted || document.visibilityState === 'hidden') return;
    const session = readSession();
    if (!session) return;
    if (session.expiresAt <= Date.now()) { check(); return; }
    const wait = Math.max(0, 30000 - (Date.now() - lastSent));
    if (!wait || session.expiresAt - Date.now() < 30000) {
      clearTimeout(activityTimer);
      sendActivity();
    } else if (!activityTimer) activityTimer = setTimeout(sendActivity, wait);
  };
  const onVisible = () => {
    if (document.visibilityState !== 'hidden') check();
    else if (activityTimer) { clearTimeout(activityTimer); sendActivity(); }
  };
  const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
  events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
  window.addEventListener(SESSION_CHANGED, scheduleExpiry);
  window.addEventListener('focus', onVisible);
  document.addEventListener('visibilitychange', onVisible);
  const validationTimer = setInterval(() => check(), 60000);
  scheduleExpiry();
  return () => {
    stopped = true;
    clearTimeout(expiryTimer); clearTimeout(activityTimer); clearInterval(validationTimer);
    events.forEach((name) => window.removeEventListener(name, onActivity));
    window.removeEventListener(SESSION_CHANGED, scheduleExpiry);
    window.removeEventListener('focus', onVisible);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
