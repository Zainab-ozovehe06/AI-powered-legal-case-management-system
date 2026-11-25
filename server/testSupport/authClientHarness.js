import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Run the real browser session transport/monitor with deterministic time and no
// Firebase credentials, network, or production data.
export async function createAuthClientHarness() {
  let now = 1800000000000;
  let nextTimer = 0;
  const timers = new Map();
  const requests = [];
  const tokenCalls = [];
  const events = () => {
    const handlers = new Map();
    return {
      addEventListener(type, callback) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(callback); },
      removeEventListener(type, callback) { handlers.get(type)?.delete(callback); },
      dispatchEvent(event) { for (const callback of handlers.get(event.type) || []) callback(event); },
    };
  };
  const storage = () => {
    const values = new Map();
    return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  };
  const window = events();
  const document = { ...events(), visibilityState: 'visible' };
  const sessionStorage = storage();
  const localStorage = storage();
  const auth = { currentUser: { uid: 'existing-uid', async getIdToken(force = false) { tokenCalls.push(force); return force ? 'refreshed' : 'valid'; } } };
  const server = { expiresAt: now + 900000, failure: null, revoked: false };
  const fetch = async (url, options) => {
    requests.push({ url, options });
    if (server.beforeRequest) await server.beforeRequest();
    let code = server.failure;
    if (code === 'TOKEN_EXPIRED' && options.headers.get('Authorization') === 'Bearer refreshed') code = null;
    if (!code && (now >= server.expiresAt || server.revoked)) code = 'SESSION_EXPIRED';
    if (code) return Response.json({ code, message: 'Sign in again.' }, { status: server.failureStatus || 401 });
    if (options.method === 'DELETE') { server.revoked = true; return Response.json({}); }
    if (options.method === 'PUT') server.expiresAt = now + 900000;
    return Response.json({
      session: { id: 'A'.repeat(43), uid: 'existing-uid', expiresAt: server.expiresAt, serverNow: now },
      user: { uid: 'existing-uid', role: 'law_student' },
    }, { status: options.method === 'POST' && url.endsWith('/auth/session') ? 201 : 200 });
  };
  const setTimer = (callback, delay, interval = false) => {
    const id = ++nextTimer;
    timers.set(id, { callback, at: now + delay, interval: interval ? delay : 0 });
    return id;
  };
  const context = vm.createContext({
    window, document, sessionStorage, localStorage, auth, fetch,
    Headers, Response, Event, CustomEvent, AbortSignal, console,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, delay) => setTimer(callback, delay),
    clearTimeout: (id) => timers.delete(id),
    setInterval: (callback, delay) => setTimer(callback, delay, true),
    clearInterval: (id) => timers.delete(id),
  });
  const source = await readFile(new URL('../../frontend/src/services/authSession.js', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, { context, initializeImportMeta(meta) { meta.env = { VITE_API_BASE_URL: 'https://api.test/api' }; } });
  await module.link(() => new vm.SyntheticModule(['auth'], function () { this.setExport('auth', auth); }, { context }));
  await module.evaluate();
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return {
    api: module.namespace, auth, window, document, sessionStorage, localStorage, requests, tokenCalls, server, flush,
    async advance(ms) {
      const target = now + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.at;
        if (timer.interval) timer.at += timer.interval; else timers.delete(id);
        timer.callback();
        await flush();
      }
      now = target;
      await flush();
    },
  };
}
