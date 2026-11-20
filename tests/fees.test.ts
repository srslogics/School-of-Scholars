import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initializeDatabase,
  openFileDatabase,
  many,
  one,
  run,
} from '../lib/erp/database';
import { bootstrapCampus } from '../lib/erp/campus';
import { admit } from '../lib/erp/admissions';
import { fees, updateFees } from '../lib/erp/fees';
import { createHandler } from '../lib/erp/http';
import { todayInNagpur, type Account } from '../lib/erp/model';

void test('campus setup, admissions, fees, retry protection, isolation and receipt persistence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scholars-fees-'));
  const path = join(dir, 'campus.sqlite');
  let db = openFileDatabase(path);
  try {
    await initializeDatabase(db);
    await initializeDatabase(db);
    await bootstrapCampus(db, () => 'Fictional-Testing-6290', true);
    assert.equal((await many(db, 'SELECT * FROM school')).length, 1);
    assert.equal((await many(db, 'SELECT * FROM schema_migration')).length, 2);
    await assert.rejects(
      bootstrapCampus(db, () => 'Fictional-Testing-6290'),
      /empty dedicated/,
    );
    const accounts = await many<Account>(
      db,
      'SELECT id,username,name,role FROM account',
    );
    const office = accounts.find((a) => a.username === 'office')!;
    const principal = accounts.find((a) => a.username === 'principal')!;
    const teacher = accounts.find((a) => a.username === 'teacher')!;
    const management: Account = {
      id: 'disabled',
      username: 'management',
      name: 'Legacy',
      role: 'commissioner',
    };
    const classroom = await one<{ id: string }>(
      db,
      'SELECT id FROM class_section',
    );
    await admit(db, office, {
      name: 'Fictional Admission',
      roll: '2',
      classId: classroom!.id,
      effectiveOn: todayInNagpur(),
    });
    const student = (await fees(db, office)).students.find(
      (s) => s.roll === '2',
    )!;
    const charge = {
      action: 'charge',
      studentId: student.id,
      amount: 100_000,
      description: 'Test tuition',
      dueOn: '2027-01-01',
      requestId: 'charge-1',
    };
    await updateFees(db, office, charge);
    await updateFees(db, office, charge);
    await assert.rejects(
      updateFees(db, office, { ...charge, amount: 120_000 }),
      { status: 409 },
    );
    const chargeId = (await fees(db, office)).charges[0].id;
    const payment = {
      action: 'payment',
      chargeId,
      amount: 40_000,
      mode: 'upi',
      reference: 'TEST-TXN-01',
      paidOn: todayInNagpur(),
      requestId: 'payment-1',
    };
    await updateFees(db, office, payment);
    await updateFees(db, office, payment);
    await assert.rejects(
      updateFees(db, office, { ...payment, amount: 40_001 }),
      { status: 409 },
    );
    await assert.rejects(
      updateFees(db, office, { ...payment, amount: 1.5, requestId: 'bad' }),
      { status: 400 },
    );
    await assert.rejects(
      updateFees(db, office, {
        ...payment,
        reference: '',
        requestId: 'bad-ref',
      }),
      { status: 400 },
    );
    const competing = await Promise.allSettled([
      updateFees(db, office, {
        ...payment,
        amount: 60_000,
        reference: 'TEST-TXN-02',
        requestId: 'payment-2',
      }),
      updateFees(db, office, {
        ...payment,
        amount: 60_000,
        reference: 'TEST-TXN-03',
        requestId: 'payment-3',
      }),
    ]);
    assert.equal(competing.filter((r) => r.status === 'fulfilled').length, 1);
    const view = await fees(db, principal);
    assert.equal(view.charges[0].paid, 100_000);
    assert.equal(view.receipts.length, 2);
    assert.equal(view.receipts[0].actor, 'School Office');
    await assert.rejects(fees(db, teacher), { status: 404 });
    await assert.rejects(fees(db, management), { status: 404 });
    await run(db, "INSERT INTO school VALUES ('other','OTHER','Other campus')");
    await run(
      db,
      "INSERT INTO class_section VALUES ('other-class','other','Test','A',?)",
      todayInNagpur(),
    );
    await run(
      db,
      "INSERT INTO enrolment VALUES ('other-student','other-class','Hidden learner','1',?)",
      todayInNagpur(),
    );
    await assert.rejects(
      updateFees(db, office, {
        ...charge,
        studentId: 'other-student',
        requestId: 'other',
      }),
      { status: 404 },
    );
    await run(
      db,
      'DELETE FROM school_assignment WHERE account_id = ?',
      office.id,
    );
    await assert.rejects(updateFees(db, office, payment), { status: 404 });
    assert.equal((await fees(db, office)).receipts.length, 0);
    db.close();
    db = openFileDatabase(path);
    await initializeDatabase(db);
    assert.equal((await fees(db, principal)).receipts.length, 2);
    const handle = createHandler(db, 'http://localhost');
    const login = await handle(
      new Request('http://localhost/api/erp/login', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          username: 'principal',
          password: 'Fictional-Testing-6290',
        }),
      }),
    );
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const report = await handle(
      new Request('http://localhost/api/erp/fees', { headers: { cookie } }),
    );
    assert.equal(report.status, 200);
    assert.equal(
      ((await report.json()) as { receipts: unknown[] }).receipts.length,
      2,
    );
    const unsigned = await handle(new Request('http://localhost/api/erp/fees'));
    assert.equal(unsigned.status, 401);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

void test('empty production campus bootstrap creates no fictional students or classes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scholars-empty-'));
  const db = openFileDatabase(join(dir, 'school.sqlite'));
  try {
    await initializeDatabase(db);
    await bootstrapCampus(db, () => 'Fictional-Testing-6290');
    assert.equal((await many(db, 'SELECT * FROM enrolment')).length, 0);
    assert.equal((await many(db, 'SELECT * FROM class_section')).length, 0);
    assert.equal((await many(db, 'SELECT username FROM account')).length, 6);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
