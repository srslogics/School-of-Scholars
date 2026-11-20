import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { configuredDatabase, many, one, run, write } from '../lib/erp/database';
import { passwordHash } from '../lib/erp/auth';
import { initialCampusPassword } from '../lib/erp/campus';

const db = configuredDatabase();
try {
  if (!(await one(db, "SELECT id FROM school WHERE code = 'SOS-KATOL'")))
    throw new Error(
      'Password reset requires the dedicated School of Scholars database.',
    );
  const accounts = await many<{ id: string; username: string }>(
    db,
    'SELECT id,username FROM account',
  );
  const hashes = accounts.map((account) => ({
    ...account,
    hash: passwordHash(initialCampusPassword),
  }));
  await write(db, async (tx) => {
    if (!(await one(tx, "SELECT id FROM school WHERE code = 'SOS-KATOL'")))
      throw new Error('School of Scholars campus is not configured.');
    for (const account of hashes)
      await run(
        tx,
        'UPDATE account SET password_hash = ? WHERE id = ?',
        account.hash,
        account.id,
      );
    await run(tx, 'DELETE FROM session');
    await run(tx, 'DELETE FROM login_limit');
  });
  const file = resolve(
    process.env.ERP_ACCOUNTS_FILE ||
      (process.env.TURSO_DATABASE_URL
        ? '.erp-data/campus.accounts.json'
        : process.env.ERP_DB_PATH + '.accounts.json'),
  );
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8')) as {
      username: string;
      password: string;
    }[];
    for (const account of saved)
      if (accounts.some((row) => row.username === account.username))
        account.password = initialCampusPassword;
    writeFileSync(file + '.tmp', JSON.stringify(saved, null, 2) + '\n', {
      mode: 0o600,
    });
    renameSync(file + '.tmp', file);
  }
  console.log(
    'School account passwords reset. Existing sessions have been signed out.',
  );
} finally {
  db.close();
}
