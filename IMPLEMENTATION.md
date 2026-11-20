# School of Scholars, Kolambi, Katol

This dedicated development branch starts from the existing shared school operations engine. Use a separate database and deployment for this school. Never point this build at the NMC pilot database.

## Available now

Dedicated campus bootstrap creates one Katol campus, with administrator, principal, school office, teacher and management accounts. Explicit local sample mode is separate from empty installation. Fee charges, part payments, balance checks and retry-safe collection receipts are implemented against the same student records. The separate Accounts role, concessions/refunds, settlement, printable school-numbered receipts and management finance reports remain pending.

Server sign-in, staff/class assignments, enrolment, attendance submission and correction, principal review and saved reporting are inherited from the shared engine. Admissions now allows an administrator or assigned principal to enrol a student into a class, validates the date and unique class roll, and saves an admission event recording the actor and time. The student joins the attendance roster from that date. Previously submitted rosters retain their saved snapshots.

## Assumptions requiring school approval

School name and campus are taken from the supplied proposal. Grades, sections, admission numbering, required documents, fee heads, instalments, concessions, refund rules, grading, academic year, staff roles, report formats and provider accounts remain unverified. Development uses fictional learners only. The initial administrator and principal access model is a development assumption.

## Work toward the complete first release

1. Validate school workflows, roles, forms and acceptance examples.
2. Extend admissions to enquiries, applications, document checks, approval, certificates, withdrawals and academic-year tracking.
3. Fees and Accounts. Agree fee plans and numbering, then build instalments, receipts, concessions, refunds, reconciled collection close and accounting exports. Decide full-ledger scope before commercial agreement.
4. Academics. Timetable, attendance exceptions, homework, assessments, reviewed report cards and year-end promotion.
5. Staff records, attendance, leave, reviewed payroll and payslips.
6. Transport, library, procurement, stores, assets, maintenance, visitors and restricted support records.
7. Parent/student portals, notices, requests, appointments and approved service integrations.
8. Departmental acceptance, data reconciliation, security and restore tests, training and launch authorisation.

These are implementation work packages toward the complete release proposed in the PDF. Only implemented and tested functionality is available now. The original reference modules remain previews.

## Run locally

Follow README.md for bootstrap:school and the dedicated katol-development.sqlite database. The old two-school fixture is retained for regression tests only. The local application uses fictional data. Schema changes are applied through migrate:erp.

No dedicated hosted database or deployment has been provisioned for this product branch. Full production release is pending implementation, school-approved rules, security/recovery checks and departmental acceptance.
