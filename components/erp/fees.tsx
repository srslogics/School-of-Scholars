'use client';
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Scrollable table regions need keyboard focus for horizontal scrolling. */
import { useEffect, useState, type SubmitEvent } from 'react';
import type { fees } from '@/lib/erp/fees';
import { request, errorMessage } from './client';
type View = Awaited<ReturnType<typeof fees>>;
const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    paise / 100,
  );
export function FeesPanel({ date }: { date: string }) {
  const [view, setView] = useState<View>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState('cash');
  const [chargeKey, setChargeKey] = useState(() => crypto.randomUUID());
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    void request<View>('fees')
      .then(setView)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  async function submit(
    event: SubmitEvent<HTMLFormElement>,
    action: 'charge' | 'payment',
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const text = typeof values.amount === 'string' ? values.amount : '';
    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
      setError('Use rupees with up to two decimal places.');
      return;
    }
    const [whole, fraction = ''] = text.split('.');
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setView(
        await request<View>('fees', {
          ...values,
          amount,
          action,
          requestId: action === 'charge' ? chargeKey : paymentKey,
        }),
      );
      if (action === 'charge') setChargeKey(crypto.randomUUID());
      else setPaymentKey(crypto.randomUUID());
      form.reset();
      if (action === 'payment') setMode('cash');
      setNotice(
        action === 'charge'
          ? 'Fee charge saved.'
          : 'Payment recorded. Receipt appears below.',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!view)
    return (
      <section className="erp-card">
        <h2>Fees & collections</h2>
        {error ? (
          <p role="alert" className="erp-error">
            {error}
          </p>
        ) : (
          <output>Loading fee records…</output>
        )}
      </section>
    );
  const total = view.charges.reduce((sum, c) => sum + c.amount, 0);
  const paid = view.receipts.reduce((sum, r) => sum + r.amount, 0);
  return (
    <section className="erp-card">
      <h2>Fees & collections</h2>
      <p className="erp-callout">
        Record charges and confirmed payments. Receipts record the collection
        mode and staff member.
      </p>
      {error && (
        <p className="erp-error" role="alert">
          {error}
        </p>
      )}
      {notice && <output className="erp-success">{notice}</output>}
      <dl className="erp-kpis">
        <div>
          <dt>Charges</dt>
          <dd>{inr(total)}</dd>
        </div>
        <div>
          <dt>Collected</dt>
          <dd>{inr(paid)}</dd>
        </div>
        <div>
          <dt>Outstanding</dt>
          <dd>{inr(total - paid)}</dd>
        </div>
      </dl>
      <div className="erp-setup-grid">
        <details className="erp-entry-panel">
          <summary>Add a fee charge</summary>
          {!view.students.length && (
            <p className="erp-callout">
              Enrol a student before creating a charge.
            </p>
          )}
          <form aria-busy={busy} onSubmit={(e) => void submit(e, 'charge')}>
            <fieldset disabled={busy || !view.students.length}>
              <legend>Fee charge details</legend>
              <label>
                Student
                <select name="studentId" required>
                  {view.students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · Roll {s.roll}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fee description
                <input name="description" required maxLength={120} />
              </label>
              <label>
                Amount (INR)
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                />
              </label>
              <label>
                Due date
                <input name="dueOn" type="date" required defaultValue={date} />
              </label>
              <button
                className="erp-primary"
                disabled={busy || !view.students.length}
              >
                {busy ? 'Saving…' : 'Save charge'}
              </button>
            </fieldset>
          </form>
        </details>
        <details className="erp-entry-panel">
          <summary>Record a payment</summary>
          {!view.charges.some((c) => c.paid < c.amount) && (
            <p className="erp-callout">
              There are no outstanding charges to collect.
            </p>
          )}
          <form aria-busy={busy} onSubmit={(e) => void submit(e, 'payment')}>
            <fieldset
              disabled={busy || !view.charges.some((c) => c.paid < c.amount)}
            >
              <legend>Collection details</legend>
              <label>
                Outstanding charge
                <select name="chargeId" required>
                  {view.charges
                    .filter((c) => c.paid < c.amount)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {view.students.find((s) => s.id === c.studentId)?.name}{' '}
                        · {c.description} · {inr(c.amount - c.paid)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Amount received (INR)
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                />
              </label>
              <label>
                Payment mode
                <select
                  name="mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank transfer</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                </select>
              </label>
              <label>
                Transaction reference{' '}
                {mode === 'cash' ? '(optional)' : '(required)'}
                <input
                  name="reference"
                  maxLength={100}
                  required={mode !== 'cash'}
                />
              </label>
              <label>
                Payment date
                <input
                  name="paidOn"
                  type="date"
                  max={date}
                  defaultValue={date}
                  required
                />
              </label>
              <button
                className="erp-primary"
                disabled={busy || !view.charges.some((c) => c.paid < c.amount)}
              >
                {busy ? 'Saving…' : 'Record payment'}
              </button>
            </fieldset>
          </form>
        </details>
      </div>
      <h3 className="erp-history">Student fee balances</h3>
      <section
        className="erp-scroll"
        aria-label="Student fee balances"
        tabIndex={0}
      >
        <table className="erp-table">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Fee</th>
              <th scope="col">Due</th>
              <th scope="col">Charged</th>
              <th scope="col">Paid</th>
              <th scope="col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {!view.charges.length && (
              <tr>
                <td colSpan={6}>
                  No fee charges yet. Add a charge for an enrolled student.
                </td>
              </tr>
            )}
            {view.charges.map((c) => (
              <tr key={c.id}>
                <td>{view.students.find((s) => s.id === c.studentId)?.name}</td>
                <td>{c.description}</td>
                <td>{c.dueOn}</td>
                <td className="erp-money">{inr(c.amount)}</td>
                <td className="erp-money">{inr(c.paid)}</td>
                <td className="erp-money">{inr(c.amount - c.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <h3 className="erp-history">Receipts</h3>
      <section
        className="erp-scroll"
        aria-label="Collection receipts"
        tabIndex={0}
      >
        <table className="erp-table">
          <thead>
            <tr>
              <th scope="col">Receipt</th>
              <th scope="col">Student</th>
              <th scope="col">Received</th>
              <th scope="col">Amount</th>
              <th scope="col">Mode / reference</th>
              <th scope="col">Recorded by</th>
            </tr>
          </thead>
          <tbody>
            {!view.receipts.length && (
              <tr>
                <td colSpan={6}>
                  No collections recorded. Saved receipts appear here after a
                  payment.
                </td>
              </tr>
            )}
            {view.receipts.map((r) => (
              <tr key={r.id}>
                <td className="erp-receipt-id">{r.id}</td>
                <td>
                  {
                    view.students.find(
                      (s) =>
                        s.id ===
                        view.charges.find((c) => c.id === r.chargeId)
                          ?.studentId,
                    )?.name
                  }
                </td>
                <td>{r.paidOn}</td>
                <td className="erp-money">{inr(r.amount)}</td>
                <td>
                  {r.mode} {r.reference}
                </td>
                <td>
                  {r.actor}
                  <br />
                  {r.createdAt}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
