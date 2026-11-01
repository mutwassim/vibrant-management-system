import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env');
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }
  cached.conn = await cached.promise;

  // Auto-seed Super Admin if not exists
  try {
    // Dynamic import to avoid circular dependency before connection
    const { User } = await import('../models');
    const existing = await User.findOne({ role: 'SUPER_ADMIN' });
    if (!existing) {
      const SA_NAME = process.env.SA_NAME || 'Super Admin';
      const SA_EMAIL = process.env.SA_EMAIL || 'superadmin@ams.com';
      const SA_PASS = process.env.SA_PASS || 'SuperAdmin123!';

      await User.create({
        name: SA_NAME,
        email: SA_EMAIL,
        password: SA_PASS,
        role: 'SUPER_ADMIN',
        academyName: 'Platform Admin',
        subscriptionStatus: 'ACTIVE',
        subscriptionPlan: 'ENTERPRISE',
        isActive: true
      });
      console.log(`[Database] Seeded Super Admin account: ${SA_EMAIL}`);
    }
  } catch (err) {
    console.error('[Database] Failed to auto-seed Super Admin:', err);
  }

  return cached.conn;
}

export default dbConnect;
