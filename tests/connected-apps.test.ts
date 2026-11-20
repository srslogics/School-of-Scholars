import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initializeDatabase, openFileDatabase } from '../lib/erp/database';
import { bootstrapCampus } from '../lib/erp/campus';
import { createHandler } from '../lib/erp/http';
import {
  todayInNagpur,
  type Workspace,
  type Setup,
  type RegisterView,
  type Report,
} from '../lib/erp/model';
import type { fees } from '../lib/erp/fees';
import type { portal } from '../lib/erp/portals';
import type { academics } from '../lib/erp/academics';

void test('all six authenticated apps share admissions, attendance, finance, academics and reviewed requests across restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'school-connected-audit-')),
    path = join(directory, 'school.sqlite');
  let db = openFileDatabase(path);
  try {
    await initializeDatabase(db);
    await bootstrapCampus(db, () => 'sos2026', true);
    let handler = createHandler(db, 'http://localhost');
    const cookies = new Map<string, string>();
    async function login(username: string) {
      const response = await handler(
        new Request('http://localhost/api/erp/login', {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ username, password: 'sos2026' }),
        }),
      );
      assert.equal(response.status, 200);
      cookies.set(username, response.headers.get('set-cookie')!.split(';')[0]);
    }
    async function api<T>(
      username: string,
      path: string,
      body?: Record<string, unknown>,
      status = 200,
    ): Promise<T> {
      const response = await handler(
        new Request('http://localhost/api/erp/' + path, {
          headers: {
            cookie: cookies.get(username) ?? '',
            origin: 'http://localhost',
            'content-type': 'application/json',
          },
          ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
        }),
      );
      const data = await response.json();
      assert.equal(
        response.status,
        status,
        username + ' ' + path + ' ' + JSON.stringify(data),
      );
      return data as T;
    }
    for (const name of [
      'admin',
      'principal',
      'office',
      'teacher',
      'parent',
      'staff',
    ])
      await login(name);
    const day = todayInNagpur();
    const teacher = await api<Workspace>('teacher', 'session'),
      classId = teacher.classes[0].id;
    await api('office', 'admissions', {
      name: 'Connected Learner',
      roll: '42',
      classId,
      effectiveOn: day,
    });
    let roster = await api<RegisterView>(
      'teacher',
      'register/' + classId + '/' + day,
    );
    const learner = roster.roster.find((s) => s.roll === '42')!;
    assert.ok(learner);
    const setup = await api<Setup>('admin', 'setup');
    const parentAccount = setup.staff.find((s) => s.username === 'parent')!;
    await api('admin', 'setup', {
      action: 'link-guardian',
      accountId: parentAccount.id,
      studentId: learner.id,
    });
    let parent = await api<Awaited<ReturnType<typeof portal>>>(
      'parent',
      'portal',
    );
    assert.ok(parent.children.some((c) => c.id === learner.id));
    const registerPath = 'register/' + classId + '/' + day;
    let marks = Object.fromEntries(
      roster.roster.map((s) => [
        s.id,
        s.id === learner.id ? 'absent' : 'present',
      ]),
    );
    await api('teacher', registerPath, { action: 'submit', version: 0, marks });
    parent = await api('parent', 'portal');
    assert.equal(
      parent.children.find((c) => c.id === learner.id)!.attendance?.mark,
      'absent',
    );
    await api('principal', registerPath, {
      action: 'return',
      version: 1,
      note: 'Correct mark',
    });
    parent = await api('parent', 'portal');
    assert.equal(
      parent.children.find((c) => c.id === learner.id)!.attendance,
      null,
    );
    marks = { ...marks, [learner.id]: 'present' };
    await api('teacher', registerPath, {
      action: 'submit',
      version: 2,
      marks,
      note: 'Verified correction',
    });
    await api('principal', registerPath, {
      action: 'review',
      version: 3,
      note: 'Reviewed',
    });
    const summary = await api<Report>('office', 'report?date=' + day);
    assert.equal(summary.totals.present, roster.roster.length);
    const financial = await api<Awaited<ReturnType<typeof fees>>>(
      'office',
      'fees',
      {
        action: 'charge',
        studentId: learner.id,
        amount: 100000,
        description: 'Connected tuition',
        dueOn: day,
        requestId: randomUUID(),
      },
    );
    const charge = financial.charges.find((c) => c.studentId === learner.id)!;
    const payment = {
      action: 'payment',
      chargeId: charge.id,
      amount: 25000,
      mode: 'cash',
      paidOn: day,
      requestId: randomUUID(),
    };
    await api('office', 'fees', payment);
    await api('office', 'fees', payment);
    parent = await api('parent', 'portal');
    assert.equal(
      parent.children.find((c) => c.id === learner.id)!.receipts.length,
      1,
    );
    assert.equal(
      parent.children.find((c) => c.id === learner.id)!.charges[0].paid,
      25000,
    );
    await api('parent', 'fees', undefined, 404);
    await api('staff', 'admissions', undefined, 404);
    await api('teacher', 'setup', undefined, 403);
    async function academic<T>(
      username: string,
      body: Record<string, unknown>,
    ) {
      return api<T>(username, 'academics', {
        requestId: randomUUID(),
        ...body,
      });
    }
    await academic('principal', {
      action: 'slot',
      classId,
      teacherId: teacher.account.id,
      weekday: 2,
      starts: '09:00',
      ends: '09:40',
      subject: 'English',
    });
    await academic('teacher', {
      action: 'homework',
      classId,
      title: 'Reading practice',
      subject: 'English',
      instructions: 'Read the assigned passage.',
      dueOn: day,
    });
    let learning = await academic<Awaited<ReturnType<typeof academics>>>(
      'teacher',
      {
        action: 'exam',
        classId,
        title: 'Audit Term',
        subject: 'English',
        examOn: day,
        maxScore: 100,
      },
    );
    const exam = learning.exams.find((e) => e.title === 'Audit Term')!;
    for (const row of learning.examRoster.filter((r) => r.examId === exam.id))
      await academic('teacher', {
        action: 'marks',
        examId: exam.id,
        studentId: row.studentId,
        score: 75,
      });
    await academic('principal', { action: 'publish', examId: exam.id });
    learning = await api('parent', 'academics');
    assert.ok(
      learning.results.some(
        (r) => r.studentId === learner.id && r.score === 75,
      ),
    );
    assert.ok(learning.homework.some((h) => h.title === 'Reading practice'));
    assert.ok(learning.timetable.some((t) => t.subject === 'English'));
    await academic('principal', {
      action: 'notice',
      title: 'Shared notice',
      message: 'School notice',
    });
    const notice = (
      await api<Awaited<ReturnType<typeof academics>>>('staff', 'academics')
    ).notices[0];
    await academic('staff', { action: 'read-notice', noticeId: notice.id });
    const request = await api<Awaited<ReturnType<typeof portal>>>(
      'parent',
      'portal',
      {
        action: 'submit',
        studentId: learner.id,
        kind: 'leave',
        requestedOn: day,
        message: 'Family appointment',
        requestId: randomUUID(),
      },
    );
    const leave = request.requests[0];
    await api('principal', 'portal', {
      action: 'review',
      id: leave.id,
      decision: 'approved',
      note: 'Leave decision recorded',
    });
    const staffSession = await api<Workspace>('staff', 'session');
    await api('staff', 'portal', {
      action: 'submit',
      schoolId: staffSession.schools[0].id,
      kind: 'service',
      requestedOn: day,
      message: 'Repair desk',
      requestId: randomUUID(),
    });
    const requests = await api<Awaited<ReturnType<typeof portal>>>(
      'principal',
      'portal',
    );
    assert.equal(requests.requests.length, 2);
    const staffRecord = requests.requests.find((r) => r.kind === 'service')!;
    await api('principal', 'portal', {
      action: 'review',
      id: staffRecord.id,
      decision: 'approved',
      note: 'Assigned for repair',
    });
    assert.equal(
      (await api<Awaited<ReturnType<typeof portal>>>('staff', 'portal'))
        .requests[0].status,
      'approved',
    );
    db.close();
    db = openFileDatabase(path);
    await initializeDatabase(db);
    handler = createHandler(db, 'http://localhost');
    parent = await api('parent', 'portal');
    assert.equal(
      parent.requests.find((r) => r.id === leave.id)!.status,
      'approved',
    );
    assert.equal(
      parent.history.filter((h) => h.requestId === leave.id).length,
      2,
    );
    assert.equal(
      parent.children.find((c) => c.id === learner.id)!.receipts.length,
      1,
    );
    roster = await api('principal', registerPath);
    assert.equal(roster.history.length, 4);
    assert.equal(
      (await api<Awaited<ReturnType<typeof academics>>>('staff', 'academics'))
        .notices[0].readAt !== null,
      true,
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
