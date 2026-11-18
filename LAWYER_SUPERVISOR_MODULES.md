# Lawyer and supervisor modules

All changes are local. No production records, Firebase rules, deployments or
Git remotes are changed by the implementation or automated tests.

## Existing screens and records

Lawyers land on the shared dashboard and use Case Management, CaseDetail,
Calendar, Clinic AI and Units. Administrators keep using Lawyer Assignment,
Student Groups and Manage Users. Group leaders remain students; lawyers can be
members. Assigning a supervisor to a mixed group updates student profile display
fields without replacing lawyer memberships. `groups.supervisor_id` and
`group_members` are authoritative; profile display fields are not permissions.

Lawyer case access requires a direct `case_assignments` record with
`assignment_role: lawyer`. Legacy direct records without that marker are
accepted only when their recorded assigner is an administrator. Student-created
assignments, case display fields and group membership do not grant lawyer access.
The existing assignment screen retains its single-lawyer replacement behavior
and preserves student/group assignments.

Lawyers can update only case status, upload documents, log activities and create
case reminders. They can edit/delete their own manual activity notes and cancel
their own reminders. They cannot edit case details, assignments, other users'
notes, audit entries, or existing document metadata.

Supervisors land on their unit directory. Each unit exposes Reports, Student
Activities and Cases. Supervision permits reading cases created by or directly
assigned to current active students in an active supervised group, plus cases
explicitly assigned to that group. Cases assigned only to another group are not
inherited through a student's other memberships. Unit and student filters narrow
this scope. Removing membership, changing roles/status, changing the supervisor,
or deactivating the group revokes the relevant scope on the next request.

Supervisor case access is read-only, including activities, attachments and case
events. Existing general unit-event/task management and report feedback remain
available. Reports reuse `group_reflections` and existing visibility/review
fields. Restricted reports are not shared with lawyers merely because they join
the unit. Case-linked reports require case access as well as report/unit scope.
Student activities outside case permissions are returned as a generic record
with no description, case ID/title, court, filename or other case metadata.

The existing statuses are retained. `court_date` is accepted as a legacy alias
of `awaiting_hearing`, fixing the previous frontend/backend mismatch. As in the
existing student workflow, transitions between recognised states, including
reopening, are permitted. Unknown source/destination states and extra status
payload fields are rejected. Status updates and their audit entries are batched.

## Documents and AI

New uploads use the existing Admin SDK Storage integration and
`FIREBASE_STORAGE_BUCKET`. The local server environment reuses the frontend's
existing bucket after verifying that its project matches the local service
account. Environment loading now happens before Firebase initialization; hosted
environment variables retain precedence. The ignored local `.env` is not deployed;
ensure `FIREBASE_STORAGE_BUCKET` is set in the existing Vercel backend environment
before an approved release. The existing 5 MB limit is retained. Uploads accept
matching extensions/MIME types for PDF, Office documents, text/Markdown, CSV,
RTF, PNG and JPEG; unsupported files return 400 and oversized files return 413.
Metadata stays in `documents`, using `storage_file_path` and
`storage_provider: firebase_storage`. No download token or public URL is issued.
Authenticated download requests recheck case access and return private,
non-cacheable attachments. Legacy local files and configured-bucket Firebase
URLs remain readable through the same endpoint. No file migration is run.

CaseDetail reads documents and activities through the existing authenticated
API client rather than direct Firestore listeners. It refreshes after local
changes, on focus and every 30 seconds. The Firebase project/credentials and
Vercel configuration are unchanged; new uploads no longer depend on local disk.

The case AI link supplies `case_id` to the existing assistant endpoint. That ID
must be in the caller's backend-authorised case list before context is retrieved.
General assistant requests use only authorised cases. Private/unit event
audiences are applied to AI context too. Stored Firebase documents use the same
storage reader as downloads, with the existing AI byte limits. AI does not write
case records.

## Firebase rule review before production

This checkout did not contain the currently deployed Firestore or Storage rules.
The files in `server/security/` are proposed restrictive baselines for review,
not a claim about production rules and not wired into automatic deployment.
Firestore permits existing self-registration and profile reads, and active admin
user queries. Other client collection access is denied because those operations
now use Express. Storage client access is denied; the Admin SDK uses server IAM.

Before any approved release, compare these files with the actual deployed rules,
validate them in Firebase emulators and preserve any additional legitimate
application integrations. The [Firebase rules documentation](https://firebase.google.com/docs/firestore/security/get-started)
explains why server SDK requests need their own authorization checks.
Verify the bucket is not public through IAM/ACLs and
review/revoke legacy public URLs/download tokens where required. Adding a deny
match to permissive rules is insufficient: overlapping allow rules still apply.
Existing public objects/tokens cannot be made private solely by changing Express.
Do not deploy either rule file or change production data without approval.

## Validation

Run `npm test` in `server` and `npm run build` in `frontend`. Tests execute real
routers against in-memory Firestore, Storage and AI doubles; they use no Firebase
credentials and cannot call the AI provider. Optional local browser verification:
`node --experimental-vm-modules server/testSupport/workspaceSmoke.mjs`.
