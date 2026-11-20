'use client';
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Scrollable table regions need keyboard focus for horizontal scrolling. */
import { useEffect, useState } from 'react';
import { errorMessage, request } from './client';
import type { admissions } from '@/lib/erp/admissions';

type View = Awaited<ReturnType<typeof admissions>>;

export function AdmissionsPanel({
  date,
  onSaved,
}: {
  date: string;
  onSaved: () => void;
}) {
  const [view, setView] = useState<View>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    void request<View>('admissions')
      .then(setView)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setView(await request<View>('admissions', values));
      form.reset();
      setNotice(
        'Student admitted. The student will appear in the class attendance roster from the admission date.',
      );
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Admission could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }
  const students =
    view?.students.filter((student) =>
      (
        student.name +
        ' ' +
        student.roll +
        ' ' +
        view.classes.find((c) => c.id === student.classId)?.label
      )
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ) ?? [];
  return (
    <section className="erp-card scholars-admissions">
      <h2>Admissions and class allocation</h2>
      <p>
        Add a student to their class. The same record is used for daily
        attendance and fee collections.
      </p>
      {error && (
        <p role="alert" className="erp-error">
          {error}
        </p>
      )}
      {notice && <output className="erp-success">{notice}</output>}
      {!view ? (
        error ? (
          <button
            type="button"
            onClick={() => {
              setError('');
              void request<View>('admissions')
                .then(setView)
                .catch((e) => setError(errorMessage(e)));
            }}
          >
            Try again
          </button>
        ) : (
          <output>Loading student register…</output>
        )
      ) : (
        <>
          <details className="erp-entry-panel">
            <summary>Enrol a student</summary>
            {!view.classes.length && (
              <p className="erp-callout">
                Create a class in School setup before enrolling students.
              </p>
            )}
            <form aria-busy={busy} onSubmit={submit}>
              <fieldset
                className="scholars-admission-form"
                disabled={busy || !view.classes.length}
              >
                <legend>Student and class details</legend>
                <label>
                  Student name
                  <input name="name" required maxLength={120} />
                </label>
                <label>
                  Class
                  <select name="classId" required>
                    {view.classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Class roll number
                  <input name="roll" required maxLength={30} />
                </label>
                <label>
                  Admission date
                  <input
                    type="date"
                    name="effectiveOn"
                    defaultValue={date}
                    max={date}
                    required
                  />
                </label>
                <button
                  className="erp-primary"
                  disabled={busy || !view.classes.length}
                >
                  {busy ? 'Saving…' : 'Admit student'}
                </button>
              </fieldset>
            </form>
          </details>
          <div className="erp-register-toolbar">
            <h3>
              Student register{' '}
              <span className="erp-count">{view.students.length}</span>
            </h3>
            <label>
              Search students
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, class or roll number"
              />
            </label>
          </div>
          <p className="erp-table-description">
            {students.length} of {view.students.length} students
          </p>
          <section
            className="erp-scroll"
            aria-label="Student register"
            tabIndex={0}
          >
            <table className="erp-table">
              <caption className="erp-sr-only">
                Enrolled students and their class allocations
              </caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Class</th>
                  <th scope="col">Roll</th>
                  <th scope="col">Admitted</th>
                </tr>
              </thead>
              <tbody>
                {!students.length && (
                  <tr>
                    <td colSpan={4}>
                      {search
                        ? 'No students match your search.'
                        : 'No students enrolled. Use Enrol a student to add the first record.'}
                    </td>
                  </tr>
                )}
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>
                      {view.classes.find((c) => c.id === s.classId)?.label}
                    </td>
                    <td>{s.roll}</td>
                    <td>{s.effectiveOn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </section>
  );
}
