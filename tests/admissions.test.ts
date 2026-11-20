import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initializeDatabase,
  openFileDatabase,
  many,
} from '../lib/erp/database';
import { seedFictionalSchools } from '../lib/erp/seed';
import { admissions, admit } from '../lib/erp/admissions';
import { getRegister } from '../lib/erp/attendance';
import { todayInNagpur, type Account } from '../lib/erp/model';

void test('admission joins attendance, rejects duplicates and enforces school and role access', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sos-admissions-'));
  const db = openFileDatabase(join(dir, 'school.sqlite'));
  const principal: Account = {
    id: 'principal.a',
    username: 'principal.a',
    name: 'Demo Principal A',
    role: 'principal',
  };
  const teacher: Account = {
    id: 'teacher.a',
    username: 'teacher.a',
    name: 'Demo Teacher A',
    role: 'teacher',
  };
  try {
    await initializeDatabase(db);
    await seedFictionalSchools(db, () => 'FictionalTesting-1234');
    const body = {
      name: 'Fictional New Learner',
      classId: 'class-a',
      roll: '99',
      effectiveOn: todayInNagpur(),
    };
    await admit(db, principal, body);
    assert.equal(
      (await getRegister(db, teacher, 'class-a', todayInNagpur())).roster
        .length,
      4,
    );
    assert.equal((await admissions(db, principal)).students.length, 6);
    await assert.rejects(admit(db, principal, body), { status: 409 });
    await assert.rejects(
      admit(db, principal, { ...body, classId: 'class-b' }),
      { status: 404 },
    );
    await assert.rejects(admissions(db, teacher), { status: 404 });
    await assert.rejects(admit(db, teacher, { ...body, roll: '100' }), {
      status: 404,
    });
    assert.equal((await many(db, 'SELECT * FROM admission_event')).length, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
