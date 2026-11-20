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
export function FeesPanel({
  date,
  initialStudentId,
  selectedArea,
}: {
  date: string;
  initialStudentId?: string;
  selectedArea?: 'balances' | 'receipts' | 'payment' | 'charge';
}) {
  const [studentId, setStudentId] = useState(initialStudentId ?? '');
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<View>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState('cash');
  const [localEntryMode, setEntryMode] = useState<'charge' | 'payment'>(
    'payment',
  );
  const [localLedgerTab, setLedgerTab] = useState<'balances' | 'receipts'>(
    'balances',
  );
  const entryMode =
    selectedArea === 'charge'
      ? 'charge'
      : selectedArea === 'payment'
        ? 'payment'
        : localEntryMode;
  const ledgerTab =
    selectedArea === 'receipts'
      ? 'receipts'
      : selectedArea
        ? 'balances'
        : localLedgerTab;
  const readerOnly = selectedArea === 'balances' || selectedArea === 'receipts';
  const [chargeKey, setChargeKey] = useState(() => crypto.randomUUID());
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    void request<View>('fees')
      .then(setView)
      .catch((e) => setError(errorMessage(e)));
  }, [reload]);
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
      </section>
    );
  const charges = view.charges.filter(
    (c) => !studentId || c.studentId === studentId,
  );
  const receipts = view.receipts.filter((r) =>
    charges.some((c) => c.id === r.chargeId),
  );
  const total = charges.reduce((sum, c) => sum + c.amount, 0);
  const paid = receipts.reduce((sum, r) => sum + r.amount, 0);
  return (
    <section className="erp-finance">
      <div className="erp-card-title">
        <div>
          {!selectedArea && <h2>Student fee ledger</h2>}
          <p>
            Select a student to see charges, payments and the outstanding
            balance.
          </p>
        </div>
        <label>
          Student ledger
          <select
            value={studentId}
            disabled={busy}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">All students</option>
            {view.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · Roll {s.roll}
              </option>
            ))}
          </select>
        </label>
      </div>
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
      <div className="erp-finance-workbench" data-reader-only={readerOnly}>
        <div className="erp-finance-ledger">
          {!selectedArea && (
            <nav className="erp-setup-tabs" aria-label="Fee ledger">
              <button
                type="button"
                aria-current={ledgerTab === 'balances' ? 'page' : undefined}
                onClick={() => setLedgerTab('balances')}
              >
                Balances
              </button>
              <button
                type="button"
                aria-current={ledgerTab === 'receipts' ? 'page' : undefined}
                onClick={() => setLedgerTab('receipts')}
              >
                Receipts
              </button>
            </nav>
          )}
          <div hidden={ledgerTab !== 'balances'}>
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
                  {!charges.length && (
                    <tr>
                      <td colSpan={6}>
                        No fee charges yet. Add a charge for an enrolled
                        student.
                      </td>
                    </tr>
                  )}
                  {charges.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {view.students.find((s) => s.id === c.studentId)?.name}
                      </td>
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
          </div>
          <div hidden={ledgerTab !== 'receipts'}>
            {' '}
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
                  {!receipts.length && (
                    <tr>
                      <td colSpan={6}>
                        No collections recorded. Saved receipts appear here
                        after a payment.
                      </td>
                    </tr>
                  )}
                  {receipts.map((r) => (
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
          </div>
        </div>
        <aside
          hidden={readerOnly}
          className="erp-finance-editor"
          aria-label="Fee transaction"
        >
          {!selectedArea && (
            <nav className="erp-setup-tabs" aria-label="Fee transaction type">
              <button
                type="button"
                disabled={busy}
                aria-current={entryMode === 'payment' ? 'page' : undefined}
                onClick={() => setEntryMode('payment')}
              >
                Collect payment
              </button>
              <button
                type="button"
                disabled={busy}
                aria-current={entryMode === 'charge' ? 'page' : undefined}
                onClick={() => setEntryMode('charge')}
              >
                Add charge
              </button>
            </nav>
          )}
          <div className="erp-finance-forms">
            <div hidden={entryMode !== 'charge'} className="erp-finance-entry">
              <h3>Add a fee charge</h3>
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
                    <select
                      name="studentId"
                      required
                      defaultValue={studentId}
                      key={studentId}
                    >
                      {view.students
                        .filter((s) => !studentId || s.id === studentId)
                        .map((s) => (
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
                    <input
                      name="dueOn"
                      type="date"
                      required
                      defaultValue={date}
                    />
                  </label>
                  <button
                    className="erp-primary"
                    disabled={busy || !view.students.length}
                  >
                    {busy ? 'Saving…' : 'Save charge'}
                  </button>
                </fieldset>
              </form>
            </div>
            <div hidden={entryMode !== 'payment'} className="erp-finance-entry">
              <h3>Record a payment</h3>
              {!charges.some((c) => c.paid < c.amount) && (
                <p className="erp-callout">
                  There are no outstanding charges to collect.
                </p>
              )}
              <form
                aria-busy={busy}
                onSubmit={(e) => void submit(e, 'payment')}
              >
                <fieldset
                  disabled={busy || !charges.some((c) => c.paid < c.amount)}
                >
                  <legend>Collection details</legend>
                  <label>
                    Outstanding charge
                    <select name="chargeId" required key={studentId}>
                      {charges
                        .filter((c) => c.paid < c.amount)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {
                              view.students.find((s) => s.id === c.studentId)
                                ?.name
                            }{' '}
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
                    disabled={busy || !charges.some((c) => c.paid < c.amount)}
                  >
                    {busy ? 'Saving…' : 'Record payment'}
                  </button>
                </fieldset>
              </form>
            </div>
          </div>
        </aside>
      </div>{' '}
    </section>
  );
}
