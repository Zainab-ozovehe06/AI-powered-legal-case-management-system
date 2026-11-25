// Real React pages, session transport, Express routes and authentication
// middleware; only Firebase provider/network operations use isolated doubles.
// No production accounts, Google accounts, credentials or Firestore are used.
// Run: node --experimental-vm-modules server/testSupport/authSmoke.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createHarness } from './routerHarness.js';

const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const puppeteer = requireFrontend('puppeteer');
const { createServer } = await import(new URL('../../frontend/node_modules/vite/dist/node/index.js', import.meta.url));
const react = (await import(new URL('../../frontend/node_modules/@vitejs/plugin-react/dist/index.js', import.meta.url))).default;
const tables = new Map();
let offset = 0;
const now = () => Date.now() + offset;
const options = {
  realAuth: true, now,
  verifyToken(token) {
    if (!token?.startsWith('test-only:')) throw Object.assign(new Error('Invalid token'), { code: 'auth/argument-error' });
    return JSON.parse(Buffer.from(token.slice(10), 'base64').toString());
  },
};
const harnesses = await Promise.all(['authRoutes', 'cases', 'events', 'users', 'workspaces'].map((name) => createHarness(name, tables, options)));
const h = harnesses[0];
for (const role of ['admin', 'law_student', 'supervisor', 'lawyer', 'client']) {
  h.table('users').set(role, { name: 'Auth Test', email: `${role}@example.com`, status: 'active', role });
}
const originalProfiles = JSON.stringify([...h.table('users')]);
let sessionStarts = 0;
const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Session-Id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use('/api/auth', async (req, _res, next) => {
  if (req.method === 'POST') { sessionStarts += 1; await new Promise((resolve) => setTimeout(resolve, 200)); }
  next();
}, harnesses[0].router);
app.use('/api/cases', harnesses[1].router);
app.use('/api', harnesses[2].router);
app.use('/api/users', harnesses[3].router);
app.use('/api/groups', harnesses[4].router);

