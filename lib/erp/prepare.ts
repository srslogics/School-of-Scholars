import { initializeDatabase, one, type Database } from './database';
import { bootstrapCampus, initialCampusPassword } from './campus';

export async function prepareCampus(db: Database) {
  const table = await one(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='school'",
  );
  if (table) {
    const school = await one(db, 'SELECT id FROM school LIMIT 1');
    if (
      school &&
      !(await one(db, "SELECT id FROM school WHERE code='SOS-KATOL'"))
    )
      throw new Error(
        'This database belongs to another school installation. Configure the dedicated School of Scholars database.',
      );
  }
  await initializeDatabase(db);
  if (!(await one(db, 'SELECT id FROM account LIMIT 1'))) {
    await bootstrapCampus(db, () => initialCampusPassword);
    return 'created';
  }
  if (!(await one(db, "SELECT id FROM school WHERE code='SOS-KATOL'")))
    throw new Error(
      'Accounts exist without the Katol campus. Restore the correct database configuration.',
    );
  return 'ready';
}
