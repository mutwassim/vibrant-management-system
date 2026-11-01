/**
 * Migration Script — assign all existing records to a default ADMIN account.
 *
 * Run once: node scripts/migrate.js
 *
 * What it does:
 *  1. Creates (or finds) a "default admin" User document.
 *  2. Sets ownerId on every Student, Expense, Stock, StockTransaction, Booking
 *     that has no ownerId yet.
 *
 * Safe to re-run — only touches documents where ownerId is missing.
 */

require('dotenv/config');
const mongoose = require('mongoose');
const readline = require('readline');

// ── User model (inline, so script is self-contained) ─────────────────────────
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name:               { type: String },
  email:              { type: String, unique: true },
  password:           { type: String },
  role:               { type: String, default: 'ADMIN' },
  academyName:        { type: String, default: '' },
  subscriptionStatus: { type: String, default: 'ACTIVE' },
  subscriptionPlan:   { type: String, default: 'PRO' },
  isActive:           { type: Boolean, default: true },
  createdAt:          { type: Date, default: Date.now }
});
UserSchema.pre('save', async function () {

  if (!this.isModified('password')) {
    return;
  }

  this.password =
    await bcrypt.hash(
      this.password,
      12
    );

});

// ── Lean schemas for migration (ownerId field added) ──────────────────────────
const ownerRef = { ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null } };

const StudentMigSchema    = new mongoose.Schema({ __v: Number, ...ownerRef }, { strict: false });
const ExpenseMigSchema    = new mongoose.Schema({ __v: Number, ...ownerRef }, { strict: false });
const StockMigSchema      = new mongoose.Schema({ __v: Number, ...ownerRef }, { strict: false });
const StockTxMigSchema    = new mongoose.Schema({ __v: Number, ...ownerRef }, { strict: false });
const BookingMigSchema    = new mongoose.Schema({ __v: Number, ...ownerRef }, { strict: false });

const User            = mongoose.model('User',             UserSchema);
const StudentMig      = mongoose.model('Student',          StudentMigSchema);
const ExpenseMig      = mongoose.model('Expense',          ExpenseMigSchema);
const StockMig        = mongoose.model('Stock',            StockMigSchema);
const StockTxMig      = mongoose.model('StockTransaction', StockTxMigSchema);
const BookingMig      = mongoose.model('Booking',          BookingMigSchema);

// ── Prompt helper ─────────────────────────────────────────────────────────────
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing in .env');

  await mongoose.connect(uri);
  console.log('✅  Connected to MongoDB');

  // 1. Find or create the default admin
  let defaultAdmin = await User.findOne({ role: 'ADMIN' }).sort({ createdAt: 1 });

  if (!defaultAdmin) {
    console.log('\n⚠️  No ADMIN user found. Creating default admin account.\n');
    const name        = await ask('Default admin name      : ');
    const email       = await ask('Default admin email     : ');
    const password    = await ask('Default admin password  : ');
    const academyName = await ask('Academy name            : ');

    defaultAdmin = await User.create({ name, email, password, academyName, role: 'ADMIN', subscriptionStatus: 'ACTIVE', subscriptionPlan: 'PRO' });
    console.log(`\n✅  Default admin created: ${defaultAdmin.email} (${defaultAdmin._id})\n`);
  } else {
    console.log(`\nℹ️  Using existing admin: ${defaultAdmin.email} (${defaultAdmin._id})\n`);
  }

  const ownerId = defaultAdmin._id;

  // 2. Migrate each collection — only touch docs without ownerId
  const collections = [
    { model: StudentMig,   label: 'Students'          },
    { model: ExpenseMig,   label: 'Expenses'          },
    { model: StockMig,     label: 'Stock'             },
    { model: StockTxMig,   label: 'StockTransactions' },
    { model: BookingMig,   label: 'Bookings'          },
  ];

  for (const { model, label } of collections) {
    const result = await model.updateMany(
      { ownerId: { $in: [null, undefined] } },
      { $set: { ownerId } }
    );
    console.log(`  ${label.padEnd(20)} → ${result.modifiedCount} records updated`);
  }

  // 3. Check if there's already a SUPER_ADMIN; if not, offer to create one
  const existingSA = await User.findOne({ role: 'SUPER_ADMIN' });
  if (!existingSA) {
    console.log('\n⚠️  No SUPER_ADMIN found.');
    const create = await ask('Create a Super Admin now? (y/n): ');
    if (create.toLowerCase() === 'y') {
      const name     = await ask('Super admin name    : ');
      const email    = await ask('Super admin email   : ');
      const password = await ask('Super admin password: ');
      const sa = await User.create({ name, email, password, role: 'SUPER_ADMIN', subscriptionStatus: 'ACTIVE', subscriptionPlan: 'ENTERPRISE', academyName: 'Platform Admin' });
      console.log(`\n✅  Super Admin created: ${sa.email} (${sa._id})`);
    }
  } else {
    console.log(`\nℹ️  Super Admin already exists: ${existingSA.email}`);
  }

  console.log('\n🎉  Migration complete!\n');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});