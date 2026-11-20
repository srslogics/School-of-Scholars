'use client';
import { useEffect, useState, type SubmitEvent } from 'react';
import { request, errorMessage } from './client';
import type { portal } from '@/lib/erp/portals';
import type { Account } from '@/lib/erp/model';
type View = Awaited<ReturnType<typeof portal>>;
const rupees = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    value / 100,
  );
export function PortalPanel({
  account,
  date,
}: {
  account: Account;
  date: string;
}) {
  const [view, setView] = useState<View>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedDate, setSelectedDate] = useState(date);
  const [reload, setReload] = useState(0);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const controller = new AbortController();
    void request<View>(
      'portal?date=' + selectedDate,
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setView(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [selectedDate, reload]);
  async function submit(
    event: SubmitEvent<HTMLFormElement>,
    action: 'submit' | 'review',
  ) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await request('portal', { ...values, action, requestId });
      setView(await request<View>('portal?date=' + selectedDate));
      if (action === 'submit') setRequestId(crypto.randomUUID());
      form.reset();
      setMessage(
        action === 'submit'
          ? 'Request submitted to the school.'
          : 'Decision saved.',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const parent = account.role === 'parent';
  const title = parent
    ? 'Parent app'
    : account.role === 'staff'
      ? 'Staff app'
      : account.role === 'teacher'
        ? 'Faculty requests'
        : 'School requests';
  return (
    <section className="erp-card erp-portal">
      <header className="erp-card-title">
        <div>
          <h2>{title}</h2>
          <p>
            {parent
              ? 'Attendance, fee statements and leave requests for your linked children.'
              : account.role === 'principal' || account.role === 'administrator'
                ? 'Review parent, faculty and staff requests for your school.'
                : 'Submit a leave or campus service request and track the school’s response.'}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setView(undefined);
            setError('');
            setReload((r) => r + 1);
          }}
        >
          Refresh records
        </button>
      </header>
      {error && (
        <p className="erp-error" role="alert">
          {error}
        </p>
      )}
      {message && <output className="erp-success">{message}</output>}
      {!view ? (
        <output>
          {error
            ? 'Use Refresh records to try again.'
            : 'Loading your records…'}
        </output>
      ) : (
        <>
          {parent && (
            <>
              <label className="erp-parent-date">
                Attendance date
                <input
                  type="date"
                  value={selectedDate}
                  max={date}
                  onChange={(e) => {
                    if (e.target.value) {
                      setView(undefined);
                      setError('');
                      setSelectedDate(e.target.value);
                    }
                  }}
                />
              </label>
              {!view.children.length && (
                <p className="erp-callout">
                  No children are linked to your account. Contact the school
                  office to verify guardian access.
                </p>
              )}
              <div className="erp-child-grid">
                {view.children.map((child) => (
                  <article key={child.id} className="erp-child-card">
                    <h3>{child.name}</h3>
                    <p>
                      {child.className} · Roll {child.roll}
                    </p>
                    <p>{child.school}</p>
                    <dl className="erp-child-summary">
                      <div>
                        <dt>Attendance · {selectedDate}</dt>
                        <dd>
                          {child.attendance
                            ? child.attendance.mark === 'leave'
                              ? 'On leave'
                              : child.attendance.mark === 'present'
                                ? 'Present'
                                : 'Absent'
                            : 'No published register entry'}
                        </dd>
                      </div>
                      <div>
                        <dt>Outstanding fees</dt>
                        <dd>
                          {rupees(
                            child.charges.reduce(
                              (sum, c) => sum + c.amount - c.paid,
                              0,
                            ),
                          )}
                        </dd>
                      </div>
                    </dl>
                    <details className="erp-entry-panel">
                      <summary>View fee statement and receipts</summary>
                      {child.charges.length ? (
                        <ul>
                          {child.charges.map((c) => (
                            <li key={c.id}>
                              <strong>{c.description}</strong> · Due {c.dueOn}
                              <br />
                              Charge {rupees(c.amount)} · Paid {rupees(c.paid)}{' '}
                              · Balance {rupees(c.amount - c.paid)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No fee charges recorded.</p>
                      )}
                      <h4>Receipts</h4>
                      {child.receipts.length ? (
                        <ul>
                          {child.receipts.map((r) => (
                            <li key={r.id}>
                              <strong>{rupees(r.amount)}</strong> · {r.paidOn} ·{' '}
                              {r.mode}
                              <br />
                              <span className="erp-receipt-id">{r.id}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No payments recorded.</p>
                      )}
                    </details>
                  </article>
                ))}
              </div>
            </>
          )}
          {!view.canReview && (
            <details className="erp-entry-panel">
              <summary>
                {parent ? 'Request leave for a child' : 'Submit a request'}
              </summary>
              <form aria-busy={busy} onSubmit={(e) => void submit(e, 'submit')}>
                <fieldset
                  disabled={
                    busy ||
                    (parent ? !view.children.length : !view.schools.length)
                  }
                >
                  <legend>Request details</legend>
                  {parent ? (
                    <>
                      <label>
                        Child
                        <select name="studentId" required>
                          {view.children.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} · {c.className}
                            </option>
                          ))}
                        </select>
                      </label>
                      <input type="hidden" name="kind" value="leave" />
                    </>
                  ) : (
                    <>
                      <label>
                        School
                        <select name="schoolId" required>
                          {view.schools.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Request type
                        <select name="kind">
                          <option value="leave">Leave</option>
                          <option value="service">Campus service</option>
                        </select>
                      </label>
                    </>
                  )}
                  <label>
                    Requested date
                    <input
                      type="date"
                      name="requestedOn"
                      defaultValue={date}
                      required
                    />
                  </label>
                  <label>
                    Details
                    <textarea name="message" maxLength={1000} required />
                  </label>
                  <button className="erp-primary">
                    {busy ? 'Submitting…' : 'Submit request'}
                  </button>
                </fieldset>
              </form>
              {!parent && !view.schools.length && (
                <p className="erp-callout">
                  Ask the administrator to assign your school before submitting
                  a request.
                </p>
              )}
              <p className="erp-table-description">
                A leave decision does not mark the class register or update
                payroll. The responsible staff member records those separately.
              </p>
            </details>
          )}
          <h3 className="erp-history">
            {view.canReview ? 'School request register' : 'Your requests'}
          </h3>
          {!view.requests.length && (
            <p className="erp-callout">No requests to show.</p>
          )}
          <div className="erp-request-list">
            {view.requests.map((r) => (
              <article key={r.id} className="erp-request-card">
                <header>
                  <h4>
                    {r.kind === 'leave' ? 'Leave request' : 'Campus service'} ·{' '}
                    {r.requestedOn}
                  </h4>
                  <span className="erp-status">{r.status}</span>
                </header>
                <p>
                  {r.owner}
                  {r.studentId
                    ? ' · ' + (r.studentName || 'Student leave')
                    : ''}
                </p>
                <p className="erp-request-message">{r.message}</p>
                <details>
                  <summary>View history</summary>
                  <ol>
                    {view.history
                      .filter((h) => h.requestId === r.id)
                      .map((h, i) => (
                        <li key={i}>
                          {h.action} · {h.actor} ·{' '}
                          {new Date(h.at).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                          })}
                          <p>{h.note}</p>
                        </li>
                      ))}
                  </ol>
                </details>
                {view.canReview &&
                  r.status === 'submitted' &&
                  r.accountId !== account.id && (
                    <form onSubmit={(e) => void submit(e, 'review')}>
                      <fieldset disabled={busy}>
                        <legend>Review request</legend>
                        <input type="hidden" name="id" value={r.id} />
                        <label>
                          Decision
                          <select name="decision">
                            <option value="approved">Approve</option>
                            <option value="declined">Decline</option>
                          </select>
                        </label>
                        <label>
                          Review note
                          <textarea name="note" required maxLength={1000} />
                        </label>
                        <button className="erp-primary">Save decision</button>
                      </fieldset>
                    </form>
                  )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
