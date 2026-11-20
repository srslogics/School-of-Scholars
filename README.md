# School of Scholars · Kolambi, Katol

Dedicated private-school ERP in development. The supplied solution proposal defines the intended complete release. Current implemented scope is campus setup, class and staff assignments, admissions into the shared student register, attendance and review, manual fee charges, part payments and saved collection receipts.

## Development environment

Use Node 22.13+ within Node 22. Run:

    npm ci --ignore-scripts --include=dev --include=optional
    export ERP_DB_PATH="$PWD/.erp-data/katol-development.sqlite"
    export ERP_ORIGIN="http://127.0.0.1:3010"
    npm run bootstrap:school -- --with-samples
    npm run build:erp
    npm run start:erp -- --hostname 127.0.0.1 --port 3010

Bootstrap runs only once on an empty dedicated database. The sample option is restricted to local files. Initial passwords are sos2026 as requested. Account details are saved into the owner-only file .erp-data/katol-development.sqlite.accounts.json. They must not be committed or shared publicly.

Open /erp. Account usernames are admin, principal, office, teacher, parent and staff. The local sample includes one Katol campus, one fictional class and one fictional student. Administrator setup configures approved classes and staff. Principal and office users enrol students and record charges/payments. Teachers access assigned attendance rosters.

The internal officer identifier is retained for school-office compatibility. Legacy commissioner accounts are disabled in the Katol installation. A separate Accounts role is pending.

## Shared database and fresh installation

