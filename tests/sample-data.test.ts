import { createHandler } from '../lib/erp/http';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openFileDatabase,
  initializeDatabase,
  many,
  one,
  run,
} from '../lib/erp/database';
import { bootstrapCampus } from '../lib/erp/campus';
import { loadSampleData } from '../lib/erp/sample-data';
import { portal } from '../lib/erp/portals';
import { academics } from '../lib/erp/academics';
import { report, updateRegister } from '../lib/erp/attendance';
import { fees } from '../lib/erp/fees';
import { type Account, todayInNagpur } from '../lib/erp/model';

void test('sample dataset connects every role and is atomic, repeatable and preserves existing records', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'school-samples-'));
  const db = openFileDatabase(join(directory, 'school.sqlite'));
  try {
    await initializeDatabase(db);
    await bootstrapCampus(db, () => 'sos2026', true);
    const accounts = await many<Account>(
      db,
      'SELECT a.id,a.username,a.name,COALESCE(p.role,a.role) AS role FROM account a LEFT JOIN portal_profile p ON p.account_id=a.id',
    );
    const user = (name: string) => accounts.find((a) => a.username === name)!;
    const admin = user('admin'),
      teacher = user('teacher'),
      parent = user('parent'),
      staff = user('staff'),
      principal = user('principal');
    const before = await one<{ id: string; name: string }>(
      db,
      'SELECT id,name FROM enrolment',
    );
    await assert.rejects(loadSampleData(db, parent), { status: 403 });
    // Force a late failure to prove the entire insertion rolls back.
    await run(
      db,
      "CREATE TRIGGER reject_sample_notice BEFORE INSERT ON academic_notice BEGIN SELECT RAISE(ABORT,'Test failure'); END",
    );
    await assert.rejects(loadSampleData(db, admin), /Test failure/);
    assert.equal(
      (
        await many(
          db,
          "SELECT id FROM enrolment WHERE id LIKE 'sos-sample-v1-%'",
        )
      ).length,
      0,
    );
    await run(db, 'DROP TRIGGER reject_sample_notice');

    const handler = createHandler(db, 'http://localhost');
    async function loadAs(username: string) {
      const login = await handler(
        new Request('http://localhost/api/erp/login', {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ username, password: 'sos2026' }),
        }),
      );
      assert.equal(login.status, 200);
      return handler(
        new Request('http://localhost/api/erp/sample-data', {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'content-type': 'application/json',
            cookie: login.headers.get('set-cookie')!.split(';')[0],
          },
          body: '{}',
        }),
      );
    }
    assert.equal((await loadAs('parent')).status, 403);
    const runs = await Promise.all([
      loadSampleData(db, admin),
      loadSampleData(db, admin),
    ]);
    assert.equal(runs.filter((r) => r.alreadyLoaded === false).length, 1);
    const loaded = await loadAs('admin');
    assert.equal(loaded.status, 200);
    assert.equal(
      ((await loaded.json()) as { alreadyLoaded: boolean }).alreadyLoaded,
      true,
    );
    assert.equal((await many(db, 'SELECT id FROM account')).length, 6);
    assert.equal(
      (
        await many(
          db,
          "SELECT id FROM enrolment WHERE id LIKE 'sos-sample-v1-%'",
        )
      ).length,
      9,
    );
    assert.equal(
      (await one<{ name: string }>(
        db,
        'SELECT name FROM enrolment WHERE id=?',
        before!.id,
      ))!.name,
      before!.name,
    );
    const family = await portal(db, parent, todayInNagpur());
    assert.equal(family.children.length, 4);
    assert.ok(family.children.some((c) => c.receipts.length > 0));
    assert.ok(family.children.some((c) => c.attendance?.mark === 'present'));
    assert.ok(family.requests.length > 0);
    const staffView = await portal(db, staff, todayInNagpur());
    assert.ok(staffView.requests.some((r) => r.kind === 'service'));
    const academic = await academics(db, parent);
    assert.ok(academic.homework.length >= 3);
    assert.ok(academic.timetable.length >= 3);
    assert.equal(academic.exams.length, 2);
    assert.ok(academic.results.length > 0);
    assert.ok(academic.notices.length >= 4);
    const faculty = await academics(db, teacher);
    assert.ok(faculty.exams.some((e) => e.status === 'draft'));
    const coverage = await report(db, principal, todayInNagpur(), null);
    assert.ok(coverage.totals.reviewed >= 1);
    assert.ok(coverage.totals.returned >= 1);
    assert.ok(coverage.totals.missing >= 1);
    const finance = await fees(db, user('office'));
    assert.equal(finance.charges.length, 9);
    assert.equal(finance.receipts.length, 6);
    assert.ok(finance.charges.some((c) => c.paid === c.amount));
    assert.ok(finance.charges.some((c) => c.paid > 0 && c.paid < c.amount));
    const marks = await many<{ id: string }>(
      db,
      "SELECT id FROM enrolment WHERE class_id='sos-sample-v1-class-1'",
    );
    await updateRegister(
      db,
      teacher,
      'sos-sample-v1-class-1',
      todayInNagpur(),
      {
        action: 'submit',
        version: 2,
        marks: Object.fromEntries(marks.map((s) => [s.id, 'present'])),
        note: 'Sample correction',
      },
    );
    await loadSampleData(db, admin);
    assert.equal(
      (await one<{ status: string }>(
        db,
        "SELECT status FROM register WHERE class_id='sos-sample-v1-class-1'",
      ))!.status,
      'submitted',
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
