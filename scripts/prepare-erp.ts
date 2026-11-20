import { configuredDatabase } from '../lib/erp/database';
import { prepareCampus } from '../lib/erp/prepare';
const db = configuredDatabase();
try {
  const status = await prepareCampus(db);
  console.log(
    status === 'created'
      ? 'School of Scholars database initialised. Initial school accounts are ready.'
      : 'School of Scholars database checked. Existing accounts and records retained.',
  );
} finally {
  db.close();
}
