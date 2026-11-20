'use client';
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Keyboard access is needed for the scrollable class register. */

import {
  useEffect,
  useState,
  type SubmitEvent as ReactSubmitEvent,
} from 'react';
import {
  attendanceRate,
  marks,
  type Counts,
  type Mark,
  type RegisterView,
  type Report,
  type Role,
} from '@/lib/erp/model';
import { errorMessage, request } from './client';

const statusLabel = { present: 'Present', absent: 'Absent', leave: 'On leave' };

export function RegisterPanel({
  classId,
  date,
  role,
  onSaved,
}: {
  classId: string;
  date: string;
  role: Role;
  onSaved: () => void;
}) {
  const path = `register/${encodeURIComponent(classId)}/${encodeURIComponent(date)}`;
  const [view, setView] = useState<RegisterView>();
  const [values, setValues] = useState<Record<string, Mark>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request<RegisterView>(path, undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setView(result);
        setValues(
          Object.fromEntries(
            (result.register?.entries ?? []).map((entry) => [
              entry.id,
              entry.mark,
            ]),
          ),
        );
        setError('');
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      });
    return () => controller.abort();
  }, [path, reload]);

  if (!view)
    return error ? (
      <div role="alert" className="erp-error">
        {error}{' '}
        <button type="button" onClick={() => setReload((r) => r + 1)}>
          Try again
        </button>
      </div>
    ) : (
      <output>Loading register…</output>
    );
  const status =
    view.register?.status ??
    (view.roster.length ? 'not submitted' : 'no enrolment');
  const editable =
    role === 'teacher' &&
    view.roster.length > 0 &&
    (!view.register || status === 'returned');
  const reviewable = role === 'principal' && status === 'submitted';
  async function save(event: ReactSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!view || busy) return;
    const submitter = event.nativeEvent.submitter;
    const action =
      submitter instanceof HTMLButtonElement ? submitter.value : 'submit';
    setError('');
    setSaved('');
    setBusy(true);
    try {
      const result = await request<RegisterView>(path, {
        action,
        version: view.register?.version ?? 0,
        marks: values,
        note,
      });
      setView(result);
      setNote('');
      setSaved(
        action === 'return'
          ? 'Register returned for correction.'
          : action === 'review'
            ? 'Review recorded.'
            : 'Register submitted.',
      );
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="erp-attendance-sheet">
      <header className="erp-card-title">
        <div>
          <h2>
            {view.classSection.grade} · Section {view.classSection.section}
          </h2>
          <p>
            {view.school.name} · {date}
          </p>
        </div>
        <span className={`erp-status erp-${status.replaceAll(' ', '-')}`}>
          {status}
        </span>
      </header>
      {error && (
        <div className="erp-error" role="alert">
          {error}{' '}
          <button type="button" onClick={() => setReload(reload + 1)}>
            Reload register
          </button>
        </div>
      )}
      {saved && <output className="erp-success">{saved}</output>}
      {status === 'returned' && (
        <p className="erp-callout">
          Returned for correction. The reason is in the history below.
        </p>
      )}
      <div className="erp-register-progress" aria-live="polite">
        <strong>
          {Object.keys(values).length} / {view.roster.length} marked
        </strong>
        <span>
          {Object.values(values).filter((m) => m === 'present').length} present
        </span>
        <span>
          {Object.values(values).filter((m) => m === 'absent').length} absent
        </span>
        <span>
          {Object.values(values).filter((m) => m === 'leave').length} on leave
        </span>
      </div>
      <form onSubmit={(event) => void save(event)}>
        {view.roster.length ? (
          <section
            className="erp-scroll"
            aria-label="Class attendance register"
            tabIndex={0}
          >
            <table className="erp-table">
              <thead>
                <tr>
                  <th scope="col">Roll</th>
                  <th scope="col">Student</th>
                  <th scope="col">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {view.roster.map((student) => (
                  <tr key={student.id}>
                    <td>{student.roll}</td>
                    <td>{student.name}</td>
                    <td>
                      {editable ? (
                        <select
                          aria-label={`Attendance for ${student.name}`}
                          value={values[student.id] ?? ''}
                          required
                          disabled={busy}
                          onChange={(event) =>
                            setValues({
                              ...values,
                              [student.id]: event.target.value as Mark,
                            })
                          }
                        >
                          <option value="" disabled>
                            Choose status
                          </option>
                          {marks.map((mark) => (
                            <option key={mark} value={mark}>
                              {statusLabel[mark]}
                            </option>
                          ))}
                        </select>
                      ) : values[student.id] ? (
                        statusLabel[values[student.id]]
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <p>No students are enrolled for this date.</p>
        )}
        {(editable || reviewable) && (
          <div className="erp-form-actions">
            {(reviewable || status === 'returned') && (
              <label>
                {reviewable
                  ? 'Review note (required when returning)'
                  : 'Correction note'}
                <textarea
                  maxLength={500}
                  value={note}
                  required={editable}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            )}
            <div className="erp-actions">
              {editable && (
                <button className="erp-primary" value="submit" disabled={busy}>
                  {status === 'returned'
                    ? 'Resubmit register'
                    : 'Submit register'}
                </button>
              )}
              {reviewable && (
                <>
                  <button
                    className="erp-primary"
                    value="review"
                    disabled={busy}
                  >
                    Mark reviewed
                  </button>
                  <button value="return" disabled={busy}>
                    Return for correction
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </form>
      <details className="erp-history">
        <summary>Register history ({view.history.length})</summary>
        {view.history.length ? (
          <ol>
            {view.history.map((event, index) => (
              <li key={index}>
                <strong>{event.action}</strong> · {event.actor} ·{' '}
                <time dateTime={event.at}>
                  {new Intl.DateTimeFormat('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Asia/Kolkata',
                  }).format(new Date(event.at))}
                </time>
                {event.changedMarks > 0 && (
                  <span> · {event.changedMarks} marks recorded or changed</span>
                )}
                {event.note && <p>{event.note}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p>No submissions recorded.</p>
        )}
      </details>
    </section>
  );
}

function CountsLine({ counts }: { counts: Counts }) {
  return (
    <>
      {counts.present} present / {counts.absent} absent / {counts.leave} on
      leave
    </>
  );
}

export function ReportPanel({
  date,
  schoolId,
  canReview,
  onOpen,
}: {
  date: string;
  schoolId: string;
  canReview: boolean;
  onOpen: (classId: string) => void;
}) {
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const query = new URLSearchParams({
    date,
    ...(schoolId ? { school: schoolId } : {}),
  }).toString();
  useEffect(() => {
    const controller = new AbortController();
    request<Report>(`report?${query}`, undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setReport(result);
          setError('');
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setReport(undefined);
          setError(errorMessage(failure));
        }
      });
    return () => controller.abort();
  }, [query, reload]);
  if (!report)
    return error ? (
      <div role="alert" className="erp-error">
        {error}{' '}
        <button type="button" onClick={() => setReload((r) => r + 1)}>
          Try again
        </button>
      </div>
    ) : (
      <output>Loading attendance summary…</output>
    );

  const { totals } = report;
  return (
    <section className="erp-attendance-report">
      <header className="erp-card-title">
        <div>
          <h2>Attendance and submission coverage</h2>
          <p>{report.date} · School of Scholars, Katol</p>
        </div>
        <div className="erp-report-actions">
          <button type="button" onClick={() => setReload(reload + 1)}>
            Refresh
          </button>
          <a
            className="erp-button"
            href={`/api/erp/report?${query}&format=csv`}
          >
            Export summary CSV
          </a>
        </div>
      </header>
      <dl className="erp-kpis">
        <div>
          <dt>Attendance rate</dt>
          <dd>{attendanceRate(totals)}</dd>
          <small>
            {totals.present} of {totals.total} marks present
          </small>
        </div>
        <div>
          <dt>Registers included</dt>
          <dd>
            {totals.submitted + totals.reviewed}/{totals.expected}
          </dd>
          <small>
            {totals.reviewed} reviewed · {totals.submitted} awaiting review
          </small>
        </div>
        <div>
          <dt>Not submitted</dt>
          <dd>{totals.missing}</dd>
          <small>{totals.returned} returned for correction</small>
        </div>
      </dl>
      <details className="erp-calculation-note">
        <summary>How these figures are calculated</summary>
        <p>
          The rate is total present divided by total marks in submitted and
          reviewed registers. On-leave marks are included in the denominator.
          Missing and returned registers are excluded from the rate. Coverage
          counts classes with enrolment for the selected date. An empty class
          does not count as missing.
        </p>
      </details>
      {report.schools.length === 0 && (
        <p>No schools are assigned to this account.</p>
      )}
      {report.schools.map(({ school, totals: counts, classes }) => (
        <section className="erp-report-school" key={school.id}>
          <h3>{school.name}</h3>
          <p>
            {counts.submitted + counts.reviewed} of {counts.expected} registers
            included · {counts.missing} not submitted · {counts.returned}{' '}
            returned
          </p>
          <p>
            <CountsLine counts={counts} /> · Rate {attendanceRate(counts)}
          </p>
          {classes?.length ? (
            <div className="erp-scroll">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th scope="col">Class / section</th>
                    <th scope="col">Status</th>
                    <th scope="col">Roster</th>
                    <th scope="col">Marks included</th>
                    {canReview && <th scope="col">Register</th>}
                  </tr>
                </thead>
                <tbody>
                  {classes.map((row) => (
                    <tr key={row.classSection.id}>
                      <td>
                        {row.classSection.grade} · {row.classSection.section}
                      </td>
                      <td>{row.status}</td>
                      <td>{row.enrolled}</td>
                      <td>
                        {row.counts.total ? (
                          <CountsLine counts={row.counts} />
                        ) : (
                          '—'
                        )}
                      </td>
                      {canReview && (
                        <td>
                          <button
                            type="button"
                            onClick={() => onOpen(row.classSection.id)}
                          >
                            Open
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            classes && <p>No classes configured for this date.</p>
          )}
        </section>
      ))}
    </section>
  );
}
