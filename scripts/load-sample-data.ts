import {
  configuredDatabase,
  initializeDatabase,
  one,
} from '../lib/erp/database';
import { loadSampleData } from '../lib/erp/sample-data';
import type { Account } from '../lib/erp/model';
const db = configuredDatabase();
try {
  await initializeDatabase(db);
  const admin = await one<Account>(
    db,
    "SELECT id,username,name,role FROM account WHERE role='administrator' ORDER BY username LIMIT 1",
  );
  if (!admin) throw new Error('Initialise the school first.');
  const result = await loadSampleData(db, admin);
  console.log(
    result.alreadyLoaded
      ? 'Sample dataset already loaded on ' + result.loadedOn
      : 'Connected fictional dataset loaded for ' + result.loadedOn,
  );
} finally {
  db.close();
}
