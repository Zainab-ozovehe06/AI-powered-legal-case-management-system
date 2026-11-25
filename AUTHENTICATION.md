# Authentication and application sessions

## Issues fixed

- Login navigated immediately after Firebase returned a credential, before the
  asynchronous Firestore profile and role lookup completed. Protected routes
  could send the first attempt back to login.
- Firebase used its default persistent authentication with no application
  inactivity deadline. Neither Express nor React enforced expiration.
- Missing/inactive profiles cleared React state but left Firebase signed in;
  errors were often reported as an incorrect password regardless of the cause.
- Admin profile queries bypassed Express. Client accounts had no dashboard
  branch and were sent back to login.

## Behavior

The existing Firebase Email/Password and Google popup methods remain separate.
AuthContext waits for a server-validated profile and application session before
Login redirects. Both route guards retain their existing roles and now handle
loading explicitly. Client accounts receive a welcome page without additional
case permissions. Registration keeps the existing law-student onboarding and
signs out after profile creation so registration cannot race profile loading.

Sign-in never creates, merges, changes, or searches for clinic profiles by
email. The verified Firebase UID selects the existing profile and stored role.
A Google account without that profile is denied with an actionable message.
Account conflicts require the existing sign-in method; the app never silently
links credentials or overwrites permissions. Existing Firebase accounts needing
provider linking must be linked to the same UID through an authorized account
management process, rather than creating a second profile.

Firebase uses `browserSessionPersistence`. Refreshes may resume a valid
tab session only after server verification. New tabs normally require sign-in;
duplicated/restored tabs are still subject to the same server deadline.
Browser session restoration never starts a new application session. Manual
logout clears React state and tab credentials immediately, revokes the server
session, signs out of Firebase, and notifies other tabs for the same user.
Browser history restores revalidate before protected content becomes visible.

The server stores only authentication metadata in the separate `auth_sessions`
collection. Records contain the verified UID, original Firebase `auth_time`,
creation/activity times, and revocation time; document IDs are SHA-256 hashes of
random 256-bit session secrets. Existing user, case, assignment and workspace
records are not migrated or changed by this feature. Session records must be
inaccessible to Firebase client SDKs; only the Admin SDK reads/writes them.

Every protected API request requires both a valid Firebase bearer token and
`X-Session-Id`. Express checks live profile status/role, UID/authentication-event
binding, revocation and the 900,000 ms inactivity deadline. Firestore holds the
deadline across Vercel invocations and server restarts. Expired sessions cannot
be extended. Background polling and ID-token refresh do not record activity.
Actual browser interaction sends throttled activity updates; React also checks
expiry on timers, focus and visibility changes. Clock changes or forged browser
timestamps cannot change the backend deadline. Logout without connectivity
clears local access immediately; remote sessions still expire by inactivity.

New application sessions require a Firebase sign-in within the preceding five
minutes, using `auth_time`, not the refreshed token's issue time. After inactivity
expiry, an automatically refreshed Firebase credential cannot create another
application session. Users must submit a password or explicitly open a new
Google popup with account selection. Google may reuse its own account session;
a Google password prompt is not guaranteed.

The API client refreshes and retries an ID token once only for `TOKEN_EXPIRED`.
Application expiry, revoked/disabled accounts and permission errors cannot
trigger silent session creation. Authentication infrastructure failures return
503 rather than masquerading as an incorrect password. Protected API responses
and requests use `Cache-Control: private, no-store` / `cache: no-store`.

