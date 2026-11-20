import { admit } from './admissions';
import { randomUUID } from 'node:crypto';
import { passwordHash, usernameValue } from './auth';
import { many, one, write, run, type Query, type Database } from './database';
import { todayInNagpur, type Account, type Setup } from './model';
import { dateValue, ErpError, missing, requiredText } from './validation';

export async function readSetup(db: Query, account: Account): Promise<Setup> {
  if (account.role !== 'administrator')
    throw new ErpError(403, 'School setup requires an administrator.');
  return {
    schools: await many(db, 'SELECT id, code, name FROM school ORDER BY code'),
    classes: await many(
      db,
      'SELECT id, school_id AS schoolId, grade, section FROM class_section ORDER BY grade, section',
    ),
    staff: await many(
      db,
      'SELECT a.id, a.username, a.name, COALESCE(p.role,a.role) AS role FROM account a LEFT JOIN portal_profile p ON p.account_id = a.id ORDER BY username',
    ),
    assignments: await many(
      db,
      `SELECT account_id AS accountId, class_id AS targetId FROM class_assignment
      UNION ALL SELECT account_id, school_id FROM school_assignment`,
    ),
    guardians: await many(
      db,
      'SELECT account_id AS accountId, student_id AS studentId FROM guardian_link',
    ),
    enrolments: await many(
      db,
      'SELECT id, class_id AS classId, name, roll, effective_on AS effectiveOn FROM enrolment ORDER BY roll',
    ),
  };
}

export async function updateSetup(
  db: Database,
  account: Account,
  body: Record<string, unknown>,
) {
  if (account.role !== 'administrator')
    throw new ErpError(403, 'School setup requires an administrator.');
  if (body.action === 'student') {
    await admit(db, account, {
      ...body,
      effectiveOn: body.effectiveOn || todayInNagpur(),
    });
    return readSetup(db, account);
  }
  try {
    await write(db, async (tx) => {
      switch (body.action) {
        case 'school':
          if (await one(tx, "SELECT id FROM school WHERE code='SOS-KATOL'"))
            throw new ErpError(
              409,
              'This installation is for School of Scholars, Katol only.',
            );
          await run(
            tx,
            'INSERT INTO school VALUES (?, ?, ?)',
            randomUUID(),
            requiredText(body.code, 'School code', 24),
            requiredText(body.name, 'School name'),
          );
          break;
        case 'class': {
          const schoolId = requiredText(body.schoolId, 'School');
          if (!(await one(tx, 'SELECT id FROM school WHERE id = ?', schoolId)))
            missing();
          await run(
            tx,
            'INSERT INTO class_section VALUES (?, ?, ?, ?, ?)',
            randomUUID(),
            schoolId,
            requiredText(body.grade, 'Class', 32),
            requiredText(body.section, 'Section', 16),
            body.effectiveOn ? dateValue(body.effectiveOn) : todayInNagpur(),
          );
          break;
        }
        case 'staff': {
          const { role, password } = body;
          if (
            typeof role !== 'string' ||
            !['teacher', 'principal', 'officer', 'parent', 'staff'].includes(
              role,
            )
          )
            throw new ErpError(
              400,
              'Choose faculty, principal, school office, parent or staff.',
            );
          if (typeof password !== 'string')
            throw new ErpError(400, 'A password is required.');
          const accountId = randomUUID();
          await run(
            tx,
            'INSERT INTO account VALUES (?, ?, ?, ?, ?)',
            accountId,
            usernameValue(body.username),
            requiredText(body.name, 'Staff name'),
            role === 'parent' || role === 'staff' ? 'teacher' : role,
            passwordHash(password),
          );
          if (role === 'parent' || role === 'staff')
            await run(
              tx,
              'INSERT INTO portal_profile VALUES (?, ?)',
              accountId,
              role,
            );
          break;
        }
        case 'link-guardian':
        case 'unlink-guardian': {
          const parentId = requiredText(body.accountId, 'Parent account', 64);
          const studentId = requiredText(body.studentId, 'Student', 64);
          if (
            !(await one(
              tx,
              "SELECT account_id FROM portal_profile WHERE account_id = ? AND role = 'parent'",
              parentId,
            )) ||
            !(await one(tx, 'SELECT id FROM enrolment WHERE id = ?', studentId))
          )
            missing();
          if (body.action === 'link-guardian')
            await run(
              tx,
              'INSERT INTO guardian_link VALUES (?, ?) ON CONFLICT DO NOTHING',
              parentId,
              studentId,
            );
          else
            await run(
              tx,
              'DELETE FROM guardian_link WHERE account_id = ? AND student_id = ?',
              parentId,
              studentId,
            );
          await run(
            tx,
            'INSERT INTO guardian_event VALUES (?, ?, ?, ?, ?, ?)',
            randomUUID(),
            parentId,
            studentId,
            account.id,
            body.action === 'link-guardian' ? 'linked' : 'unlinked',
            new Date().toISOString(),
          );
          break;
        }
        case 'assign':
        case 'unassign': {
          const id = requiredText(body.accountId, 'Staff account');
          const staff = await one<Account>(
            tx,
            'SELECT a.id, COALESCE(p.role,a.role) AS role FROM account a LEFT JOIN portal_profile p ON p.account_id = a.id WHERE a.id = ?',
            id,
          );
          if (!staff) missing();
          const teacher = staff.role === 'teacher';
          if (
            !teacher &&
            staff.role !== 'principal' &&
            staff.role !== 'officer' &&
            staff.role !== 'staff'
          )
            throw new ErpError(
              400,
              'Choose a teacher, principal or school office.',
            );
          const target = requiredText(
            body.targetId,
            teacher ? 'Class' : 'School',
          );
          const table = teacher ? 'class_assignment' : 'school_assignment';
          const column = teacher ? 'class_id' : 'school_id';
          if (
            !(await one(
              tx,
              `SELECT id FROM ${teacher ? 'class_section' : 'school'} WHERE id = ?`,
              target,
            ))
          )
            missing();
          if (body.action === 'unassign') {
            await run(
              tx,
              `DELETE FROM ${table} WHERE account_id = ? AND ${column} = ?`,
              id,
              target,
            );
          } else {
            if (
              staff.role === 'principal' &&
              (await one(
                tx,
                'SELECT school_id FROM school_assignment WHERE account_id = ? AND school_id <> ?',
                id,
                target,
              ))
            )
              throw new ErpError(
                409,
                'Remove the previous school assignment before reassigning a principal.',
              );
            await run(
              tx,
              `INSERT INTO ${table} VALUES (?, ?) ON CONFLICT DO NOTHING`,
              id,
              target,
            );
          }
          break;
        }
        default:
          throw new ErpError(400, 'Unknown setup action.');
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('UNIQUE constraint failed')
    )
      throw new ErpError(
        409,
        'That code, class and section, roll number or username already exists.',
      );
    throw error;
  }
  return readSetup(db, account);
}
