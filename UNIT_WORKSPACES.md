# Unit workspaces

Open **Units** in the app sidebar, or **Open workspace** on an existing group in
Student Groups. Every group has a workspace automatically, including existing
groups. Unit names and pages come from records; no seven-unit seed or migration
is required. Keep using Student Groups to create units, add/remove students,
assign supervisors, change leaders and activate/deactivate groups.

## Storage and access

- `groups` and `group_members` remain the only unit/membership sources.
  Admins access all units; students access their current memberships; supervisors
  access groups whose existing `supervisor_id` matches their authenticated UID.
  Inactive units are readable by admins and cannot receive new content.
- Reports reuse `group_reflections`. New reports default to `restricted`.
  Standalone restricted reports are readable by their author, the assigned
  supervisor and admins. Students explicitly choose `unit` to share a general
  report. Only these shared, non-case reports enter the community feed.
  Authors can edit/resubmit their reports; reviewers can mark them reviewed or
  request a revision with feedback.
- Case-linked reflections retain the existing case access and group-leader
  submission rules, stay restricted, and never enter the community. Legacy
  reflections without visibility remain restricted. Supervising a unit adds no
  case access. Case documents stay in the existing case/document flows.
- Workspace-only additions use `group_posts`, `group_tasks`, `group_resources`
  and `group_comments`, each scoped by `group_id`. Resources are explicitly
  shared HTTP(S) links, not copies of confidential case attachments.
  Task assignees must be current unit students. Discussion reads and writes
  validate both membership and the parent item's sharing permissions.
- Existing `events` now support `group_id`, `visibility` (`private`, `unit`,
  `clinic`, or derived `case`), `category`, `end_date` and server-derived
  `organizer`. General events have no case ID. Clinic-wide publication is
  admin-only; students manage their own events; supervisors can manage general
  events in the units they supervise. Existing private/invited audiences and
  case permissions are preserved. Unit calendars also include existing events
  for explicitly group-assigned cases that the viewer can access.

The frontend sends authenticated requests through the existing API client. Every
workspace API request rechecks current server-side membership/assignment. Sidebar
membership is refreshed on app focus and after existing admin group changes.
No Firebase client writes, background process, scheduled notifications or new
deployment environment variables are introduced. Queries use existing/simple
single-field filters; there are no new composite index requirements.

## API extensions

The existing `/api/groups` routes remain intact. Workspace routes are mounted
before the existing `/:groupId` route:

- `GET /api/groups/workspaces`: permitted unit summaries.
- `GET /api/groups/:groupId/workspace`: unit details, safe member profiles,
  visible reflections, tasks, resources and shared activity.
- `POST /api/groups/:groupId/workspace/{posts,reflections,tasks,resources}`.
- `PATCH /api/groups/:groupId/workspace/{reflections,tasks}/:itemId`.
- `GET|POST /api/groups/:groupId/workspace/:kind/:itemId/comments`, with
  singular kinds `post`, `reflection`, `task`, `resource`.
- `DELETE /api/groups/:groupId/workspace/{posts,tasks,resources}/:itemId`.
- Existing `GET /api/cases` and `GET /api/events` accept a `group_id` filter.

Deploy the backend and frontend together using the existing hosting configuration.
The backend works with the existing Vercel request lifecycle.

## Verification

Run `npm test` in `server`, and `npm run build` in `frontend`. The backend suite
executes real routers and permission helpers with isolated in-memory Firestore;
it requires no Firebase credentials or production data.

Optional browser smoke check, when Puppeteer and its Chromium executable are
available in `frontend/node_modules`:

```powershell
node --experimental-vm-modules server/testSupport/workspaceSmoke.mjs
```

The smoke check serves the app on loopback with test-only authentication and
in-memory APIs. It exercises workspace pages, posts, comments, report submission,
unit event creation, supervisor restrictions and desktop/tablet/mobile layout.
It writes screenshots to `artifacts/unit-workspace/` and closes both servers.
The auth substitutions exist only inside this test script; production auth is
unchanged.

For a live Firebase acceptance check, create a group in Student Groups, assign
students and a supervisor, and verify access with each role. Submit one shared
and one restricted report, review/resubmit a report, schedule a unit event and
an admin clinic event, then remove a membership and confirm the removed student
cannot read or mutate that workspace. Confirm existing case creation,
assignment, documents and reflections continue to work for authorised users.
