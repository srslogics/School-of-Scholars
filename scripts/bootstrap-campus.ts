import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  configuredDatabase,
  initializeDatabase,
  one,
} from '../lib/erp/database';
import {
  bootstrapCampus,
  campusAccounts,
  initialCampusPassword,
} from '../lib/erp/campus';

const sample = process.argv.includes('--with-samples');
if (sample && (process.env.TURSO_DATABASE_URL || process.env.RENDER === 'true'))
  throw new Error('Sample data is restricted to a local development database.');
const db = configuredDatabase();
try {
  await initializeDatabase(db);
  if (
    (await one(db, 'SELECT id FROM account LIMIT 1')) ||
    (await one(db, 'SELECT id FROM school LIMIT 1'))
  )
    throw new Error(
      'Database is already configured. Use existing credentials.',
    );
  const file = resolve(
    process.env.ERP_ACCOUNTS_FILE ||
      (process.env.TURSO_DATABASE_URL
        ? '.erp-data/campus.accounts.json'
        : process.env.ERP_DB_PATH + '.accounts.json'),
  );
  const accounts = campusAccounts.map(([username, , role]) => ({
    username,
    role,
    password: initialCampusPassword,
  }));
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(accounts, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  await bootstrapCampus(
    db,
    (username) => accounts.find((a) => a.username === username)!.password,
    sample,
  );
  console.log('Campus configured. Private credentials:', file);
} finally {
  db.close();
}