const fakeAuth = `
const originalNow = Date.now;
window.__authTest = { offset: Number(sessionStorage.getItem('test-clock-offset') || 0), emailCalls: 0, googleCalls: 0, nextGoogle: 'law_student', nextGoogleError: null };
Date.now = () => originalNow() + window.__authTest.offset;
const test = window.__authTest;
const listeners = new Set();
const revive = (record) => record ? { ...record, async getIdToken() {
  return 'test-only:' + btoa(JSON.stringify({ uid: record.uid, email: record.email, auth_time: record.authTime }));
} } : null;
let saved;
try { saved = JSON.parse(sessionStorage.getItem('test-firebase-user')); } catch {}
const auth = { currentUser: revive(saved) };
export const getAuth = () => auth;
export const browserSessionPersistence = { type: 'SESSION' };
export const setPersistence = async (_auth, persistence) => { test.persistence = persistence.type; };
export const onAuthStateChanged = (_auth, callback) => {
  listeners.add(callback); queueMicrotask(() => { if (listeners.has(callback)) callback(auth.currentUser); });
  return () => listeners.delete(callback);
};
function signedIn(uid) {
  const record = { uid, email: uid + '@example.com', authTime: Math.floor(Date.now() / 1000) };
  auth.currentUser = revive(record); sessionStorage.setItem('test-firebase-user', JSON.stringify(record));
  for (const callback of listeners) callback(auth.currentUser);
  return { user: auth.currentUser };
}
export const signInWithEmailAndPassword = async (_auth, email, password) => {
  test.emailCalls += 1;
  if (password !== 'test-password') throw Object.assign(new Error('Invalid password'), { code: 'auth/invalid-credential' });
  return signedIn(email.split('@')[0]);
};
export class GoogleAuthProvider { setCustomParameters(params) { this.params = params; } }
export const signInWithPopup = async (_auth, provider) => {
  test.googleCalls += 1; test.googlePrompt = provider.params?.prompt; test.popupUserGesture = navigator.userActivation.isActive;
  if (test.nextGoogleError) {
    const code = test.nextGoogleError; test.nextGoogleError = null;
    throw Object.assign(new Error('Google test error'), { code });
  }
  return signedIn(test.nextGoogle);
};
export const signOut = async () => {
  auth.currentUser = null; sessionStorage.removeItem('test-firebase-user');
  for (const callback of listeners) callback(null);
};
export const createUserWithEmailAndPassword = async (_auth, email) => signedIn(email.split('@')[0]);
export const updateProfile = async () => {};
`;
const fakeFirestore = `
export const getFirestore = () => ({});
export const doc = (...args) => args;
export const serverTimestamp = () => 1;
export const setDoc = async () => {
  if (!sessionStorage.getItem('test-firebase-user')) throw new Error('Registration lost Firebase authentication before profile creation');
  window.__authTest.profileWrites = (window.__authTest.profileWrites || 0) + 1;
};
`;
let apiServer;
let vite;
let browser;
const checks = [];
try {
  apiServer = await new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  const apiUrl = `http://127.0.0.1:${apiServer.address().port}/api`;
  vite = await createServer({
    root: fileURLToPath(new URL('../../frontend/', import.meta.url)), configFile: false, envFile: false,
    cacheDir: fileURLToPath(new URL('../../frontend/node_modules/.vite-auth-smoke/', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react-router-dom', 'lucide-react'] },
    logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiUrl), 'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('auth-isolated-test') },
    plugins: [{
      name: 'isolated-auth-sdk', enforce: 'pre',
      resolveId(id) { if (['firebase/app', 'firebase/auth', 'firebase/firestore'].includes(id)) return '\0isolated-' + id; },
      load(id) {
        if (id === '\0isolated-firebase/app') return 'export const initializeApp = () => ({});';
        if (id === '\0isolated-firebase/auth') return fakeAuth;
        if (id === '\0isolated-firebase/firestore') return fakeFirestore;
      },
    }, react()],
  });
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(45000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error('Browser:', message.text()); });
  const heading = (target) => target.waitForFunction(() => location.pathname === '/' && document.querySelector('.sidebar-logout-button'));
  const login = async (target, role = 'law_student') => {
    await target.goto(`${url}/login`);
    await target.waitForSelector('input[type="email"]');
    await target.type('input[type="email"]', `${role}@example.com`);
    await target.type('input[type="password"]', 'test-password');
    await target.click('button[type="submit"]');
    await heading(target);
  };
  const logout = async (target) => {
    await target.click('.sidebar-logout-button');
    await target.waitForSelector('input[type="email"]');
    assert.ok(target.url().endsWith('/login'));
  };

  for (const role of ['admin', 'law_student', 'lawyer', 'supervisor', 'client']) {
    await login(page, role);
    const text = await page.$eval('main', (node) => node.textContent);
    assert.ok(text.includes(role === 'admin' ? 'Clinic Overview' : role === 'supervisor' ? 'Supervisor Dashboard' : role === 'client' ? 'Client Dashboard' : 'Welcome back'));
    assert.deepEqual(await page.evaluate(() => [window.__authTest.emailCalls, window.__authTest.googleCalls, window.__authTest.persistence]), [1, 0, 'SESSION']);
    await logout(page);
    console.log(`Passed email/password dashboard: ${role}`);
  }
  checks.push('Email/password: first attempt and correct dashboard for all five roles');

  await login(page);
  await page.goto(`${url}/admin/users`); await heading(page);
  assert.ok((await page.$eval('main', (node) => node.textContent)).includes('Welcome back'));
  await logout(page);
  checks.push('RoleProtectedRoute rejects an authenticated student visiting an administrator route');

  for (const role of ['admin', 'law_student', 'lawyer', 'supervisor', 'client']) {
    await page.goto(`${url}/login`);
    await page.waitForSelector('.auth-google-button');
    await page.evaluate((role) => { window.__authTest.nextGoogle = role; }, role);
    await page.click('.auth-google-button');
    await heading(page);
    const text = await page.$eval('main', (node) => node.textContent);
    assert.ok(text.includes(role === 'admin' ? 'Clinic Overview' : role === 'supervisor' ? 'Supervisor Dashboard' : role === 'client' ? 'Client Dashboard' : 'Welcome back'));
    assert.deepEqual(await page.evaluate(() => [window.__authTest.emailCalls, window.__authTest.googleCalls, window.__authTest.googlePrompt, window.__authTest.popupUserGesture]), [0, 1, 'select_account', true]);
    await logout(page);
    console.log(`Passed Google dashboard: ${role}`);
  }
  checks.push('Google: independent first attempt, user-initiated popup and account selection for all roles');

  await login(page, 'lawyer');
  const starts = sessionStarts;
  await page.reload(); await heading(page);
  assert.equal(sessionStarts, starts);
  const other = await browser.newPage();
  await other.goto(url); await other.waitForSelector('input[type="email"]');
  checks.push('Refresh validates existing session; a new tab cannot silently restore one');
  await login(other, 'lawyer');
  await page.bringToFront();
  await page.click('a[href="/cases"]');
  await page.waitForFunction(() => location.pathname === '/cases');
  await logout(page);
  await other.waitForSelector('input[type="email"]');
  await other.close();
  await page.goBack().catch(() => null);
  await page.waitForSelector('input[type="email"]');
  assert.equal(await page.$('main'), null);
  checks.push('Logout synchronizes tabs and browser Back cannot reveal protected pages');

  await login(page);
  const old = await page.evaluate(() => ({ session: JSON.parse(sessionStorage.getItem('law-clinic-session')), firebase: JSON.parse(sessionStorage.getItem('test-firebase-user')) }));
  offset += 900000;
  await page.evaluate((nextOffset) => {
    window.__authTest.offset = nextOffset;
    sessionStorage.setItem('test-clock-offset', String(nextOffset));
    window.dispatchEvent(new Event('law-clinic-session-changed'));
  }, offset);
  await page.waitForSelector('input[type="email"]');
  const oldToken = 'test-only:' + Buffer.from(JSON.stringify({ uid: old.firebase.uid, auth_time: old.firebase.authTime })).toString('base64');
  assert.equal((await fetch(`${apiUrl}/auth/me`, { headers: { Authorization: `Bearer ${oldToken}`, 'X-Session-Id': old.session.id } })).status, 401);
  // Reinject the browser's previous Firebase state and forge a future deadline.
  await page.evaluate((old) => {
    sessionStorage.setItem('test-firebase-user', JSON.stringify(old.firebase));
    sessionStorage.setItem('law-clinic-session', JSON.stringify({ ...old.session, expiresAt: Number.MAX_SAFE_INTEGER }));
  }, old);
  await page.reload(); await page.waitForSelector('input[type="email"]');
  await page.evaluate((nextOffset) => { window.__authTest.offset = nextOffset; }, offset);
  await page.click('.auth-google-button'); await heading(page);
  assert.equal(await page.evaluate(() => window.__authTest.googleCalls), 1);
  await logout(page);
  checks.push('Inactivity logs out; API and forged restored state are denied; fresh Google sign-in succeeds');

  await page.goto(`${url}/login`); await page.waitForSelector('.auth-google-button');
  await page.evaluate(() => { window.__authTest.nextGoogleError = 'auth/account-exists-with-different-credential'; });
  await page.click('.auth-google-button');
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('another sign-in method'));
  await page.evaluate(() => { window.__authTest.nextGoogleError = 'auth/popup-closed-by-user'; });
  await page.click('.auth-google-button');
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('cancelled'));
  await page.type('input[type="email"]', 'law_student@example.com');
  await page.type('input[type="password"]', 'wrong-password');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('Invalid email or password'));
  await page.click('input[type="password"]', { clickCount: 3 });
  await page.type('input[type="password"]', 'test-password');
  await page.click('button[type="submit"]'); await heading(page);
  await logout(page);
  checks.push('Google cancellation/account conflict and wrong password do not prevent a subsequent email/password login');
  await page.goto(`${url}/register`); await page.waitForSelector('input[type="password"]');
  await page.type('input[type="text"]', 'Registration Test');
  await page.type('input[type="email"]', 'new_student@example.com');
  await page.type('input[type="password"]', 'test-password');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('.auth-message')?.textContent.includes('Account created successfully'));
  assert.equal(await page.evaluate(() => window.__authTest.profileWrites), 1);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('law-clinic-session')), null);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('test-firebase-user')), null);
  checks.push('Registration completes its profile write and signs out without an automatic application session');
  assert.equal(JSON.stringify([...h.table('users')]), originalProfiles);
  assert.deepEqual(errors, []);
  checks.push('No profiles, UIDs, roles or permissions changed; no browser runtime errors');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  await browser?.close();
  await vite?.close();
  await new Promise((resolve) => apiServer ? apiServer.close(resolve) : resolve());
}
