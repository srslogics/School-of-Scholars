'use client';
import { AppSidebar } from './sidebar';
import { PortalWorkspace } from './portal-workspace';
import { appNavigation } from '@/lib/erp/navigation';
import { AcademicPanel, type AcademicArea } from './academics';
import { PortalPanel } from './portals';
import { FeesPanel } from './fees';
import { AdmissionsPanel } from './admissions';

import { GraduationCap, UserRound, LogOut } from 'lucide-react';
import {
  useEffect,
  useState,
  type SubmitEvent as ReactSubmitEvent,
} from 'react';
import {
  workspacePath,
  workspaceLabels,
  type Workspace,
  type WorkspacePath,
} from '@/lib/erp/model';
import { RegisterPanel, ReportPanel } from './attendance';
import { SetupPanel } from './setup';
import { errorMessage, request, RequestError } from './client';

type Initial = { classId?: string; date?: string };
const roleLabel = {
  administrator: 'Setup administrator',
  teacher: 'Faculty',
  parent: 'Parent / Guardian',
  staff: 'Campus staff',
  principal: 'Principal',
  officer: 'School office',
  commissioner: 'Legacy account',
};

export function ErpWorkspace({
  initial,
  entryPath = '/erp',
}: {
  initial: Initial;
  entryPath?: WorkspacePath;
}) {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const entryLabel = workspaceLabels[entryPath];

  useEffect(() => {
    const controller = new AbortController();
    request<Workspace>('session', undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          if (workspacePath(result.account.role) !== entryPath) {
            setRedirecting(true);
            window.location.replace(
              workspacePath(result.account.role) + window.location.search,
            );
          } else setWorkspace(result);
        }
      })
      .catch((failure: unknown) => {
        if (
          controller.signal.aborted ||
          (failure instanceof RequestError && failure.status === 401)
        )
          return;
        setError(errorMessage(failure));
        setUnavailable(
          failure instanceof RequestError && failure.status === 503,
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [entryPath]);

  async function signIn(event: ReactSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      await request('login', fields);
      const session = await request<Workspace>('session');
      if (workspacePath(session.account.role) !== entryPath) {
        setRedirecting(true);
        window.location.replace(
          workspacePath(session.account.role) + window.location.search,
        );
      } else setWorkspace(session);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await request('logout', {});
      setWorkspace(undefined);
    } catch (failure) {
      if (failure instanceof RequestError && failure.status === 401)
        setWorkspace(undefined);
      else setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="erp-shell">
      <a className="erp-skip-link" href="#school-content">
        Skip to workspace
      </a>
      <header className="erp-masthead">
        <div className="dept-mark">
          <GraduationCap size={27} aria-hidden="true" />
        </div>
        <div>
          <strong>School of Scholars</strong>
          <p>Kolambi, Katol · {entryLabel}</p>
        </div>
        <div className="erp-account">
          {workspace && (
            <time className="erp-today" dateTime={workspace.date}>
              {new Date(workspace.date + 'T00:00:00Z').toLocaleDateString(
                'en-IN',
                {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'Asia/Kolkata',
                },
              )}
            </time>
          )}
          {workspace && (
            <>
              <UserRound size={18} aria-hidden="true" />
              <span className="erp-account-name">
                {workspace.account.name}
                {workspace.account.name.toLowerCase() !==
                  roleLabel[workspace.account.role].toLowerCase() && (
                  <small>{roleLabel[workspace.account.role]}</small>
                )}
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={busy}
              >
                <LogOut size={16} aria-hidden="true" /> Sign out
              </button>
            </>
          )}
        </div>
      </header>
      <div className="erp-environment">
        Fictional sample data · School configuration awaiting approval
      </div>
      {loading || redirecting ? (
        <output className="erp-login">
          {redirecting ? 'Opening your workspace…' : 'Checking your session…'}
        </output>
      ) : workspace ? (
        <>
          {error && (
            <p className="erp-error" role="alert">
              {error}
            </p>
          )}
          {workspace.account.role === 'parent' ||
          workspace.account.role === 'staff' ? (
            <PortalWorkspace key={workspace.account.id} workspace={workspace} />
          ) : (
            <SignedWorkspace
              key={workspace.account.id}
              workspace={workspace}
              initial={initial}
              refresh={() => {
                void request<Workspace>('session')
                  .then(setWorkspace)
                  .catch((failure: unknown) => setError(errorMessage(failure)));
              }}
            />
          )}
        </>
      ) : (
        <div className="scholars-welcome">
          <section
            className="erp-card erp-login"
            id="school-content"
            tabIndex={-1}
          >
            <span className="scholars-eyebrow">{entryLabel}</span>
            <h1>Sign in</h1>
            <p>Sign in with your school account to continue.</p>
            {error && (
              <p className="erp-error" role="alert">
                {error}
              </p>
            )}
            {!unavailable && (
              <form aria-busy={busy} onSubmit={(event) => void signIn(event)}>
                <fieldset disabled={busy}>
                  <label>
                    Username
                    <input
                      name="username"
                      required
                      autoComplete="username"
                      maxLength={64}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      maxLength={128}
                    />
                  </label>
                  <button className="erp-primary" disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                  </button>
                </fieldset>
              </form>
            )}
            <p className="scholars-login-help">
              Need access? Contact your school administrator.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

function SignedWorkspace({
  workspace,
  initial,
  refresh,
}: {
  workspace: Workspace;
  initial: Initial;
  refresh: () => void;
}) {
  const { account, schools, classes } = workspace;
  const allowedInitial = classes.find((row) => row.id === initial.classId);
  const [badLink, setBadLink] = useState(
    Boolean(initial.classId && !allowedInitial),
  );
  const [schoolId, setSchoolId] = useState(
    allowedInitial?.schoolId ?? schools[0]?.id ?? '',
  );
  const [feeStudentId, setFeeStudentId] = useState<string>();
  const [classId, setClassId] = useState(allowedInitial?.id ?? '');
  const [date, setDate] = useState(initial.date ?? workspace.date);
  const [selected, setTab] = useState(
    account.role === 'administrator'
      ? 'setup:classes'
      : account.role === 'officer'
        ? 'admissions'
        : account.role === 'teacher' || allowedInitial
          ? 'register'
          : 'report',
  );
  const tab = selected.split(':')[0];
  const submodule = selected.split(':')[1];
  const selectedLabel = appNavigation(account.role)
    .flatMap((g) => g.items)
    .find((i) => i.id === selected)?.label;
  const scopedClasses = classes.filter((row) => row.schoolId === schoolId);
  const selectedClass =
    scopedClasses.find((row) => row.id === classId) ?? scopedClasses[0];
  function openRegister(id: string) {
    const selected = classes.find((row) => row.id === id);
    if (!selected) return;
    setSchoolId(selected.schoolId);
    setClassId(id);
    setTab('register');
    setBadLink(false);
  }

  return (
    <div className="erp-layout">
      <AppSidebar
        groups={appNavigation(account.role)}
        selected={selected}
        onSelect={(id) => {
          setBadLink(false);
          if (id.startsWith('fees:')) setFeeStudentId(undefined);
          setTab(id);
        }}
      />

      <div className="erp-main" id="school-content" tabIndex={-1}>
        <header className="erp-page-title">
          <p>
            School workspace <span aria-hidden="true">/</span>{' '}
            {roleLabel[account.role]}
          </p>
          <h1>
            {selectedLabel ??
              ([
                'timetable',
                'homework',
                'exams',
                'reports',
                'communication',
              ].includes(tab)
                ? ({
                    timetable: 'Timetable',
                    homework: 'Homework',
                    exams: 'Examinations',
                    reports: 'Report cards',
                    communication: 'Communication',
                  }[tab] ?? 'Academics')
                : tab === 'requests'
                  ? account.role === 'teacher'
                    ? 'Faculty requests'
                    : 'School requests'
                  : tab === 'fees'
                    ? 'Fees & collections'
                    : tab === 'admissions'
                      ? 'Admissions & students'
                      : tab === 'setup'
                        ? 'School setup'
                        : tab === 'report'
                          ? 'Attendance overview'
                          : 'Class register')}
          </h1>
          <p>
            {[
              'timetable',
              'homework',
              'exams',
              'reports',
              'communication',
            ].includes(tab)
              ? 'School academics and published learning records.'
              : tab === 'requests'
                ? 'Track requests and recorded decisions.'
                : tab === 'fees'
                  ? 'Track student balances and record confirmed collections.'
                  : tab === 'admissions'
                    ? 'Enrol a learner and keep their class record connected.'
                    : tab === 'setup'
                      ? 'Manage classes, students and staff access.'
                      : tab === 'report'
                        ? 'See reported attendance and registers awaiting submission.'
                        : 'Choose a class, mark attendance and submit for review.'}
          </p>
        </header>
        {(tab === 'register' || tab === 'report') && (
          <div className="erp-filters">
            <label>
              Attendance date
              <input
                type="date"
                required
                value={date}
                max={workspace.date}
                onChange={(event) => {
                  if (event.target.value) setDate(event.target.value);
                }}
              />
            </label>
            {tab === 'register' && (
              <label>
                Class and section
                <select
                  value={selectedClass?.id ?? ''}
                  onChange={(event) => {
                    setClassId(event.target.value);
                    setBadLink(false);
                  }}
                >
                  {!scopedClasses.length && (
                    <option value="">No class assigned</option>
                  )}
                  {scopedClasses.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.grade} · {row.section}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {badLink ? (
          <p role="alert" className="erp-error">
            Record not found in your workspace.
          </p>
        ) : [
            'timetable',
            'homework',
            'exams',
            'reports',
            'communication',
          ].includes(tab) ? (
          <AcademicPanel
            key={tab}
            account={account}
            initialArea={tab as AcademicArea}
            embedded
          />
        ) : tab === 'requests' ? (
          <PortalPanel
            account={account}
            date={workspace.date}
            hideNavigation
            historyOnly={submodule === 'history'}
          />
        ) : tab === 'fees' ? (
          <FeesPanel
            key={feeStudentId ?? 'all'}
            date={workspace.date}
            initialStudentId={feeStudentId}
            selectedArea={
              submodule as
                | 'balances'
                | 'receipts'
                | 'payment'
                | 'charge'
                | undefined
            }
          />
        ) : tab === 'admissions' ? (
          <AdmissionsPanel
            date={workspace.date}
            onSaved={refresh}
            onOpenFees={(id) => {
              setFeeStudentId(id);
              setTab('fees:balances');
            }}
          />
        ) : tab === 'setup' ? (
          <SetupPanel
            date={workspace.date}
            onSaved={refresh}
            onOpenAdmissions={() => setTab('admissions')}
            selectedArea={
              submodule as
                | 'classes'
                | 'users'
                | 'assignments'
                | 'guardians'
                | undefined
            }
            onAreaChange={(area) => setTab('setup:' + area)}
          />
        ) : tab === 'report' ? (
          <ReportPanel
            key={`${date}:${schoolId}`}
            date={date}
            schoolId={schoolId}
            canReview={account.role === 'principal'}
            onOpen={openRegister}
          />
        ) : selectedClass ? (
          <RegisterPanel
            key={`${selectedClass.id}:${date}`}
            classId={selectedClass.id}
            date={date}
            role={account.role}
            onSaved={refresh}
          />
        ) : (
          <p>
            No class is available in this workspace. Ask the setup administrator
            to check your assignment.
          </p>
        )}
        {account.role === 'administrator' && (
          <details className="erp-roadmap">
            <summary>Product development status</summary>
            <p>
              Available workflows include class setup, staff assignments,
              admissions, attendance review, fee charges and payment receipts.
            </p>
            <p>
              Fee policies, receipt numbering, concessions, refunds, collection
              close, full accounting, academic years and student transfers need
              further implementation and school approval. Staff and payroll,
              board-specific grading, final report templates and additional
              campus services need further configuration.
            </p>
          </details>
        )}
      </div>
    </div>
  );
}
