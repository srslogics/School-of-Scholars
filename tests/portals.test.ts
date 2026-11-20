import { workspacePath } from '../lib/erp/model';
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
import { portal, updatePortal } from '../lib/erp/portals';
import { updateSetup } from '../lib/erp/setup';
import { updateRegister } from '../lib/erp/attendance';
import { updateFees } from '../lib/erp/fees';
import { createHandler } from '../lib/erp/http';
import { todayInNagpur, type Account } from '../lib/erp/model';

void test('parent, faculty and staff portals enforce links, isolation, review history and revocation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'scholars-portals-'));
  const path = join(directory, 'school.sqlite');
  let db = openFileDatabase(path);
  const password = 'Fictional-Portal-Testing-1234';
  try {
    await initializeDatabase(db);
    await bootstrapCampus(db, () => password, true);
    const accounts = await many<Account>(
      db,
      'SELECT a.id,a.username,a.name,COALESCE(p.role,a.role) AS role FROM account a LEFT JOIN portal_profile p ON p.account_id=a.id',
    );
    const account = (name: string) =>
      accounts.find((a) => a.username === name)!;
    const parent = account('parent'),
      staff = account('staff'),
      principal = account('principal'),
      teacher = account('teacher'),
      admin = account('admin'),
      office = account('office');
    const day = todayInNagpur();
    const student = await one<{ id: string; class_id: string }>(
      db,
      'SELECT id,class_id FROM enrolment',
    );
    const school = await one<{ id: string }>(db, 'SELECT id FROM school');
    const initial = await portal(db, parent, day);
    assert.equal(initial.children.length, 1);
    assert.equal(initial.children[0].attendance, null);
    const roster = await many<{ id: string; name: string; roll: string }>(
      db,
      'SELECT id,name,roll FROM enrolment',
    );
    await updateRegister(db, teacher, student!.class_id, day, {
      action: 'submit',
      version: 0,
      marks: Object.fromEntries(roster.map((s) => [s.id, 'present'])),
      note: '',
    });
    // Use the same student ledger as Accounts.
    await updateFees(db, office, {
      action: 'charge',
      studentId: student!.id,
      description: 'Test fee',
      amount: 10000,
      dueOn: day,
      requestId: 'charge-portal',
    });
    const charge = (await portal(db, parent, day)).children[0].charges[0];
    assert.equal(charge.amount, 10000);
    assert.equal(
      (await portal(db, parent, day)).children[0].attendance?.mark,
      'present',
    );
    await updateSetup(db, admin, {
      action: 'student',
      classId: student!.class_id,
      name: 'Unlinked learner',
      roll: '2',
      effectiveOn: day,
    });
    const other = await one<{ id: string }>(
      db,
      "SELECT id FROM enrolment WHERE roll='2'",
    );
    assert.equal((await portal(db, parent, day)).children.length, 1);
    const body = {
      action: 'submit',
      studentId: student!.id,
      kind: 'leave',
      requestedOn: day,
      message: 'Fictional leave request',
      requestId: 'parent-request',
    };
    await updatePortal(db, parent, body);
    await updatePortal(db, parent, body);
    assert.equal((await portal(db, parent, day)).requests.length, 1);
    await assert.rejects(
      updatePortal(db, parent, {
        ...body,
        studentId: other!.id,
        requestId: 'other-child',
      }),
      { status: 404 },
    );
    await assert.rejects(
      updatePortal(db, parent, { ...body, message: 'Changed content' }),
      { status: 409 },
    );
    const record = (await portal(db, principal, day)).requests[0];
    await assert.rejects(
      updatePortal(db, parent, {
        action: 'review',
        id: record.id,
        decision: 'approved',
        note: 'Spoofed',
      }),
      { status: 404 },
    );
    await updatePortal(db, principal, {
      action: 'review',
      id: record.id,
      decision: 'approved',
      note: 'School-approved response',
    });
    assert.equal(
      (await portal(db, parent, day)).requests[0].status,
      'approved',
    );
    assert.equal((await portal(db, parent, day)).history.length, 2);
    await assert.rejects(
      updatePortal(db, principal, {
        action: 'review',
        id: record.id,
        decision: 'declined',
        note: 'Second decision',
      }),
      { status: 409 },
    );
    await updatePortal(db, staff, {
      action: 'submit',
      schoolId: school!.id,
      kind: 'service',
      requestedOn: day,
      message: 'Fictional campus repair',
      requestId: 'staff-request',
    });
    assert.equal((await portal(db, staff, day)).requests.length, 1);
    assert.equal((await portal(db, teacher, day)).requests.length, 0);
    assert.equal((await portal(db, principal, day)).requests.length, 2);
    await updateSetup(db, admin, {
      action: 'staff',
      role: 'parent',
      name: 'Second Guardian',
      username: 'parent.two',
      password,
    });
    const second = await one<Account>(
      db,
      "SELECT a.id,a.name,a.username,p.role FROM account a JOIN portal_profile p ON p.account_id=a.id WHERE username='parent.two'",
    );
    assert.equal((await portal(db, second!, day)).children.length, 0);
    assert.equal((await portal(db, second!, day)).requests.length, 0);
    await assert.rejects(
      updateSetup(db, admin, {
        action: 'school',
        code: 'OTHER',
        name: 'Other fictional campus',
      }),
      { status: 409 },
    );
    // A manually inserted foreign-campus fixture proves the remaining scope checks.
    await run(
      db,
      "INSERT INTO school VALUES ('foreign-campus','OTHER','Foreign fixture')",
    );
    const otherSchool = await one<{ id: string }>(
      db,
      "SELECT id FROM school WHERE code='OTHER'",
    );
    await assert.rejects(
      updatePortal(db, staff, {
        action: 'submit',
        schoolId: otherSchool!.id,
        kind: 'leave',
        requestedOn: day,
        message: 'Outside assignment',
        requestId: 'outside-staff',
      }),
      { status: 404 },
    );
    await updateSetup(db, admin, {
      action: 'staff',
      role: 'principal',
      name: 'Other Principal',
      username: 'principal.other',
      password,
    });
    const otherPrincipal = await one<Account>(
      db,
      "SELECT id,username,name,role FROM account WHERE username='principal.other'",
    );
    await updateSetup(db, admin, {
      action: 'assign',
      accountId: otherPrincipal!.id,
      targetId: otherSchool!.id,
    });
    assert.equal((await portal(db, otherPrincipal!, day)).requests.length, 0);
    await assert.rejects(
      updatePortal(db, otherPrincipal!, {
        action: 'review',
        id: record.id,
        decision: 'approved',
        note: 'Outside school',
      }),
      { status: 404 },
    );
    await updateSetup(db, admin, {
      action: 'link-guardian',
      accountId: parent.id,
      studentId: other!.id,
    });
    assert.equal((await portal(db, parent, day)).children.length, 2);
    await updateSetup(db, admin, {
      action: 'unlink-guardian',
      accountId: parent.id,
      studentId: student!.id,
    });
    const revoked = await portal(db, parent, day);
    assert.equal(revoked.children.length, 1);
    assert.equal(revoked.requests.length, 0);
    assert.equal(revoked.history.length, 0);
    await assert.rejects(updatePortal(db, parent, body), { status: 404 });
    await assert.rejects(
      updateSetup(db, admin, {
        action: 'assign',
        accountId: parent.id,
        targetId: student!.class_id,
      }),
      { status: 400 },
    );
    const handler = createHandler(db, 'http://localhost');
    async function signed(username: string) {
      const response = await handler(
        new Request('http://localhost/api/erp/login', {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ username, password }),
        }),
      );
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie')!.split(';')[0];
    }
    const cookie = await signed('parent');
    for (const endpoint of [
      'fees',
      'admissions',
      'register/' + student!.class_id + '/' + day,
    ]) {
      const response = await handler(
        new Request('http://localhost/api/erp/' + endpoint, {
          headers: { cookie },
        }),
      );
      assert.equal(response.status, 404, endpoint);
    }
    const session = await handler(
      new Request('http://localhost/api/erp/session', { headers: { cookie } }),
    );
    assert.equal(
      ((await session.json()) as { account: Account }).account.role,
      'parent',
    );
    assert.equal(workspacePath('parent'), '/parent-app');
    assert.equal(workspacePath('staff'), '/staff-app');
    assert.equal(workspacePath('teacher'), '/faculty-app');
    assert.equal(workspacePath('administrator'), '/erp');
    assert.equal(workspacePath('principal'), '/principal-app');
    assert.equal(workspacePath('officer'), '/office-app');
    assert.equal(workspacePath('commissioner'), '/erp');

    const staffCookie = await signed('staff');
    assert.equal(
      (
        await handler(
          new Request('http://localhost/api/erp/fees', {
            headers: { cookie: staffCookie },
          }),
        )
      ).status,
      404,
    );
    db.close();
    db = openFileDatabase(path);
    await initializeDatabase(db);
    assert.equal((await portal(db, principal, day)).history.length, 3);
    assert.equal((await portal(db, staff, day)).requests.length, 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