Session endpoints under `/api/auth`:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/session` | Exchange a recent explicit Firebase login for a session and profile |
| GET | `/session` | Validate without extending inactivity |
| PUT | `/session/activity` | Record activity on a still-valid session, transactionally |
| DELETE | `/session` | Revoke the current session |
| GET | `/me` | Existing profile endpoint, now requiring an application session |

## Validation

Changed files are limited to authentication, the profile reads it protects, role
landing/navigation, deployment configuration and verification:

| Area | Files |
| --- | --- |
| Existing authentication UI | `frontend/src/context/AuthContext.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/Register.jsx`, `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/components/RoleProtectedRoute.jsx` |
| Browser credentials and API transport | `frontend/src/services/firebase.js`, `frontend/src/services/authSession.js` (new), `frontend/src/utils/authErrors.js` (new), `frontend/src/api/apiClient.js` |
| Role landing and protected profile query | `frontend/src/App.jsx`, `frontend/src/components/layout/Sidebar.jsx`, `frontend/src/components/layout/Topbar.jsx`, `frontend/src/pages/AdminDashboard.jsx` |
| Existing Express authentication | `server/middleware/authenticate.js`, `server/routes/authRoutes.js`, `server/utils/authSession.js` (new) |
| Deployment and direct-access protection | `server/server.js`, `server/security/firestore.rules`, `frontend/vercel.json` (new) |
| New authentication verification | `server/test/auth.test.js`, `server/test/authClient.test.js`, `server/testSupport/authClientHarness.js`, `server/testSupport/authSmoke.mjs` |
| Existing verification support | `server/test/roles.test.js`, `server/testSupport/routerHarness.js`, `server/testSupport/workspaceSmoke.mjs` |
| Documentation | `AUTHENTICATION.md` (new), `README.md` |

Run `npm test` in `server` for authentication, deterministic frontend timer and
transport tests, and existing case/role/event/workspace regression tests.
Run `npm run build` in `frontend`; ESLint can target the changed frontend files.
Optional browser integration checks require Puppeteer in the frontend workspace
(available in the local test environment):

```powershell
node --experimental-vm-modules server/testSupport/authSmoke.mjs
```

The browser suite exercises the real React pages, guards, session transport and
Express middleware with isolated Firebase doubles. It checks each provider and
dashboard role independently, first-attempt login, popup user activation,
refresh, tabs, logout/history, inactivity, forged restored state, reauthentication
and account-conflict/password-error recovery. These tests do not use production
credentials and do not constitute live Firebase/Google OAuth verification.

Local verification passed: 59 automated tests, nine authentication browser
scenario groups, ESLint for every changed frontend file, and the production
frontend build. The existing workspace browser regression also passed across
student, supervisor and lawyer workflows and desktop/tablet/mobile layouts.
The build retains Vite's large-bundle advisory. No live Firebase
provider sign-in, Vercel deployment, or deployed-rule verification was performed.

## Vercel release checks

Deploy frontend and backend together: older clients that send only a Firebase
token will intentionally be rejected. The frontend Vercel configuration supplies
the SPA rewrite needed for login/protected-route refreshes.

1. Enable Email/Password and Google in the existing Firebase project. Verify
   the one-account-per-email setting and authorized production/preview domains.
2. Use the same Firebase project in frontend `VITE_FIREBASE_*` configuration and
   backend Firebase Admin credentials. Never put Admin private keys in `VITE_*`.
3. Set `VITE_API_BASE_URL` to the backend HTTPS URL including `/api`. For an
   additional deployment origin, set backend `FRONTEND_URL` or the comma-separated
   `ALLOWED_ORIGINS` list to exact allowed HTTPS origins. The existing production
   origin is retained; arbitrary preview domains are not allowed automatically.
4. Apply reviewed Firestore/Storage rules to the actual Firebase project. The
   checked-in `server/security/firestore.rules` now denies direct profile reads,
   since those reads go through Express, and denies client session-record
   access. Its self-registration create rule remains. The currently deployed
   rules are not available in this checkout; no rules or production data have
   been deployed or changed by local validation. Check for overlapping permissive
   rules before claiming production session enforcement.
5. With designated test accounts, repeat both sign-in methods on the deployed
   preview, refresh, check each role, leave all tabs idle for 15 minutes, then
   verify fresh sign-in and a 401 for retained old API session credentials.
   Verify browser restart, multiple tabs, logout/Back and revoked/disabled users.

References: [Firebase persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence),
[Firebase session management](https://firebase.google.com/docs/auth/admin/manage-sessions),
[Google sign-in and conflicts](https://firebase.google.com/docs/auth/web/google-signin),
[Vite SPA routing on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
