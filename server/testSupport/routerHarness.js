import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import express from 'express';

// Run real Express handlers and permission helpers against an isolated Firestore
// double. No Firebase credentials or production records are used.
export async function createHarness(routerName = 'events', sharedTables = new Map()) {
  const tables = sharedTables;
  const reads = [];
  let nextId = 0;
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
    doc(id = `test-${++nextId}`) {
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
  const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
    Object.entries(exports).forEach(([name, value]) => this.setExport(name, value));
  });
  const stubAuth = (_req, _res, next) => next();
  const requireRole = (role) => (req, res, next) => req.currentUser.role === role ? next() : res.status(403).json({ error: 'Access denied' });
  const modules = new Map();
  const base = new URL('../', import.meta.url);
  modules.set(new URL('config/firebase.js', base).href, synthetic({ db,
    admin: { firestore: { FieldValue: { serverTimestamp: () => ({ _seconds: ++timestamp }) } } },
  }));
  modules.set(new URL('middleware/authenticate.js', base).href, synthetic({ requireAuth: stubAuth,
    requireAdminRole: requireRole('admin'), requireStudentRole: requireRole('law_student') }));
  modules.set('express', synthetic({ default: express }));
  const moduleFor = async (url) => {
    if (!modules.has(url)) modules.set(url, readFile(new URL(url), 'utf8').then((source) => new vm.SourceTextModule(source, { identifier: url })));
    return modules.get(url);
  };
  const routerModule = await moduleFor(new URL(`routes/${routerName}.js`, base).href);
  await routerModule.link(async (specifier, reference) => moduleFor(specifier === 'express' ? 'express' : new URL(specifier, reference.identifier).href));
  await routerModule.evaluate();
  const router = routerModule.namespace.default;
  return {
    table, tables, reads, router,
    async request(method, path, { role = 'admin', uid = 'admin-1', body = {}, params = {}, query: requestQuery = {} } = {}) {
      const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
      assert.ok(route, `${method} ${path} must exist`);
      const req = { currentUser: { role, uid, name: uid }, body, params, query: requestQuery };
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = JSON.parse(JSON.stringify(data)); return this; },
      };
      const originalError = console.error;
      console.error = () => {};
      try {
        const run = async (index) => {
          const layer = route.route.stack[index];
          if (!layer) return;
          let following;
          await layer.handle(req, res, () => { following = run(index + 1); });
          if (following) await following;
        };
        await run(0);
      } finally { console.error = originalError; }
      return { status: res.statusCode, body: res.body };
    },
  };
}
