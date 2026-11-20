import { randomUUID } from 'node:crypto';
import { passwordHash } from './auth';
import { one, run, write, type Database } from './database';
import { todayInNagpur, type Role } from './model';

export const campusAccounts: [string, string, Role][] = [
  ['admin', 'School Administrator', 'administrator'],
  ['principal', 'Principal', 'principal'],
  ['office', 'School Office', 'officer'],
  ['teacher', 'Class Teacher', 'teacher'],
  ['parent', 'Parent / Guardian', 'parent'],
  ['staff', 'Campus Staff', 'staff'],
  ['management', 'School Management', 'commissioner'],
];

export async function bootstrapCampus(
  db: Database,
  passwordFor: (username: string) => string,
  withSamples = false,
) {
  const accounts = campusAccounts.map(([username, name, role]) => ({
    id: randomUUID(),
    username,
    name,
    role,
    hash: passwordHash(passwordFor(username)),
  }));
  await write(db, async (tx) => {
    if (
      (await one(tx, 'SELECT id FROM school LIMIT 1')) ||
      (await one(tx, 'SELECT id FROM account LIMIT 1'))
    )
      throw new Error(
        'Campus setup requires an empty dedicated database. Existing records are preserved.',
      );
    const schoolId = randomUUID();
    await run(
      tx,
      'INSERT INTO school VALUES (?, ?, ?)',
      schoolId,
      'SOS-KATOL',
      'School of Scholars · Kolambi, Katol',
    );
    for (const a of accounts) {
      await run(
        tx,
        'INSERT INTO account VALUES (?, ?, ?, ?, ?)',
        a.id,
        a.username,
        a.name,
        a.role === 'parent' || a.role === 'staff' ? 'teacher' : a.role,
        a.hash,
      );
      if (a.role === 'parent' || a.role === 'staff')
        await run(tx, 'INSERT INTO portal_profile VALUES (?, ?)', a.id, a.role);
      if (a.role === 'principal' || a.role === 'officer' || a.role === 'staff')
        await run(
          tx,
          'INSERT INTO school_assignment VALUES (?, ?)',
          a.id,
          schoolId,
        );
    }
    if (withSamples) {
      const classId = randomUUID(),
        studentId = randomUUID();
      await run(
        tx,
        'INSERT INTO class_section VALUES (?, ?, ?, ?, ?)',
        classId,
        schoolId,
        'Sample Class',
        'A',
        todayInNagpur(),
      );
      await run(
        tx,
        'INSERT INTO enrolment VALUES (?, ?, ?, ?, ?)',
        studentId,
        classId,
        'Fictional Learner',
        '1',
        todayInNagpur(),
      );
      await run(
        tx,
        'INSERT INTO class_assignment VALUES (?, ?)',
        accounts.find((a) => a.role === 'teacher')!.id,
        classId,
      );
      await run(
        tx,
        'INSERT INTO guardian_link VALUES (?, ?)',
        accounts.find((a) => a.role === 'parent')!.id,
        studentId,
      );
    }
  });
}
