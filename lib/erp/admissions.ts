import { randomUUID } from 'node:crypto';
import { many, one, run, write, type Database, type Query } from './database';
import type { Account } from './model';
import { dateValue, missing, requiredText, ErpError } from './validation';

export type Admission = {
  id: string;
  classId: string;
  name: string;
  roll: string;
  effectiveOn: string;
};

async function authorisedClasses(db: Query, account: Account) {
  if (account.role === 'administrator')
    return many<{ id: string; label: string }>(
      db,
      "SELECT c.id, c.grade || ' · ' || c.section AS label FROM class_section c JOIN school s ON s.id = c.school_id ORDER BY label",
    );
  if (account.role !== 'principal' && account.role !== 'officer') missing();
  return many<{ id: string; label: string }>(
    db,
    "SELECT c.id, c.grade || ' · ' || c.section AS label FROM class_section c JOIN school s ON s.id = c.school_id JOIN school_assignment a ON a.school_id = s.id WHERE a.account_id = ? ORDER BY label",
    account.id,
  );
}

export async function admissions(db: Query, account: Account) {
  const classes = await authorisedClasses(db, account);
  const students: Admission[] = [];
  for (const section of classes)
    students.push(
      ...(await many<Admission>(
        db,
        'SELECT id, class_id AS classId, name, roll, effective_on AS effectiveOn FROM enrolment WHERE class_id = ? ORDER BY roll',
        section.id,
      )),
    );
  return { classes, students };
}

export async function admit(
  db: Database,
  account: Account,
  body: Record<string, unknown>,
) {
  const name = requiredText(body.name, 'Student name');
  const roll = requiredText(body.roll, 'Class roll number', 30);
  const classId = requiredText(body.classId, 'Class', 64);
  const effectiveOn = dateValue(body.effectiveOn);
  await write(db, async (tx) => {
    const classes = await authorisedClasses(tx, account);
    if (!classes.some((c) => c.id === classId)) missing();
    const section = await one<{ effective_on: string }>(
      tx,
      'SELECT effective_on FROM class_section WHERE id = ?',
      classId,
    );
    if (!section || effectiveOn < section.effective_on)
      throw new ErpError(
        400,
        'Admission date must be on or after the class start date.',
      );
    if (
      await one(
        tx,
        'SELECT id FROM enrolment WHERE class_id = ? AND roll = ? COLLATE NOCASE',
        classId,
        roll,
      )
    )
      throw new ErpError(409, 'This class roll number is already in use.');
    const id = randomUUID();
    await run(
      tx,
      'INSERT INTO enrolment VALUES (?, ?, ?, ?, ?)',
      id,
      classId,
      name,
      roll,
      effectiveOn,
    );
    await run(
      tx,
      'INSERT INTO admission_event VALUES (?, ?, ?, ?)',
      id,
      account.id,
      new Date().toISOString(),
      'admitted',
    );
  });
  return admissions(db, account);
}