Use a separate Turso libSQL database and a separate Render Node web service for this school. Configure TURSO_DATABASE_URL, TURSO_AUTH_TOKEN and the public HTTPS origin (ERP_ORIGIN, or Render's RENDER_EXTERNAL_URL). No local disk is required for hosted persistence. Never reuse the NMC database or deployment.

Run npm run bootstrap:school against the new empty shared database, WITHOUT --with-samples. It creates the named campus and six accounts initially using sos2026, with no classes, students or financial records. Keep the resulting private credential file securely. The generated accounts are initial installation accounts; staff identity, distribution, reset and recovery procedures need to be agreed before live operation.

Run npm run migrate:erp explicitly before starting an upgraded installation. The current additive schema installation is transactional and repeatable and records schema versions 1 and 2. Existing credentials and records are preserved. Future schema changes require explicit versioned migrations and tested rollback/recovery. Do not seed an upgraded database. The old seed:erp script remains a legacy fictional test fixture command and must not be used for this campus.

The Node deployment build is npm run build:erp. The start command is npm run start:erp -- --hostname 0.0.0.0. The Worker build remains legacy reference-preview infrastructure, without a bound ERP database. render.yaml names the dedicated school service. Hosting has not been provisioned or verified for this branch.

## Fee workflow and limits

Admit a student, select that same student in Fees & collections, create a charge with an explicit description, amount and due date, then record a confirmed payment. Amounts use integer paise. The payment transaction checks school scope, dates, remaining balance and a request ID before writing a receipt. Repeating an identical request returns the existing result. Reusing its ID with different data is rejected. Existing non-cash payment references are rejected for repeat collection. Partial payments can be recorded against one charge; allocations across multiple charges are future Accounts scope.

Receipts have unique UUID references and actor/timestamps. These are internal collection records. School-approved fiscal-year numbering, printable receipts, gateway confirmation and bank settlement reconciliation are pending. Manual entry does not verify funds with a bank or payment provider. The client retains a request ID for a form retry until success; reloading the page starts a new form, so check saved receipts before repeating a collection after an uncertain result.

Charges and receipts currently have no editing or deletion API. Concession, reversal, refund and collection-close workflows must be implemented before live fee processing. Classroom enrolment is the current student identifier; academic-year records, persistent admission numbers, transfers and guardians are further work.

## Verification

    npm run typecheck
    npm run lint
    npm test
    npm run build:erp

Tests cover scoped attendance, return/resubmit history, enrolment reaching attendance, school isolation, API authentication, campus bootstrap, money validation, duplicate retries, overpayment prevention, competing payments, revocation and records surviving a reopened database.

## Before live school use

Confirm forms, fee rules, admission and receipt numbering, classes, academic year, grading, staff responsibilities and provider accounts with school approvers. Implement account lifecycle/recovery, the remaining financial controls, independent backup/restore verification and recovery targets, monitoring, privacy/retention and restricted-record rules, migration reconciliation, departmental acceptance, training and launch approval. No deployment, production readiness or government endorsement is claimed.

The full remaining delivery scope and assumptions are recorded in IMPLEMENTATION.md. Development data is fictional.

## Parent, faculty and staff web apps

All three apps use the shared server sign-in at /erp and the burgundy/ivory responsive layout.

- Parent accounts see only children linked by an administrator. They can select an attendance date, see published attendance entries, current fee statements and payment receipts, submit a child's leave request and follow its decision history. A missing or returned register entry is shown as unpublished. Removing a guardian link removes access to that child's records and requests on the next server request.
- Faculty use their assigned class registers and the My requests section for personal leave and campus service requests.
- Campus staff see their own leave/service requests and history. They do not receive student rosters or financial ledgers.
- Principals review requests for their assigned school in School requests. Administrators can review all configured schools. A reviewer cannot approve their own request. Decisions have required notes and actor/time history. Approval does not change attendance, leave balances or payroll automatically.

School setup can create parent and staff accounts. Assign staff to a school, and link parents to authorised children using Parent access to a child. Multiple children can be linked to one guardian account. Authorisation verification is a school responsibility. Grant/removal actions are audited.

Schema version 2 adds portal profiles, guardian links and request/event tables without rewriting the existing account table. The profile overrides the inherited storage role during server authentication. Parent/staff base account rows retain the legacy teacher storage value, but their effective roles are parent/staff and the class-assignment API rejects assigning a parent as faculty. All application permissions must use the authenticated effective role. This compatibility detail is internal.

These are the first operational web app workflows. Native mobile packages, push notifications, parent online payments, timetables, homework, published assessments, leave balances, staff payslips and task allocation remain future implementation. Student, Accounts, admissions, librarian, transport and HR/payroll workspaces need their own confirmed permissions and workflows before delivery.

## Shared initial password

All newly bootstrapped campus accounts use sos2026, as explicitly requested. The account form defaults new users to the same password. Passwords remain individually salted and hashed in the database. The minimum accepted password length is now seven characters. This shared password is temporary and should be replaced before handling real school records.

For an already configured School of Scholars database, set its ERP_DB_PATH or Turso variables and run npm run reset:passwords. This explicitly resets ALL accounts in that database to sos2026 and invalidates existing sessions and login limits. It requires the SOS-KATOL campus code to guard against targeting the inherited NMC database. Run it only when intending to reset all users. Local account files, if present, are updated to match. Re-deploying application code alone does not reset existing database passwords.

## Deployment startup

start:erp now checks the configured database before accepting traffic, applies the additive schema, and bootstraps six initial accounts only when the database is empty. New account passwords are sos2026 as requested. Existing passwords and records are retained. It refuses a database already containing another school's campus code. A populated database still needs reset:passwords if you intend to reset its existing passwords. Invalid Turso credentials or an unavailable database cause startup to fail instead of serving a working sign-in screen backed by a broken database.

## Single-school installation

This product serves School of Scholars, Kolambi, Katol only. School creation is removed from setup and the server rejects creating a second school once the Katol campus exists. Startup refuses a Katol database containing additional school records, preserving them for administrator review. Attendance and personal request screens use the configured school directly. Classes, sections, staff assignments, guardian links and role-specific access remain configurable within that school. Legacy multiple-school fixtures are retained only for permission regression tests.

## App links

Use /erp for administrators, /faculty-app for faculty, /office-app for the office, /principal-app for principals, /parent-app for parents, and /staff-app for staff. Each page has its own sign-in context and shares server-side authentication and records. Signing in or opening a link with an existing session directs the user to their role's canonical app. The API continues to enforce record permissions on every request. These apps share the same browser session cookie; use separate browser profiles when testing multiple roles simultaneously.

## Additional role entry links

Faculty use /faculty-app, principals use /principal-app, school office use /office-app, and administrators use /erp. Administrator access remains /erp; parent and staff retain their dedicated paths. Existing class/date links through /erp retain their query when routed to the signed-in user's app. These links open currently implemented role workflows. Dedicated student, Accounts, Library, Transport and HR/payroll apps require further implementation and confirmed permissions.

## Removed Management app

The Management app route and new Management account have been removed. Legacy management/commissioner accounts in the Katol database are denied sign-in and their existing sessions are rejected. Historical account rows are retained to preserve audit references. Active apps are ERP, Faculty, Principal, School Office, Parent and Staff.
