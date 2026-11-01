/**
 * cleanup-orphaned-data.js
 *
 * Deletes Student / Booking / Expense / Stock / StockTransaction records
 * whose `ownerId` no longer matches any existing User (i.e. the admin who
 * owned them was deleted).
 *
 * SAFE BY DEFAULT: runs as a DRY RUN unless you pass --confirm.
 * A dry run only PRINTS what it would delete — it makes zero writes.
 *
 * It NEVER touches records whose ownerId matches a User that still exists,
 * regardless of that user's isActive / subscriptionStatus (active, trial,
 * pending approval, or manually disabled admins are all "still exist" —
 * their data is always safe).
 *
 * Usage:
 *   node scripts/cleanup-orphaned-data.js            # dry run, just reports
 *   node scripts/cleanup-orphaned-data.js --confirm  # actually deletes
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { User, Student, Expense, Stock, StockTransaction, Booking } = require('../src/models');

const CONFIRM = process.argv.includes('--confirm');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected. Mode: ${CONFIRM ? 'LIVE DELETE' : 'DRY RUN (no changes will be made)'}\n`);

  // Every ownerId that currently belongs to a real, existing User.
  const existingUserIds = new Set(
    (await User.find({}, '_id')).map(u => u._id.toString())
  );

  const collections = [
    { name: 'Student', model: Student },
    { name: 'Booking', model: Booking },
    { name: 'Expense', model: Expense },
    { name: 'Stock', model: Stock },
    { name: 'StockTransaction', model: StockTransaction },
  ];

  let grandTotal = 0;

  for (const { name, model } of collections) {
    // Pull only ownerId so this stays cheap even on large collections.
    const docs = await model.find({}, '_id ownerId');
    const orphanIds = docs
      .filter(d => !d.ownerId || !existingUserIds.has(d.ownerId.toString()))
      .map(d => d._id);

    const nullOwner = docs.filter(d => !d.ownerId).length;
    const staleOwner = orphanIds.length - nullOwner;
    console.log(`${name}: ${orphanIds.length} orphaned record(s) out of ${docs.length} total. (ownerId was null: ${nullOwner}, ownerId pointed to a since-deleted admin: ${staleOwner})`);
    grandTotal += orphanIds.length;

    if (orphanIds.length && CONFIRM) {
      const res = await model.deleteMany({ _id: { $in: orphanIds } });
      console.log(`  -> deleted ${res.deletedCount} from ${name}.`);
    }
  }

  console.log(`\nTotal orphaned records ${CONFIRM ? 'deleted' : 'found'}: ${grandTotal}`);
  if (!CONFIRM) {
    console.log('This was a DRY RUN. Review the counts above, then re-run with --confirm to actually delete.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
