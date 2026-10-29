// Local browser verification with in-memory data and test-only authentication.
// Run: node --experimental-vm-modules server/testSupport/workspaceSmoke.mjs
// Both servers bind to loopback and are closed before the script exits.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createHarness } from './routerHarness.js';

const frontendRoot = fileURLToPath(new URL('../../frontend/', import.meta.url));
const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { createServer } = await import(new URL('../../frontend/node_modules/vite/dist/node/index.js', import.meta.url));
const puppeteer = requireFrontend('puppeteer');
const react = (await import(new URL('../../frontend/node_modules/@vitejs/plugin-react/dist/index.js', import.meta.url))).default;
const harnesses = await Promise.all(['workspaces', 'events', 'cases'].map((name) => createHarness(name)));
const date = '2099-11-12';
for (const h of harnesses) {
  h.table('groups').set('g1', { name: 'Human Rights Unit', description: 'Advancing access to justice through research, advocacy and community action.', leader_id: 's1', supervisor_id: 'sup1', supervisor_name: 'Dr. Amina Yusuf', status: 'active' });
  h.table('groups').set('g2', { name: 'Migration Law Unit', supervisor_id: 'sup2', status: 'active' });
  for (const [id, name, role] of [['s1', 'Ada Okafor', 'law_student'], ['s2', 'Emeka Bello', 'law_student'], ['sup1', 'Dr. Amina Yusuf', 'supervisor']]) {
    h.table('users').set(id, { name, role, email: `${id}@clinic.test` });
    if (role === 'law_student') h.table('group_members').set(`g1_${id}`, { group_id: 'g1', user_id: id, role_in_group: id === 's1' ? 'leader' : 'member', joined_at: { _seconds: 1790000000 } });
  }
  h.table('cases').set('case1', { client_name: 'Authorised clinic client', offence: 'Case research', case_type: 'Civil', status: 'open' });
  h.table('case_assignments').set('a1', { case_id: 'case1', group_id: 'g1', assigned_to_type: 'group' });
  h.table('group_posts').set('welcome', { group_id: 'g1', title: 'Welcome to our workspace', content: 'Share your progress and questions here before our next unit meeting.', author_name: 'Dr. Amina Yusuf', created_by: 'sup1', post_type: 'announcement', created_at: { _seconds: 1793100000 } });
  h.table('group_reflections').set('reflection1', { group_id: 'g1', title: 'Community outreach reflections', content: 'Our team explored practical ways to improve access to legal support.', author_name: 'Emeka Bello', submitted_by: 's2', visibility: 'unit', status: 'submitted', submitted_at: { _seconds: 1793090000 } });
  h.table('group_reflections').set('private', { group_id: 'g1', title: 'PRIVATE REFLECTION MUST STAY HIDDEN', content: 'Private learning', submitted_by: 's2', visibility: 'restricted' });
  h.table('group_tasks').set('task1', { group_id: 'g1', title: 'Prepare workshop reading list', content: 'Collect useful resources for our next workshop.', assigned_to: 's1', created_by: 'sup1', author_name: 'Dr. Amina Yusuf', status: 'in_progress', due_date: date, created_at: { _seconds: 1793080000 } });
  h.table('events').set('event1', { title: 'Access to justice workshop', event_type: 'workshop', date, end_date: date, start_time: '10:00', end_time: '12:00', group_id: 'g1', visibility: 'unit', case_id: null, organizer: 'Dr. Amina Yusuf', created_by: 'sup1', location: 'Law Clinic seminar room', status: 'upcoming' });
}
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  const role = req.headers.authorization?.split(' ')[1] || 'law_student';
  req.currentUser = { uid: role === 'supervisor' ? 'sup1' : role === 'admin' ? 'admin1' : 's1', role, name: role === 'supervisor' ? 'Dr. Amina Yusuf' : 'Ada Okafor' };
  next();
});
app.use('/api/groups', harnesses[0].router);
app.use('/api', harnesses[1].router);
app.use('/api/cases', harnesses[2].router);
const apiServer = app.listen(0, '127.0.0.1');
await new Promise((resolve) => apiServer.once('listening', resolve));
const apiPort = apiServer.address().port;
const vite = await createServer({
  root: frontendRoot, configFile: false,
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(`http://127.0.0.1:${apiPort}/api`) },
  plugins: [{ name: 'offline-workspace-test-auth', enforce: 'pre', load(id) {
    if (id.replaceAll('\\', '/').endsWith('/src/context/AuthContext.jsx')) return `
      const role = localStorage.getItem('smoke-role') || 'law_student';
      export const useAuth = () => ({ currentUser: { uid: role === 'supervisor' ? 'sup1' : role === 'admin' ? 'admin1' : 's1', name: 'Ada Okafor', displayName: 'Ada Okafor', role }, userRole: role, loading: false, logout: () => {} });
      export const AuthProvider = ({ children }) => children;
    `;
    if (id.replaceAll('\\', '/').endsWith('/src/services/firebase.js')) return `export const auth = { currentUser: { getIdToken: async () => localStorage.getItem('smoke-role') || 'law_student' } }; export const db = {};`;
  } }, react()],
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
let browser;
try {
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  const clickText = async (selector, text) => {
    const element = await page.waitForFunction((selector, text) => [...document.querySelectorAll(selector)].find((item) => item.textContent.trim() === text), {}, selector, text);
    await element.asElement().click();
  };
  const waitText = (text) => page.waitForFunction((text) => document.body.innerText.includes(text), {}, text);
  const fill = (selector, value) => page.$eval(selector, (element, value) => {
    const setter = Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
    setter.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${url}/units/g1/overview`, { waitUntil: 'networkidle0' });
  await waitText('Welcome to our workspace');
  assert.ok(!(await page.content()).includes('PRIVATE REFLECTION MUST STAY HIDDEN'));
  const artifacts = new URL('../../artifacts/unit-workspace/', import.meta.url);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('desktop.png', artifacts)), fullPage: true });
  for (const section of ['community', 'reports', 'tasks', 'cases', 'resources', 'members', 'calendar']) {
    await page.goto(`${url}/units/g1/${section}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.workspace-content');
    assert.ok(!(await page.content()).includes('PRIVATE REFLECTION MUST STAY HIDDEN'));
  }
  await page.goto(`${url}/units/g1/community`, { waitUntil: 'networkidle0' });
  await clickText('button', 'New post');
  await page.waitForSelector('dialog[open]');
  await fill('dialog input', 'Browser-tested discussion');
  await fill('dialog textarea', 'A conversation created through the real workspace API.');
  await clickText('dialog button', 'Start a conversation');
  await waitText('Browser-tested discussion');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await page.$eval('.workspace-feed', (element) => [...element.querySelectorAll('button')].find((item) => item.innerText.includes('Browser-tested discussion')).click());
  await page.waitForSelector('.workspace-comments textarea');
  await waitText('Start the conversation.');
  await fill('.workspace-comments textarea', 'A browser-tested reply');
  await clickText('dialog button', 'Post comment');
  await waitText('A browser-tested reply');
  await page.keyboard.press('Escape');

  await page.goto(`${url}/units/g1/reports`, { waitUntil: 'networkidle0' });
  await clickText('button', 'Submit report');
  await fill('dialog input', 'Browser-tested unit report');
  await fill('dialog textarea', 'Approved summary of our unit activities.');
  await page.evaluate(() => { const select = [...document.querySelectorAll('dialog select')].find((item) => [...item.options].some((option) => option.value === 'unit')); select.value = 'unit'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await clickText('dialog button', 'Submit report');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await waitText('Browser-tested unit report');

  await page.$eval('.workspace-feed', (element) => [...element.querySelectorAll('button')].find((item) => item.innerText.includes('Browser-tested unit report')).click());
  await clickText('dialog button', 'Edit & resubmit');
  await page.waitForFunction(() => document.querySelector('dialog h2')?.textContent === 'Edit & resubmit report');
  await fill('dialog textarea', 'Revised approved summary of our unit activities.');
  await clickText('dialog button', 'Resubmit report');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.ok([...harnesses[0].table('group_reflections').values()].some((report) => report.content.startsWith('Revised approved')));

  await page.goto(`${url}/units/g1/tasks`, { waitUntil: 'networkidle0' });
  await page.$eval('.workspace-item-card', (element) => element.click());
  await page.select('.workspace-task-details select', 'completed');
  await page.waitForFunction(() => document.querySelector('dialog .workspace-muted')?.textContent.includes('completed'));
  assert.equal(harnesses[0].table('group_tasks').get('task1').status, 'completed');
  await page.keyboard.press('Escape');

  await page.goto(`${url}/units/g1/calendar`, { waitUntil: 'networkidle0' });
  await clickText('button', 'Add Event');
  await page.waitForSelector('.event-modal');
  assert.ok(!(await page.$eval('.event-modal', (element) => element.innerText)).includes('Related Case'));
  await fill('.event-modal input[type="text"]', 'Browser-tested unit meeting');
  await clickText('button', 'Save Event');
  await page.waitForFunction(() => !document.querySelector('.event-modal'));
  assert.ok([...harnesses[1].table('events').values()].some((event) => event.title === 'Browser-tested unit meeting' && event.group_id === 'g1' && event.case_id === null));
  for (const [width, height, name] of [[768, 1024, 'tablet'], [390, 844, 'mobile']]) {
    await page.setViewport({ width, height });
    await page.goto(`${url}/units/g1/overview`, { waitUntil: 'networkidle0' });
    await waitText('Welcome to our workspace');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} must not overflow horizontally`);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, artifacts)), fullPage: true });
  }
  await page.evaluate(() => localStorage.setItem('smoke-role', 'supervisor'));
  await page.goto(`${url}/`, { waitUntil: 'networkidle0' });
  await waitText('Your units');
  assert.ok(!(await page.content()).includes('Migration Law Unit'));
  await page.goto(`${url}/units/g1/reports`, { waitUntil: 'networkidle0' });
  await waitText('PRIVATE REFLECTION MUST STAY HIDDEN'); // Assigned reviewer can read restricted unit reports.
  await page.$eval('.workspace-feed', (element) => [...element.querySelectorAll('button')].find((item) => item.innerText.includes('Browser-tested unit report')).click());
  await fill('.workspace-review textarea', 'Reviewed in the browser smoke test.');
  await clickText('dialog button', 'Save review');
  await page.waitForSelector('.workspace-feedback');
  assert.ok([...harnesses[0].table('group_reflections').values()].some((report) => report.status === 'reviewed' && report.supervisor_feedback === 'Reviewed in the browser smoke test.'));
  await page.keyboard.press('Escape');
  await page.goto(`${url}/units/g2/overview`, { waitUntil: 'networkidle0' });
  await waitText('Workspace unavailable');
  assert.deepEqual(errors, []);
  console.log('Workspace browser smoke passed: pages, posts, comments, report submission/revision/review, task updates, events, supervisor scope, desktop/tablet/mobile.');
} finally {
  await browser?.close(); await vite.close(); await new Promise((resolve) => apiServer.close(resolve));
}
