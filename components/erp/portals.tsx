'use client';
import { useEffect, useState, type SubmitEvent } from 'react';
import { GraduationCap } from 'lucide-react';
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
  onHasChildren,
}: {
  account: Account;
  date: string;
  onHasChildren?: (value: boolean) => void;
}) {
  const [view, setView] = useState<View>();
  const [childId, setChildId] = useState('');
  const [requestFilter, setRequestFilter] = useState(
    account.role === 'principal' || account.role === 'administrator'
      ? 'submitted'
      : 'all',
  );
  const [selectedRequestId, setSelectedRequestId] = useState('');
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
        if (!controller.signal.aborted) {
          setView(data);
          onHasChildren?.(data.children.length > 0);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [selectedDate, reload, onHasChildren]);
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
  const visibleRequests =
    view?.requests.filter(
      (r) => requestFilter === 'all' || r.status === requestFilter,
    ) ?? [];
  const selectedRequest =
    visibleRequests.find((r) => r.id === selectedRequestId) ??
    visibleRequests[0];
  const selectedChild =
    view?.children.find((c) => c.id === childId) ?? view?.children[0];
  if (parent && (!view || !view.children.length))
    return (
      <section className="erp-parent-empty" aria-label="Guardian access">
        {!view && !error ? (
          <output>Loading your children…</output>
        ) : (
          <>
            <GraduationCap size={24} aria-hidden="true" />
            <h2>
              {error ? 'Could not load your children' : 'No child linked'}
            </h2>
            <p>
              {error ||
                'Ask the school office to link your account to your child.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setError('');
                setView(undefined);
                setReload((r) => r + 1);
              }}
            >
              Check again
            </button>
          </>
        )}
      </section>
    );
  return (
    <section className="erp-portal">
      <header className="erp-card-title">
        <div>
          <h2>{parent ? 'My children' : 'Request register'}</h2>
          {!parent && (
            <p>
              {account.role === 'principal' || account.role === 'administrator'
                ? 'Review school requests.'
                : 'Track your leave and service requests.'}
            </p>
          )}
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

              {view.children.length > 1 && (
                <label className="erp-parent-date">
                  Child
                  <select
                    value={selectedChild?.id ?? ''}
                    onChange={(e) => setChildId(e.target.value)}
                  >
                    {view.children.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="erp-child-grid">
                {view.children.map((child) => (
                  <article
                    key={child.id}
                    hidden={child.id !== selectedChild?.id}
                    className="erp-child-card"
                  >
                    <h3>{child.name}</h3>
                    <p>
                      {child.className} · Roll {child.roll}
                    </p>
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
          <h3 className="erp-history">
            {view.canReview ? 'School request register' : 'Your requests'}
          </h3>
          <div className="erp-request-toolbar">
            <label>
              Request status
              <select
                value={requestFilter}
                disabled={busy}
                onChange={(e) => setRequestFilter(e.target.value)}
              >
                <option value="all">All requests</option>
                <option value="submitted">Awaiting decision</option>
                <option value="approved">Approved</option>
                <option value="declined">Declined</option>
              </select>
            </label>
            <span>{visibleRequests.length} requests</span>
          </div>
          {!visibleRequests.length ? (
            <p className="erp-empty-line">No requests in this view.</p>
          ) : (
            <div className="erp-requests-workbench">
              <nav className="erp-request-queue" aria-label="Request list">
                {visibleRequests.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    disabled={busy}
                    aria-current={
                      selectedRequest?.id === r.id ? 'true' : undefined
                    }
                    onClick={() => setSelectedRequestId(r.id)}
                  >
                    <strong>
                      {r.kind === 'leave' ? 'Leave' : 'Campus service'} ·{' '}
                      {r.requestedOn}
                    </strong>
                    <span>{r.studentName || r.owner}</span>
                    <small>{r.status}</small>
                  </button>
                ))}
              </nav>
              <div className="erp-request-detail">
                {!selectedRequest && (
                  <p className="erp-table-description">
                    Select a request to view its details and decision history.
                  </p>
                )}
                {visibleRequests.map((r) => (
                  <article
                    key={r.id}
                    hidden={selectedRequest?.id !== r.id}
                    className="erp-request-card"
                  >
                    <header>
                      <h4>
                        {r.kind === 'leave'
                          ? 'Leave request'
                          : 'Campus service'}{' '}
                        · {r.requestedOn}
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
                            <button className="erp-primary">
                              Save decision
                            </button>
                          </fieldset>
                        </form>
                      )}
                  </article>
                ))}
              </div>
            </div>
          )}
          <aside className="erp-request-composer" aria-label="New request">
            {' '}
            {!view.canReview && (
              <details className="erp-entry-panel">
                <summary>
                  {parent ? 'Request leave for a child' : 'Submit a request'}
                </summary>
                <form
                  aria-busy={busy}
                  onSubmit={(e) => void submit(e, 'submit')}
                >
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
                          <select
                            name="studentId"
                            required
                            defaultValue={selectedChild?.id}
                            key={selectedChild?.id}
                          >
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
                        <input
                          type="hidden"
                          name="schoolId"
                          value={view.schools[0]?.id ?? ''}
                        />
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
                    Ask the administrator to assign your school before
                    submitting a request.
                  </p>
                )}
                <p className="erp-table-description">
                  A leave decision does not mark the class register or update
                  payroll. The responsible staff member records those
                  separately.
                </p>
              </details>
            )}
          </aside>
        </>
      )}
    </section>
  );
}
