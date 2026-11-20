'use client';

import {
  useEffect,
  useState,
  type SubmitEvent as ReactSubmitEvent,
} from 'react';
import type { Setup } from '@/lib/erp/model';
import { errorMessage, request } from './client';

export function SetupPanel({
  date,
  onSaved,
  onOpenAdmissions,
}: {
  date: string;
  onSaved: () => void;
  onOpenAdmissions?: () => void;
}) {
  const [setup, setSetup] = useState<Setup>();
  const [staffId, setStaffId] = useState('');
  const [area, setArea] = useState<
    'classes' | 'users' | 'assignments' | 'guardians'
  >('classes');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    request<Setup>('setup', undefined, controller.signal)
      .then(setSetup)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      });
    return () => controller.abort();
  }, []);

  async function submit(
    event: ReactSubmitEvent<HTMLFormElement>,
    action: string,
  ) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const submitter = event.nativeEvent.submitter;
    const actualAction =
      (action === 'assign' || action === 'link-guardian') &&
      submitter instanceof HTMLButtonElement
        ? submitter.value
        : action;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setSetup(
        await request<Setup>('setup', { ...data, action: actualAction }),
      );
      if (action !== 'assign') form.reset();
      setMessage('Configuration saved.');
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  if (!setup)
    return error ? (
      <p role="alert" className="erp-error">
        {error}
      </p>
    ) : (
      <output>Loading school setup…</output>
    );
  const staff = setup.staff.find((account) => account.id === staffId);
  const classLabel = (id: string) => {
    const row = setup.classes.find((item) => item.id === id);
    return row ? row.grade + ' · ' + row.section : id;
  };

  const roleName: Record<string, string> = {
    administrator: 'Administrator',
    principal: 'Principal',
    teacher: 'Faculty',
    officer: 'School office',
    commissioner: 'Management',
    parent: 'Parent / guardian',
    staff: 'Campus staff',
  };
  const names = {
    classes: 'Classes & sections',
    users: 'User accounts',
    assignments: 'Staff access',
    guardians: 'Guardian links',
  };
  return (
    <section className="erp-setup">
      <nav className="erp-setup-tabs" aria-label="Setup area">
        {(Object.keys(names) as (keyof typeof names)[]).map((key) => (
          <button
            type="button"
            key={key}
            disabled={busy}
            aria-current={area === key ? 'page' : undefined}
            onClick={() => {
              setArea(key);
              setError('');
              setMessage('');
            }}
          >
            {names[key]}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="erp-error">
          {error}
        </p>
      )}
      {message && <output className="erp-success">{message}</output>}
      <div className="erp-setup-workbench">
        <section className="erp-setup-register">
          <header className="erp-register-heading">
            <div>
              <h2>{names[area]}</h2>
              <p>
                {area === 'classes'
                  ? 'Class sections, enrolled students and assigned faculty.'
                  : area === 'users'
                    ? 'Accounts that can sign in to this school.'
                    : area === 'assignments'
                      ? 'Control which classes and records each staff member can access.'
                      : 'Verified connections between parents and students.'}
              </p>
            </div>
            {area === 'classes' && onOpenAdmissions && (
              <button type="button" onClick={onOpenAdmissions}>
                Open student register
              </button>
            )}
          </header>
          <div className="erp-scroll">
            <table className="erp-table">
              {area === 'classes' && (
                <>
                  <caption className="erp-sr-only">
                    Configured class sections
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Class</th>
                      <th scope="col">Section</th>
                      <th scope="col">Students</th>
                      <th scope="col">Assigned faculty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setup.classes.map((c) => (
                      <tr key={c.id}>
                        <td>{c.grade}</td>
                        <td>{c.section}</td>
                        <td>
                          {
                            setup.enrolments.filter((e) => e.classId === c.id)
                              .length
                          }
                        </td>
                        <td>
                          {setup.assignments
                            .filter((a) => a.targetId === c.id)
                            .map(
                              (a) =>
                                setup.staff.find(
                                  (person) => person.id === a.accountId,
                                )?.name,
                            )
                            .join(', ') || 'Unassigned'}
                        </td>
                      </tr>
                    ))}
                    {!setup.classes.length && (
                      <tr>
                        <td colSpan={4}>
                          No classes yet. Add the first class and section using
                          the form.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </>
              )}
              {area === 'users' && (
                <>
                  <caption className="erp-sr-only">
                    School sign-in accounts
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Username</th>
                      <th scope="col">Role</th>
                      <th scope="col">Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setup.staff.map((person) => (
                      <tr key={person.id}>
                        <td>{person.name}</td>
                        <td>{person.username}</td>
                        <td>{roleName[person.role]}</td>
                        <td>
                          {[
                            'teacher',
                            'principal',
                            'officer',
                            'staff',
                          ].includes(person.role) ? (
                            <button
                              type="button"
                              aria-label={'Manage access for ' + person.name}
                              onClick={() => {
                                setStaffId(person.id);
                                setArea('assignments');
                              }}
                            >
                              Manage access
                            </button>
                          ) : person.role === 'parent' ? (
                            <button
                              type="button"
                              aria-label={'Guardian links for ' + person.name}
                              onClick={() => setArea('guardians')}
                            >
                              Guardian links
                            </button>
                          ) : (
                            'Role access'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
              {area === 'assignments' && (
                <>
                  <caption className="erp-sr-only">
                    Staff access assignments
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Staff member</th>
                      <th scope="col">Role</th>
                      <th scope="col">Assigned access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setup.assignments.map((a) => {
                      const person = setup.staff.find(
                        (p) => p.id === a.accountId,
                      );
                      return (
                        <tr key={a.accountId + a.targetId}>
                          <td>{person?.name}</td>
                          <td>{person && roleName[person.role]}</td>
                          <td>
                            {setup.schools.find((s) => s.id === a.targetId)
                              ?.name ?? classLabel(a.targetId)}
                          </td>
                        </tr>
                      );
                    })}
                    {!setup.assignments.length && (
                      <tr>
                        <td colSpan={3}>
                          No staff assignments. Assign faculty to a class or
                          staff to school records.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </>
              )}
              {area === 'guardians' && (
                <>
                  <caption className="erp-sr-only">
                    Authorised parent and child links
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Parent / guardian</th>
                      <th scope="col">Student</th>
                      <th scope="col">Class</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setup.guardians.map((g) => {
                      const child = setup.enrolments.find(
                        (e) => e.id === g.studentId,
                      );
                      return (
                        <tr key={g.accountId + g.studentId}>
                          <td>
                            {
                              setup.staff.find((p) => p.id === g.accountId)
                                ?.name
                            }
                          </td>
                          <td>{child?.name}</td>
                          <td>{child && classLabel(child.classId)}</td>
                        </tr>
                      );
                    })}
                    {!setup.guardians.length && (
                      <tr>
                        <td colSpan={3}>
                          No guardian links. Verify the parent’s authorisation
                          before linking a child.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </>
              )}
            </table>
          </div>
        </section>
        <aside className="erp-setup-editor" aria-label={names[area] + ' form'}>
          <div hidden={area !== 'classes'}>
            <form onSubmit={(event) => void submit(event, 'class')}>
              <fieldset disabled={busy}>
                <h3>Add class and section</h3>
                <input
                  type="hidden"
                  name="schoolId"
                  value={setup.schools[0]?.id ?? ''}
                />
                <label>
                  Class
                  <input name="grade" required maxLength={32} />
                </label>
                <label>
                  Section
                  <input name="section" required maxLength={16} />
                </label>
                <label>
                  Effective from
                  <input
                    name="effectiveOn"
                    type="date"
                    max={date}
                    defaultValue={date}
                    required
                  />
                </label>
                <button className="erp-primary" disabled={busy}>
                  Add class
                </button>
              </fieldset>
            </form>
          </div>
          <div hidden={area !== 'users'}>
            <form onSubmit={(event) => void submit(event, 'staff')}>
              <fieldset disabled={busy}>
                <h3>Create a user account</h3>
                <label>
                  Staff name
                  <input name="name" required maxLength={120} />
                </label>
                <label>
                  Username
                  <input
                    name="username"
                    required
                    minLength={3}
                    maxLength={64}
                    autoComplete="off"
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={7}
                    maxLength={128}
                    autoComplete="new-password"
                    defaultValue="sos2026"
                  />
                </label>
                <label>
                  Role
                  <select name="role">
                    <option value="teacher">Faculty</option>
                    <option value="parent">Parent / guardian</option>
                    <option value="staff">Campus staff</option>
                    <option value="principal">Principal</option>
                    <option value="officer">School office</option>
                  </select>
                </label>
                <button className="erp-primary" disabled={busy}>
                  Create account
                </button>
              </fieldset>
            </form>
          </div>
          <div hidden={area !== 'assignments'}>
            <form onSubmit={(event) => void submit(event, 'assign')}>
              <fieldset disabled={busy}>
                <h3>Assign staff</h3>
                <label>
                  Staff
                  <select
                    name="accountId"
                    required
                    value={staffId}
                    onChange={(event) => setStaffId(event.target.value)}
                  >
                    <option value="" disabled>
                      Choose staff member
                    </option>
                    {setup.staff
                      .filter((account) =>
                        ['teacher', 'principal', 'officer', 'staff'].includes(
                          account.role,
                        ),
                      )
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} ({account.role})
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {staff?.role === 'teacher' ? 'Class and section' : 'School'}
                  <select
                    key={staffId}
                    name="targetId"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Choose assignment
                    </option>
                    {staff?.role === 'teacher'
                      ? setup.classes.map((row) => (
                          <option key={row.id} value={row.id}>
                            {classLabel(row.id)}
                          </option>
                        ))
                      : setup.schools.map((school) => (
                          <option key={school.id} value={school.id}>
                            {school.name}
                          </option>
                        ))}
                  </select>
                </label>
                <div className="erp-actions">
                  <button
                    className="erp-primary"
                    value="assign"
                    disabled={busy || !staff}
                  >
                    Assign
                  </button>
                  <button value="unassign" disabled={busy || !staff}>
                    Remove assignment
                  </button>
                </div>
              </fieldset>
            </form>
          </div>
          <div hidden={area !== 'guardians'}>
            <form onSubmit={(event) => void submit(event, 'link-guardian')}>
              <fieldset disabled={busy}>
                <h3>Parent access to a child</h3>
                <p>
                  Verify guardian authorisation with the school before granting
                  access. A parent can be linked to more than one child.
                </p>
                <label>
                  Parent account
                  <select name="accountId" required>
                    {setup.staff
                      .filter((a) => a.role === 'parent')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.username})
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Student
                  <select name="studentId" required>
                    {setup.enrolments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {classLabel(s.classId)} · Roll {s.roll}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="erp-actions">
                  <button
                    className="erp-primary"
                    value="link-guardian"
                    disabled={
                      busy ||
                      !setup.staff.some((a) => a.role === 'parent') ||
                      !setup.enrolments.length
                    }
                  >
                    Link child
                  </button>
                  <button
                    value="unlink-guardian"
                    disabled={
                      busy ||
                      !setup.staff.some((a) => a.role === 'parent') ||
                      !setup.enrolments.length
                    }
                  >
                    Remove link
                  </button>
                </div>
              </fieldset>
            </form>
          </div>
        </aside>
      </div>
    </section>
  );
}
