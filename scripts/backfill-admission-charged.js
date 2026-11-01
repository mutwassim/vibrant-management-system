/**
 * Backfill Script — fix admission fee re-appearing on every old student's slip.
 *
 * Why this is needed:
 *  The new `admissionFeeCharged` flag defaults to false for every student,
 *  including students who joined and paid their admission fee long ago
 *  (before this flag existed). Since the flag was never set true for them,
 *  the app treated their admission fee as "not yet shown" and started
 *  printing it again on every new month's receipt.
 *
 * What this script does:
 *  For every student who has admissionFeeStatus = 'PAID' and already has at
 *  least one payment recorded in their history, it marks
 *  admissionFeeCharged = true — because if they already have a payment on
 *  record, their admission fee was clearly already receipted before now.
 *
 *  Students with a PAID admission fee but ZERO payments yet (a fresh joiner
 *  who only paid admission so far, no monthly fee recorded) are left alone,
 *  so their very first monthly-fee receipt still correctly shows the
 *  admission fee once.
 *
 * Run once: node scripts/backfill-admission-charged.js
 * Safe to re-run — only ever sets the flag to true, never to false.
 */

require('dotenv/config');
const mongoose = require('mongoose');

const StudentMigSchema = new mongoose.Schema({ __v: Number }, { strict: false });
const StudentMig = mongoose.model('Student', StudentMigSchema);

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing in .env');

  await mongoose.connect(uri);
  console.log('✅  Connected to MongoDB');

  const result = await StudentMig.updateMany(
    {
      admissionFeeStatus: 'PAID',
      admissionFee: { $gt: 0 },
      admissionFeeCharged: { $ne: true },
      $expr: { $gt: [{ $size: { $ifNull: ['$payments', []] } }, 0] }
    },
    { $set: { admissionFeeCharged: true } }
  );

  console.log(`\n🎉  Done — ${result.modifiedCount} student(s) fixed.`);
  console.log('    Their admission fee will no longer repeat on future receipts.\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
