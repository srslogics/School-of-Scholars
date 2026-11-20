import { randomUUID } from 'node:crypto';
import { many, one, run, write, type Query, type Database } from './database';
import { workspace } from './attendance';
import { type Account, todayInNagpur } from './model';
import { dateValue, ErpError, missing, requiredText } from './validation';

type Child = {
  id: string;
  name: string;
  roll: string;
  schoolId: string;
  school: string;
  className: string;
};
async function children(db: Query, account: Account) {
  if (account.role !== 'parent') return [];
  return many<Child>(
    db,
    `SELECT e.id,e.name,e.roll,c.school_id AS schoolId,s.name AS school,c.grade || ' / ' || c.section AS className
    FROM guardian_link g JOIN enrolment e ON e.id = g.student_id JOIN class_section c ON c.id = e.class_id
    JOIN school s ON s.id = c.school_id WHERE g.account_id = ? ORDER BY e.name`,
    account.id,
  );
}
async function scope(db: Query, account: Account) {
  const linked = await children(db, account);
  if (account.role === 'parent') return { linked, schools: [] };
  if (
    !['staff', 'teacher', 'principal', 'administrator'].includes(account.role)
  )
    missing();
  return { linked, schools: (await workspace(db, account)).schools };
}
export async function portal(db: Query, account: Account, day: string) {
  const context = await scope(db, account);
  const learners = [];
  for (const child of context.linked) {
    const attendance = await one<{ mark: string; status: string }>(
      db,
      `SELECT json_extract(j.value,'$.mark') AS mark, r.status FROM register r
      JOIN enrolment e ON e.class_id = r.class_id JOIN json_each(r.entries) j
      WHERE e.id = ? AND r.day = ? AND json_extract(j.value,'$.id') = e.id
      AND r.status IN ('submitted','reviewed')`,
      child.id,
      day,
    );
    const charges = await many<{
      id: string;
      description: string;
      amount: number;
      paid: number;
      dueOn: string;
    }>(
      db,
      `SELECT f.id,f.description,f.amount,f.due_on AS dueOn,
      COALESCE((SELECT SUM(r.amount) FROM fee_receipt r WHERE r.charge_id = f.id),0) AS paid FROM fee_charge f WHERE f.student_id = ? ORDER BY f.due_on`,
      child.id,
    );
    const receipts = await many<{
      id: string;
      amount: number;
      paidOn: string;
      mode: string;
    }>(
      db,
      `SELECT r.id,r.amount,r.paid_on AS paidOn,r.mode FROM fee_receipt r
      JOIN fee_charge f ON f.id=r.charge_id WHERE f.student_id = ? ORDER BY r.created_at DESC`,
      child.id,
    );
    learners.push({
      ...child,
      attendance: attendance ?? null,
      charges,
      receipts,
    });
  }
  const reviewing =
    account.role === 'principal' || account.role === 'administrator';
  const requests = await many<{
    id: string;
    schoolId: string;
    studentId: string | null;
    kind: string;
    requestedOn: string;
    message: string;
    status: string;
    createdAt: string;
    owner: string;
    accountId: string;
    studentName: string | null;
  }>(
    db,
    `SELECT r.id,r.school_id AS schoolId,r.student_id AS studentId,r.kind,r.requested_on AS requestedOn,r.message,r.status,
      r.created_at AS createdAt,a.name AS owner,r.account_id AS accountId,e.name AS studentName FROM portal_request r JOIN account a ON a.id=r.account_id LEFT JOIN enrolment e ON e.id=r.student_id
      WHERE ${reviewing ? (account.role === 'administrator' ? '1=1' : 'r.school_id IN (SELECT school_id FROM school_assignment WHERE account_id = ?)') : 'r.account_id = ?'}
      ORDER BY r.created_at DESC`,
    ...(account.role === 'administrator' ? [] : [account.id]),
  );
  const visible = requests.filter(
    (r) =>
      account.role !== 'parent' ||
      context.linked.some((c) => c.id === r.studentId),
  );
  const history = [];
  for (const request of visible)
    history.push(
      ...(await many<{
        requestId: string;
        actor: string;
        action: string;
        note: string;
        at: string;
      }>(
        db,
        `SELECT e.request_id AS requestId,a.name AS actor,e.action,e.note,e.happened_at AS at
      FROM portal_request_event e JOIN account a ON a.id=e.actor_id WHERE e.request_id = ? ORDER BY e.happened_at,e.id`,
        request.id,
      )),
    );
  return {
    date: day,
    children: learners,
    schools: context.schools,
    requests: visible,
    history,
    canReview: reviewing,
  };
}
export async function updatePortal(
  db: Database,
  account: Account,
  body: Record<string, unknown>,
) {
  await write(db, async (tx) => {
    const context = await scope(tx, account);
    if (body.action === 'review') {
      if (account.role !== 'principal' && account.role !== 'administrator')
        missing();
      const id = requiredText(body.id, 'Request', 64);
      const record = await one<{
        school_id: string;
        account_id: string;
        status: string;
      }>(
        tx,
        'SELECT school_id,account_id,status FROM portal_request WHERE id = ?',
        id,
      );
      if (!record || !context.schools.some((s) => s.id === record.school_id))
        missing();
      if (record.account_id === account.id)
        throw new ErpError(
          403,
          'Another authorised reviewer must decide your request.',
        );
      if (record.status !== 'submitted')
        throw new ErpError(409, 'This request has already been decided.');
      if (body.decision !== 'approved' && body.decision !== 'declined')
        throw new ErpError(400, 'Choose approve or decline.');
      const note = requiredText(body.note, 'Review note', 1000);
      await run(
        tx,
        'UPDATE portal_request SET status = ? WHERE id = ?',
        body.decision,
        id,
      );
      await run(
        tx,
        'INSERT INTO portal_request_event VALUES (?, ?, ?, ?, ?, ?)',
        randomUUID(),
        id,
        account.id,
        body.decision,
        note,
        new Date().toISOString(),
      );
      return;
    }
    if (body.action !== 'submit')
      throw new ErpError(400, 'Choose submit or review.');
    if (!['parent', 'staff', 'teacher'].includes(account.role)) missing();
    const studentId =
      account.role === 'parent'
        ? requiredText(body.studentId, 'Child', 64)
        : null;
    const schoolId =
      account.role === 'parent'
        ? context.linked.find((c) => c.id === studentId)?.schoolId
        : requiredText(body.schoolId, 'School', 64);
    if (
      !schoolId ||
      (account.role !== 'parent' &&
        !context.schools.some((s) => s.id === schoolId))
    )
      missing();
    const kind = requiredText(body.kind, 'Request type', 16);
    if (
      !['leave', 'service'].includes(kind) ||
      (account.role === 'parent' && kind !== 'leave')
    )
      throw new ErpError(400, 'Choose an allowed request type.');
    const day = requiredText(body.requestedOn, 'Requested date', 10);
    const parsed = new Date(day + 'T00:00:00Z');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(+parsed) ||
      parsed.toISOString().slice(0, 10) !== day
    )
      throw new ErpError(400, 'Choose a valid date.');
    const message = requiredText(body.message, 'Request details', 1000);
    const key = requiredText(body.requestId, 'Request ID', 80);
    const payload = JSON.stringify({ schoolId, studentId, kind, day, message });
    const prior = await one<{ account_id: string; payload: string }>(
      tx,
      'SELECT account_id,payload FROM portal_request WHERE request_key = ?',
      key,
    );
    if (prior) {
      if (prior.account_id !== account.id || prior.payload !== payload)
        throw new ErpError(409, 'Request ID has already been used.');
      return;
    }
    const id = randomUUID(),
      at = new Date().toISOString();
    await run(
      tx,
      "INSERT INTO portal_request VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)",
      id,
      account.id,
      schoolId,
      studentId,
      kind,
      day,
      message,
      at,
      key,
      payload,
    );
    await run(
      tx,
      'INSERT INTO portal_request_event VALUES (?, ?, ?, ?, ?, ?)',
      randomUUID(),
      id,
      account.id,
      'submitted',
      message,
      at,
    );
  });
  return portal(db, account, todayInNagpur());
}
export function portalDate(value: string | null) {
  return dateValue(value || todayInNagpur());
}
