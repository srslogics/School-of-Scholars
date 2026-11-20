'use client';
import { useEffect, useState, type SubmitEvent } from 'react';
import type { academics } from '@/lib/erp/academics';
import type { Account } from '@/lib/erp/model';
import { request, errorMessage } from './client';
export type AcademicArea =
  | 'timetable'
  | 'homework'
  | 'exams'
  | 'reports'
  | 'communication';
type View = Awaited<ReturnType<typeof academics>>;
const names: Record<AcademicArea, string> = {
  timetable: 'Timetable',
  homework: 'Homework',
  exams: 'Examinations',
  reports: 'Report cards',
  communication: 'Communication',
};
const weekdays = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export function AcademicPanel({
  account,
  initialArea = 'timetable',
  embedded = false,
}: {
  account: Account;
  initialArea?: AcademicArea;
  embedded?: boolean;
}) {
  const [view, setView] = useState<View>();
  const [area, setArea] = useState<AcademicArea>(initialArea);
  const [classId, setClassId] = useState('');
  const [examId, setExamId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [term, setTerm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const controller = new AbortController();
    void request<View>('academics', undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setView(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [reload]);
  async function submit(event: SubmitEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const body: Record<string, unknown> = {
      ...Object.fromEntries(new FormData(form)),
      action,
      requestId,
    };
    for (const field of ['weekday', 'score', 'maxScore'])
      if (field in body) body[field] = Number(body[field]);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setView(await request<View>('academics', body));
      setRequestId(crypto.randomUUID());
      form.reset();
      setNotice('Saved to school records.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const selectedClass =
    view?.classes.find((c) => c.id === classId) ?? view?.classes[0];
  const papers =
    view?.exams.filter((e) => e.classId === selectedClass?.id) ?? [];
  const paper = papers.find((e) => e.id === examId) ?? papers[0];
  const pupils =
    view?.students.filter((s) => s.classId === selectedClass?.id) ?? [];
  const pupil = pupils.find((s) => s.id === studentId) ?? pupils[0];
  const published = papers.filter((e) => e.status === 'published');
  const terms = [...new Set(published.map((e) => e.title))];
  const selectedTerm = terms.includes(term) ? term : terms[0];
  const cardPapers = published.filter(
    (e) =>
      e.title === selectedTerm &&
      view?.results.some((r) => r.examId === e.id && r.studentId === pupil?.id),
  );
  const classInput = (
    <input type="hidden" name="classId" value={selectedClass?.id ?? ''} />
  );
  return (
    <section className="erp-academic-workspace">
      {!embedded && (
        <nav
          className="erp-setup-tabs erp-academic-tabs"
          aria-label="Academic module"
        >
          {(Object.keys(names) as AcademicArea[])
            .filter(
              (key) =>
                (account.role !== 'staff' && account.role !== 'officer') ||
                key === 'communication',
            )
            .map((key) => (
              <button
                type="button"
                key={key}
                disabled={busy}
                aria-current={area === key ? 'page' : undefined}
                onClick={() => {
                  setArea(key);
                  setError('');
                  setNotice('');
                }}
              >
                {names[key]}
              </button>
            ))}
        </nav>
      )}
      {error && (
        <p className="erp-error" role="alert">
          {error}
        </p>
      )}
      {notice && <output className="erp-success">{notice}</output>}
      {!view ? (
        <>
          <output>
            {error ? 'Records could not be loaded.' : 'Loading school records…'}
          </output>
          {error && (
            <button
              type="button"
              onClick={() => {
                setError('');
                setReload((r) => r + 1);
              }}
            >
              Try again
            </button>
          )}
        </>
      ) : account.role === 'parent' &&
        !view.students.length &&
        area !== 'communication' ? (
        <section className="erp-parent-empty">
          <h2>No child linked</h2>
          <p>
            Linking is required for learning records. School notices are
            available under Communication.
          </p>
        </section>
      ) : (
        <>
          <header className="erp-register-heading">
            <div>
              {!embedded && <h2>{names[area]}</h2>}
              <p>
                {area === 'timetable'
                  ? 'Weekly class periods and assigned teachers.'
                  : area === 'homework'
                    ? 'Assignments and due dates shared with families.'
                    : area === 'exams'
                      ? 'Create subject papers, enter marks and publish after review.'
                      : area === 'reports'
                        ? 'Only principal-approved subject results appear here.'
                        : 'School and class notices with your read status.'}
              </p>
            </div>
            {view.classes.length > 0 && area !== 'communication' && (
              <label>
                Class
                <select
                  disabled={busy}
                  value={selectedClass?.id ?? ''}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setExamId('');
                    setStudentId('');
                  }}
                >
                  {view.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.grade} · {c.section}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </header>
          {area !== 'communication' && !view.classes.length && (
            <p className="erp-callout">
              No classes are available. Ask the school administrator to check
              your class or guardian assignments.
            </p>
          )}
          <div hidden={area !== 'timetable'}>
            <div className="erp-scroll">
              <table className="erp-table">
                <caption className="erp-sr-only">Weekly timetable</caption>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Time</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Teacher</th>
                    {view.canSchedule && <th scope="col">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {view.timetable
                    .filter((t) => t.classId === selectedClass?.id)
                    .map((t) => (
                      <tr key={t.id}>
                        <td>{weekdays[t.weekday]}</td>
                        <td>
                          {t.starts}–{t.ends}
                        </td>
                        <td>{t.subject}</td>
                        <td>{t.teacher}</td>
                        {view.canSchedule && (
                          <td>
                            <form
                              onSubmit={(e) => void submit(e, 'remove-slot')}
                            >
                              <input type="hidden" name="id" value={t.id} />
                              {classInput}
                              <button disabled={busy}>Remove period</button>
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                  {!view.timetable.some(
                    (t) => t.classId === selectedClass?.id,
                  ) && (
                    <tr>
                      <td colSpan={5}>No periods scheduled for this class.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {view.canSchedule && (
              <details className="erp-entry-panel erp-academic-entry">
                <summary>Add a period</summary>
                <form onSubmit={(e) => void submit(e, 'slot')}>
                  <fieldset disabled={busy || !selectedClass}>
                    {classInput}
                    <label>
                      Day
                      <select name="weekday">
                        {weekdays.slice(1).map((d, i) => (
                          <option value={i + 1} key={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Subject
                      <input name="subject" required maxLength={64} />
                    </label>
                    <label>
                      Teacher
                      <select name="teacherId" required>
                        {view.teachers
                          .filter((t) => t.classId === selectedClass?.id)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      From
                      <input name="starts" type="time" required />
                    </label>
                    <label>
                      To
                      <input name="ends" type="time" required />
                    </label>
                    <button className="erp-primary">Save period</button>
                  </fieldset>
                </form>
              </details>
            )}
          </div>
          <div hidden={area !== 'homework'}>
            <div className="erp-homework-list">
              {view.homework
                .filter((h) => h.classId === selectedClass?.id)
                .map((h) => (
                  <article key={h.id}>
                    <header>
                      <h3>{h.title}</h3>
                      <span>
                        {h.subject} · Due {h.dueOn}
                      </span>
                    </header>
                    <p className="erp-request-message">{h.instructions}</p>
                  </article>
                ))}
            </div>
            {!view.homework.some((h) => h.classId === selectedClass?.id) && (
              <p className="erp-callout">No homework assigned to this class.</p>
            )}
            {view.canTeach && (
              <details className="erp-entry-panel erp-academic-entry">
                <summary>Assign homework</summary>
                <form onSubmit={(e) => void submit(e, 'homework')}>
                  <fieldset disabled={busy || !selectedClass}>
                    {classInput}
                    <label>
                      Subject
                      <input name="subject" required maxLength={64} />
                    </label>
                    <label>
                      Title
                      <input name="title" required maxLength={120} />
                    </label>
                    <label>
                      Instructions
                      <textarea name="instructions" required maxLength={4000} />
                    </label>
                    <label>
                      Due date
                      <input name="dueOn" type="date" required />
                    </label>
                    <button className="erp-primary">Share homework</button>
                  </fieldset>
                </form>
              </details>
            )}
          </div>
          <div hidden={area !== 'exams'}>
            <label className="erp-exam-selector">
              Exam paper
              <select
                value={paper?.id ?? ''}
                disabled={busy}
                onChange={(e) => setExamId(e.target.value)}
              >
                {papers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {e.subject} · {e.status}
                  </option>
                ))}
              </select>
            </label>
            {!paper ? (
              <p className="erp-callout">No examination papers available.</p>
            ) : (
              <>
                <p className="erp-table-description">
                  {paper.examOn} · Maximum {paper.maxScore} · {paper.status}
                </p>
                <div className="erp-scroll">
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th scope="col">Student</th>
                        <th scope="col">Marks</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.results
                        .filter((r) => r.examId === paper.id)
                        .map((r) => (
                          <tr key={r.studentId}>
                            <td>
                              {view.students.find((s) => s.id === r.studentId)
                                ?.name ?? 'Exam roster student'}
                            </td>
                            <td>{r.score ?? 'Not entered'}</td>
                            <td>
                              {view.canTeach && paper.status === 'draft' && (
                                <form
                                  className="erp-mark-form"
                                  onSubmit={(e) => void submit(e, 'marks')}
                                >
                                  <input
                                    type="hidden"
                                    name="examId"
                                    value={paper.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="studentId"
                                    value={r.studentId}
                                  />
                                  <input
                                    aria-label={
                                      'Marks for ' +
                                      (view.students.find(
                                        (s) => s.id === r.studentId,
                                      )?.name ?? r.studentId)
                                    }
                                    name="score"
                                    type="number"
                                    min={0}
                                    max={paper.maxScore}
                                    step={1}
                                    required
                                    defaultValue={r.score ?? ''}
                                    key={
                                      paper.id + r.studentId + String(r.score)
                                    }
                                    disabled={busy}
                                  />
                                  <button disabled={busy}>Save marks</button>
                                </form>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {view.canPublish && paper.status === 'draft' && (
                  <form
                    className="erp-actions"
                    onSubmit={(e) => void submit(e, 'publish')}
                  >
                    <input type="hidden" name="examId" value={paper.id} />
                    <button className="erp-primary" disabled={busy}>
                      Approve and publish results
                    </button>
                    <span className="erp-table-description">
                      Requires complete marks and a reached examination date.
                    </span>
                  </form>
                )}
              </>
            )}
            {view.canTeach && (
              <details className="erp-entry-panel erp-academic-entry">
                <summary>Create an examination paper</summary>
                <form onSubmit={(e) => void submit(e, 'exam')}>
                  <fieldset disabled={busy || !selectedClass}>
                    {classInput}
                    <label>
                      Exam / term title
                      <input name="title" required maxLength={120} />
                    </label>
                    <label>
                      Subject
                      <input name="subject" required maxLength={64} />
                    </label>
                    <label>
                      Exam date
                      <input name="examOn" type="date" required />
                    </label>
                    <label>
                      Maximum marks (whole number)
                      <input
                        name="maxScore"
                        type="number"
                        min={1}
                        max={1000}
                        step={1}
                        required
                      />
                    </label>
                    <button className="erp-primary">Create draft paper</button>
                  </fieldset>
                </form>
              </details>
            )}
          </div>
          <div hidden={area !== 'reports'}>
            <div className="erp-report-selectors">
              <label>
                Student
                <select
                  value={pupil?.id ?? ''}
                  onChange={(e) => setStudentId(e.target.value)}
                >
                  {pupils.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · Roll {s.roll}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Exam / term
                <select
                  value={selectedTerm ?? ''}
                  onChange={(e) => setTerm(e.target.value)}
                >
                  {terms.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
            {cardPapers.length ? (
              <article className="erp-report-card">
                <header>
                  <h2>School of Scholars · Kolambi, Katol</h2>
                  <p>{selectedTerm} · Published subject results</p>
                </header>
                <h3>{pupil?.name}</h3>
                <p>
                  {selectedClass?.grade} · {selectedClass?.section} · Roll{' '}
                  {pupil?.roll}
                </p>
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th scope="col">Subject</th>
                      <th scope="col">Marks</th>
                      <th scope="col">Maximum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cardPapers.map((e) => (
                      <tr key={e.id}>
                        <td>{e.subject}</td>
                        <td>
                          {
                            view.results.find(
                              (r) =>
                                r.examId === e.id && r.studentId === pupil?.id,
                            )?.score
                          }
                        </td>
                        <td>{e.maxScore}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      <td>
                        {cardPapers.reduce(
                          (sum, e) =>
                            sum +
                            (view.results.find(
                              (r) =>
                                r.examId === e.id && r.studentId === pupil?.id,
                            )?.score ?? 0),
                          0,
                        )}
                      </td>
                      <td>
                        {cardPapers.reduce((sum, e) => sum + e.maxScore, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <p className="erp-table-description">
                  Includes the published subjects listed above. Grading,
                  attendance, co-scholastic fields and the school’s CBSE report
                  template require configuration.
                </p>
                <button type="button" onClick={() => window.print()}>
                  Print report
                </button>
              </article>
            ) : (
              <p className="erp-callout">
                No published results for the selected student and exam.
              </p>
            )}
          </div>
          <div hidden={area !== 'communication'}>
            <div className="erp-notice-list">
              {view.notices.map((n) => (
                <article key={n.id}>
                  <header>
                    <h3>{n.title}</h3>
                    <span className="erp-status">
                      {n.classId ? 'Class notice' : 'School notice'}
                    </span>
                  </header>
                  <p className="erp-request-message">{n.message}</p>
                  <small>
                    {n.author} ·{' '}
                    {new Date(n.createdAt).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                    })}
                  </small>
                  {n.readAt ? (
                    <p className="erp-table-description">
                      Read{' '}
                      {new Date(n.readAt).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                      })}
                    </p>
                  ) : (
                    <form onSubmit={(e) => void submit(e, 'read-notice')}>
                      <input type="hidden" name="noticeId" value={n.id} />
                      <button disabled={busy}>Mark as read</button>
                    </form>
                  )}
                </article>
              ))}
            </div>
            {!view.notices.length && (
              <p className="erp-callout">
                No notices shared with your account.
              </p>
            )}
            {view.canTeach && (
              <details className="erp-entry-panel erp-academic-entry">
                <summary>Share a notice</summary>
                <form onSubmit={(e) => void submit(e, 'notice')}>
                  <fieldset disabled={busy}>
                    <label>
                      Audience
                      <select name="classId" required={!view.canSchedule}>
                        {view.canSchedule && (
                          <option value="">Whole school</option>
                        )}
                        {view.classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.grade} · {c.section}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Title
                      <input name="title" required maxLength={120} />
                    </label>
                    <label>
                      Message
                      <textarea name="message" required maxLength={4000} />
                    </label>
                    <button className="erp-primary">Publish notice</button>
                  </fieldset>
                </form>
              </details>
            )}
          </div>
        </>
      )}
    </section>
  );
}
