import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openFileDatabase,
  initializeDatabase,
  many,
  one,
} from '../lib/erp/database';
import { bootstrapCampus } from '../lib/erp/campus';
import { academics, updateAcademics } from '../lib/erp/academics';
import { updateSetup } from '../lib/erp/setup';
import { createHandler } from '../lib/erp/http';
import { type Account, todayInNagpur } from '../lib/erp/model';

void test('academics connects scheduling, homework, locked exam publication, parent reports and scoped communication', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scholars-academics-')),
    path = join(dir, 'school.sqlite');
  let db = openFileDatabase(path);
  const password = 'Fictional-Academic-Test-1234';
  try {
    await initializeDatabase(db);
    await bootstrapCampus(db, () => password, true);
    const accounts = await many<Account>(
      db,
      'SELECT a.id,a.username,a.name,COALESCE(p.role,a.role) AS role FROM account a LEFT JOIN portal_profile p ON p.account_id=a.id',
    );
    const user = (name: string) => accounts.find((a) => a.username === name)!;
    const teacher = user('teacher'),
      principal = user('principal'),
      parent = user('parent'),
      staff = user('staff'),
      admin = user('admin');
    const day = todayInNagpur();
    const section = await one<{ id: string; school_id: string }>(
      db,
      'SELECT id,school_id FROM class_section',
    );
    const write = (account: Account, body: Record<string, unknown>) =>
      updateAcademics(db, account, { requestId: randomUUID(), ...body });
    const slot = {
      action: 'slot',
      classId: section!.id,
      teacherId: teacher.id,
      weekday: 1,
      starts: '09:00',
      ends: '10:00',
      subject: 'Mathematics',
    };
    await write(principal, slot);
    await assert.rejects(
      write(principal, { ...slot, starts: '09:30', ends: '10:30' }),
      { status: 409 },
    );
    await assert.rejects(
      write(teacher, { ...slot, starts: '10:00', ends: '11:00' }),
      { status: 404 },
    );
    await updateSetup(db, admin, {
      action: 'class',
      schoolId: section!.school_id,
      grade: 'Other Class',
      section: 'B',
      effectiveOn: day,
    });
    const other = await one<{ id: string }>(
      db,
      "SELECT id FROM class_section WHERE grade='Other Class'",
    );
    await updateSetup(db, admin, {
      action: 'assign',
      accountId: teacher.id,
      targetId: other!.id,
    });
    await assert.rejects(write(principal, { ...slot, classId: other!.id }), {
      status: 409,
    });
    const homework = {
      action: 'homework',
      classId: section!.id,
      subject: 'Mathematics',
      title: 'Fractions practice',
      instructions: 'Complete the stated problems.',
      dueOn: day,
      requestId: 'repeat-homework',
    };
    await write(teacher, homework);
    await write(teacher, homework);
    assert.equal((await academics(db, parent)).homework.length, 1);
    await assert.rejects(write(parent, homework), { status: 404 });
    await updateSetup(db, admin, {
      action: 'student',
      classId: section!.id,
      name: 'Unlinked learner',
      roll: '2',
      effectiveOn: day,
    });
    await write(teacher, {
      action: 'exam',
      classId: section!.id,
      title: 'Term 1',
      subject: 'Mathematics',
      examOn: day,
      maxScore: 100,
    });
    let view = await academics(db, teacher);
    const paper = view.exams[0],
      roster = view.students.filter((s) => s.classId === section!.id);
    assert.equal((await academics(db, parent)).exams.length, 0);
    await write(teacher, {
      action: 'marks',
      examId: paper.id,
      studentId: roster[0].id,
      score: 0,
    });
    await assert.rejects(
      write(principal, { action: 'publish', examId: paper.id }),
      { status: 409 },
    );
    await assert.rejects(
      write(teacher, {
        action: 'marks',
        examId: paper.id,
        studentId: roster[1].id,
        score: 101,
      }),
      { status: 400 },
    );
    await write(teacher, {
      action: 'marks',
      examId: paper.id,
      studentId: roster[1].id,
      score: 80,
    });
    await assert.rejects(
      write(teacher, { action: 'publish', examId: paper.id }),
      { status: 403 },
    );
    await write(principal, {
      action: 'publish',
      examId: paper.id,
      requestId: 'publish-once',
    });
    await write(principal, {
      action: 'publish',
      examId: paper.id,
      requestId: 'publish-once',
    });
    await assert.rejects(
      write(teacher, {
        action: 'marks',
        examId: paper.id,
        studentId: roster[0].id,
        score: 40,
      }),
      { status: 409 },
    );
    const pv = await academics(db, parent);
    assert.equal(pv.exams.length, 1);
    assert.equal(pv.students.length, 1);
    assert.equal(pv.results.length, 1);
    assert.equal(pv.results[0].studentId, pv.students[0].id);
    assert.equal((await academics(db, staff)).results.length, 0);
    await write(principal, {
      action: 'notice',
      title: 'School notice',
      message: 'School event information.',
    });
    await write(teacher, {
      action: 'notice',
      classId: section!.id,
      title: 'Class notice',
      message: 'Class information.',
    });
    await write(teacher, {
      action: 'notice',
      classId: other!.id,
      title: 'Other class notice',
      message: 'Other class information.',
    });
    assert.equal((await academics(db, parent)).notices.length, 2);
    assert.equal((await academics(db, staff)).notices.length, 1);
    const privateNotice = (await academics(db, teacher)).notices.find(
      (n) => n.title === 'Other class notice',
    )!;
    await assert.rejects(
      write(parent, { action: 'read-notice', noticeId: privateNotice.id }),
      { status: 404 },
    );
    const notice = (await academics(db, parent)).notices[0];
    await write(parent, { action: 'read-notice', noticeId: notice.id });
    assert.ok(
      (await academics(db, parent)).notices.find((n) => n.id === notice.id)!
        .readAt,
    );
    const handler = createHandler(db, 'http://localhost');
    const login = await handler(
      new Request('http://localhost/api/erp/login', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ username: 'parent', password }),
      }),
    );
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const response = await handler(
      new Request('http://localhost/api/erp/academics', {
        headers: { cookie },
      }),
    );
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.equal(body.includes('Unlinked learner'), false);
    await updateSetup(db, admin, {
      action: 'unlink-guardian',
      accountId: parent.id,
      studentId: pv.students[0].id,
    });
    view = await academics(db, parent);
    assert.equal(view.students.length, 0);
    assert.equal(view.results.length, 0);
    assert.equal(view.notices.length, 0);
    assert.ok((await many(db, 'SELECT id FROM academic_event')).length > 0);
    db.close();
    db = openFileDatabase(path);
    await initializeDatabase(db);
    assert.equal((await academics(db, principal)).exams[0].status, 'published');
    assert.equal((await academics(db, teacher)).homework.length, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
