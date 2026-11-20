import { configuredDatabase, initializeDatabase } from '../lib/erp/database';
const db = configuredDatabase();
try {
  await initializeDatabase(db);
  console.log('School ERP schema is current.');
} finally {
  db.close();
}
