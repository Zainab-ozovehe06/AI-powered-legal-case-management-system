import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import express from 'express';
import { fileURLToPath } from 'node:url';

// Run real Express handlers and permission helpers against an isolated Firestore
// double. No Firebase credentials or production records are used.
const sequences = new WeakMap();
export async function createHarness(routerName = 'events', sharedTables = new Map(), options = {}) {
  const tables = sharedTables;
  const reads = [];
  const storedFiles = new Map();
  const storageCalls = [];
  const tokenChecks = [];
  const storage = { bucket: () => ({ name: 'test-bucket', file: (name) => ({
    async save(buffer, config) { storageCalls.push(['save', name, config]); storedFiles.set(name, Buffer.from(buffer)); },
    async getMetadata() { storageCalls.push(['metadata', name]); if (!storedFiles.has(name)) throw Object.assign(new Error('Not found'), { code: 404 }); return [{ size: storedFiles.get(name).length }]; },
    async download() { storageCalls.push(['download', name]); return [storedFiles.get(name)]; },
    async delete() { storageCalls.push(['delete', name]); storedFiles.delete(name); },
  }) }) };
  if (!sequences.has(tables)) sequences.set(tables, { nextId: 0 });
  const sequence = sequences.get(tables);
  const defaultAuthTime = options.authTime ?? Math.floor((options.now ? options.now() : Date.now()) / 1000);
  let timestamp = 1793203200;
  const table = (name) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  };
  const snapshot = (name, id) => ({
    id, exists: table(name).has(id), ref: query(name).doc(id),
    data: () => structuredClone(table(name).get(id)),
  });
  const query = (name, filters = []) => ({
    where(field, operator, value) {
      assert.equal(operator, '==');
      return query(name, [...filters, [field, value]]);
    },
    async get() {
      reads.push(name);
      return { docs: [...table(name).keys()]
        .filter((id) => filters.every(([field, value]) => table(name).get(id)[field] === value))
        .map((id) => snapshot(name, id)) };
    },
    doc(id = `test-${++sequence.nextId}`) {
      return {
        id,
        async get() { reads.push(name); return snapshot(name, id); },
        async set(data) { table(name).set(id, structuredClone(data)); },
        async update(data) {
          assert.ok(table(name).has(id));
          table(name).set(id, { ...table(name).get(id), ...structuredClone(data) });
        },
        async delete() { table(name).delete(id); },
      };
    },
    async add(data) { const ref = this.doc(); await ref.set(data); return ref; },
  });
  const db = {
    collection: (name) => query(name),
    async runTransaction(update) {
      const run = async () => {
        const writes = [];
        const result = await update({
          get: (ref) => ref.get(),
          update: (ref, data) => writes.push(() => ref.update(data)),
          set: (ref, data) => writes.push(() => ref.set(data)),
        });
        for (const write of writes) await write();
        return result;
      };
      const pending = (sequence.transaction || Promise.resolve()).then(run);
      sequence.transaction = pending.catch(() => {});
      return pending;
    },
    batch() {
      const writes = [];
      return {
        set(ref, data) { writes.push(() => ref.set(data)); },
        update(ref, data) { writes.push(() => ref.update(data)); },
        delete(ref) { writes.push(() => ref.delete()); },
        async commit() { for (const write of writes) await write(); },
      };
    },
  };
  const context = vm.createContext({
    URL, Buffer, structuredClone, console: { ...console, error() {} },
    Date: class extends Date { static now() { return options.now ? options.now() : Date.now(); } },
    process: { env: { GEMINI_API_KEY: 'isolated-test-key', LAW_CLINIC_RESOURCE_DIR: fileURLToPath(new URL('./missing-test-resources/', import.meta.url)) } },
    fetch: options.fetch || (() => { throw new Error('Network access is disabled in tests'); }),
  });
  const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
    Object.entries(exports).forEach(([name, value]) => this.setExport(name, value));
  }, { context });
  const stubAuth = (_req, _res, next) => next();
  const requireRole = (role) => (req, res, next) => req.currentUser.role === role ? next() : res.status(403).json({ error: 'Access denied' });
  const modules = new Map();
  const base = new URL('../', import.meta.url);
  modules.set(new URL('config/firebase.js', base).href, synthetic({ db, storage,
    auth: { async verifyIdToken(token, checkRevoked) {
      tokenChecks.push({ token, checkRevoked });
      if (options.verifyToken) return options.verifyToken(token);
      if (token !== 'valid') throw Object.assign(new Error('Invalid token'), { code: 'auth/argument-error' });
      return { uid: options.authUid || 'lawyer-1', auth_time: defaultAuthTime };
    } },
    admin: { firestore: { FieldValue: { serverTimestamp: () => ({ _seconds: ++timestamp }) } } },
  }));
  if (!options.realAuth) modules.set(new URL('middleware/authenticate.js', base).href, synthetic({ requireAuth: stubAuth,
    requireAdminRole: requireRole('admin'), requireStudentRole: requireRole('law_student') }));
  modules.set('express', synthetic({ default: express }));
  const moduleFor = async (url) => {
    if (!modules.has(url)) {
      if (!url.startsWith('file:')) modules.set(url, import(url).then((exports) => synthetic(exports)));
      else modules.set(url, readFile(new URL(url), 'utf8').then((source) => new vm.SourceTextModule(source, { identifier: url, context, initializeImportMeta(meta) { meta.url = url; } })));
    }
    return modules.get(url);
  };
  const routerModule = await moduleFor(new URL(`routes/${routerName}.js`, base).href);
  await routerModule.link(async (specifier, reference) => moduleFor(specifier.startsWith('.') ? new URL(specifier, reference.identifier).href : specifier));
  await routerModule.evaluate();
  const router = routerModule.namespace.default;
  return {
    table, tables, reads, router, storedFiles, storageCalls, tokenChecks,
    async request(method, path, { role = 'admin', uid = 'admin-1', body = {}, params = {}, query: requestQuery = {}, headers = {}, file, files } = {}) {
      const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
      assert.ok(route, `${method} ${path} must exist`);
      const req = { currentUser: { role, uid, name: uid }, body, params, query: requestQuery, headers, file, files };
      const res = {
        statusCode: 200,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = JSON.parse(JSON.stringify(data)); return this; },
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        send(data) { this.body = data; return this; },
      };
      const originalError = console.error;
      console.error = () => {};
      try {
        const run = async (index) => {
          const layer = route.route.stack[index];
          if (!layer) return;
          let following;
          await layer.handle(req, res, (error) => {
            if (error) { res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : error.statusCode || 400).json({ error: error.message }); return; }
            following = run(index + 1);
          });
          if (following) await following;
        };
        await run(0);
      } finally { console.error = originalError; }
      return { status: res.statusCode, body: res.body, headers: res.headers };
    },
  };
}
