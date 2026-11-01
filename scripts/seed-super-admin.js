/**
 * seed-super-admin.js
 * Quick one-shot script to create a SUPER_ADMIN account.
 * 
 * Usage:
 *   SA_NAME="Your Name" SA_EMAIL="you@example.com" SA_PASS="YourPassword" node scripts/seed-super-admin.js
 * 
 * Or edit the defaults below and just run: node scripts/seed-super-admin.js
 */

require('dotenv/config');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const { SA_NAME  = 'Super Admin',
        SA_EMAIL = 'superadmin@ams.com',
        SA_PASS  = 'SuperAdmin123!' } = process.env;

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Dynamically register User model (avoids re-registration if run after server.js)
  let User;
  try {
    User = mongoose.model('User');
  } catch {
    const bcrypt = require('bcryptjs');
    const schema = new mongoose.Schema({
      name: String, email: { type: String, unique: true }, password: String,
      role: { type: String, default: 'SUPER_ADMIN' }, academyName: { type: String, default: 'Platform Admin' },
      subscriptionStatus: { type: String, default: 'ACTIVE' }, subscriptionPlan: { type: String, default: 'ENTERPRISE' },
      isActive: { type: Boolean, default: true }, createdAt: { type: Date, default: Date.now }
    });
    schema.pre('save', async function(next) {
      if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
      next();
    });
    User = mongoose.model('User', schema);
  }

  const existing = await User.findOne({ email: SA_EMAIL });
  if (existing) {
    console.log(`Super Admin already exists: ${SA_EMAIL}`);
    await mongoose.disconnect();
    return;
  }

  const sa = new User({ name: SA_NAME, email: SA_EMAIL, password: SA_PASS, role: 'SUPER_ADMIN' });
  await sa.save();
  console.log(`✅ Super Admin created: ${SA_EMAIL}`);
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });