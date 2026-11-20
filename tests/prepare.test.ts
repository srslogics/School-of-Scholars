import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openFileDatabase, one, run } from '../lib/erp/database';
import { prepareCampus } from '../lib/erp/prepare';
import { createHandler } from '../lib/erp/http';
import { passwordHash } from '../lib/erp/auth';

void test('deployment prepares a fresh database, signs in, and preserves credentials and sessions on restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'scholars-prepare-'));
  const db = openFileDatabase(join(directory, 'school.sqlite'));
  try {
    assert.equal(await prepareCampus(db), 'created');
    const handler = createHandler(db, 'http://localhost');
    const login = await handler(
      new Request('http://localhost/api/erp/login', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ username: 'admin', password: 'sos2026' }),
      }),
    );
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const updated = passwordHash('ChangedSchoolPassword-123');
    await run(
      db,
      "UPDATE account SET password_hash=? WHERE username='admin'",
      updated,
    );
    assert.equal(await prepareCampus(db), 'ready');
    assert.equal(
      (await one<{ password_hash: string }>(
        db,
        "SELECT password_hash FROM account WHERE username='admin'",
      ))!.password_hash,
      updated,
    );
    assert.equal(
      (
        await handler(
          new Request('http://localhost/api/erp/session', {
            headers: { cookie },
          }),
        )
      ).status,
      200,
    );
    assert.equal(
      (await one<{ count: number }>(
        db,
        'SELECT COUNT(*) AS count FROM account',
      ))!.count,
      7,
    );
    await run(
      db,
      "INSERT INTO school VALUES ('unexpected','OTHER','Unexpected school')",
    );
    await assert.rejects(prepareCampus(db), /supports one Katol school/);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

void test('deployment refuses another school database before modifying its schema', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'scholars-wrong-db-'));
  const db = openFileDatabase(join(directory, 'school.sqlite'));
  try {
    await run(db, 'CREATE TABLE school (id TEXT, code TEXT, name TEXT)');
    await run(
      db,
      "INSERT INTO school VALUES ('nmc','NMC-DEMO','Other school')",
    );
    await assert.rejects(prepareCampus(db), /another school installation/);
    assert.equal(
      await one(
        db,
        "SELECT name FROM sqlite_master WHERE type='table' AND name='account'",
      ),
      undefined,
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
