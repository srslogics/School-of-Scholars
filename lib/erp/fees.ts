import { randomUUID } from 'node:crypto';
import { admissions } from './admissions';
import { many, one, run, write, type Query, type Database } from './database';
import type { Account } from './model';
import { dateValue, ErpError, missing, requiredText } from './validation';

export type Charge = {
  id: string;
  studentId: string;
  description: string;
  amount: number;
  paid: number;
  dueOn: string;
};
export type Receipt = {
  id: string;
  chargeId: string;
  amount: number;
  mode: string;
  reference: string;
  paidOn: string;
  actor: string;
  createdAt: string;
};

function money(value: unknown) {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) <= 0 ||
    (value as number) > 100_000_000
  )
    throw new ErpError(
      400,
      'Enter a positive amount up to INR 10,00,000 in whole paise.',
    );
  return value as number;
}

function dueDate(value: unknown) {
  const date = requiredText(value, 'Due date', 10);
  const parsed = new Date(date + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(+parsed) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw new ErpError(400, 'Choose a valid due date.');
  return date;
}

async function studentScope(db: Query, account: Account, id: string) {
  const view = await admissions(db, account);
  if (!view.students.some((student) => student.id === id)) missing();
}

export async function fees(db: Query, account: Account) {
  const view = await admissions(db, account);
  const charges: Charge[] = [];
  const receipts: Receipt[] = [];
  for (const section of view.classes) {
    charges.push(
      ...(await many<Charge>(
        db,
        `SELECT f.id, f.student_id AS studentId, f.description, f.amount,
      COALESCE((SELECT SUM(r.amount) FROM fee_receipt r WHERE r.charge_id = f.id),0) AS paid, f.due_on AS dueOn
      FROM fee_charge f JOIN enrolment e ON e.id = f.student_id WHERE e.class_id = ? ORDER BY f.due_on, f.id`,
        section.id,
      )),
    );
    receipts.push(
      ...(await many<Receipt>(
        db,
        `SELECT r.id, r.charge_id AS chargeId, r.amount, r.mode, r.reference,
      r.paid_on AS paidOn, a.name AS actor, r.created_at AS createdAt
      FROM fee_receipt r JOIN fee_charge f ON f.id = r.charge_id JOIN enrolment e ON e.id = f.student_id
      JOIN account a ON a.id = r.actor_id WHERE e.class_id = ? ORDER BY r.created_at DESC`,
        section.id,
      )),
    );
  }
  return { ...view, charges, receipts };
}

export async function updateFees(
  db: Database,
  account: Account,
  body: Record<string, unknown>,
) {
  const key = requiredText(body.requestId, 'Request ID', 80);
  const amount = money(body.amount);
  const action = requiredText(body.action, 'Action', 20);
  // Authorise inside the transaction, including retries after assignment revocation.
  await write(db, async (tx) => {
    if (action === 'charge') {
      const studentId = requiredText(body.studentId, 'Student', 64);
      await studentScope(tx, account, studentId);
      const description = requiredText(body.description, 'Fee description');
      const dueOn = dueDate(body.dueOn);
      const payload = JSON.stringify({ studentId, description, dueOn, amount });
      const prior = await one<{ payload: string; actor_id: string }>(
        tx,
        'SELECT payload, actor_id FROM fee_charge WHERE request_key = ?',
        key,
      );
      if (prior) {
        if (prior.payload !== payload || prior.actor_id !== account.id)
          throw new ErpError(
            409,
            'Request ID was already used for another charge.',
          );
        return;
      }
      await run(
        tx,
        'INSERT INTO fee_charge VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        randomUUID(),
        studentId,
        description,
        amount,
        dueOn,
        account.id,
        new Date().toISOString(),
        key,
        payload,
      );
      return;
    }
    if (action !== 'payment')
      throw new ErpError(400, 'Choose charge or payment.');
    const chargeId = requiredText(body.chargeId, 'Fee charge', 64);
    const mode = requiredText(body.mode, 'Payment mode', 16);
    if (!['cash', 'bank', 'upi', 'card'].includes(mode))
      throw new ErpError(400, 'Choose a supported payment mode.');
    const reference =
      mode === 'cash'
        ? ''
        : requiredText(body.reference, 'Payment reference', 100);
    const paidOn = dateValue(body.paidOn);
    const charge = await one<{
      student_id: string;
      amount: number;
      created_at: string;
    }>(
      tx,
      'SELECT student_id, amount, created_at FROM fee_charge WHERE id = ?',
      chargeId,
    );
    if (!charge) missing();
    await studentScope(tx, account, charge.student_id);
    const student = await one<{ effective_on: string }>(
      tx,
      'SELECT effective_on FROM enrolment WHERE id = ?',
      charge.student_id,
    );
    if (!student || paidOn < student.effective_on)
      throw new ErpError(400, 'Payment cannot precede enrolment.');
    const payload = JSON.stringify({
      chargeId,
      mode,
      reference,
      paidOn,
      amount,
    });
    const prior = await one<{ payload: string; actor_id: string }>(
      tx,
      'SELECT payload, actor_id FROM fee_receipt WHERE request_key = ?',
      key,
    );
    if (prior) {
      if (prior.payload !== payload || prior.actor_id !== account.id)
        throw new ErpError(
          409,
          'Request ID was already used for another payment.',
        );
      return;
    }
    if (
      reference &&
      (await one(
        tx,
        'SELECT id FROM fee_receipt WHERE mode = ? AND reference = ?',
        mode,
        reference,
      ))
    )
      throw new ErpError(
        409,
        'This payment reference has already been recorded. Split allocations require the Accounts workflow.',
      );
    const paid = await one<{ total: number }>(
      tx,
      'SELECT COALESCE(SUM(amount),0) AS total FROM fee_receipt WHERE charge_id = ?',
      chargeId,
    );
    if (amount > charge.amount - (paid?.total ?? 0))
      throw new ErpError(409, 'Payment exceeds the outstanding balance.');
    await run(
      tx,
      'INSERT INTO fee_receipt VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      'R-' + randomUUID(),
      chargeId,
      amount,
      mode,
      reference,
      paidOn,
      account.id,
      new Date().toISOString(),
      key,
      payload,
    );
  });
  return fees(db, account);
}
