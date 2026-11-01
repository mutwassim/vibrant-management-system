import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '../../../../lib/db';
import { User } from '../../../../models';

function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export async function POST(req) {
  try {
    await dbConnect();
    const { name, email, password, academyName, role } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'name, email and password are required.' }, { status: 400 });
    }

    // Only allow SUPER_ADMIN role creation if request is from an authenticated super admin
    let assignedRole = 'ADMIN';
    if (role === 'SUPER_ADMIN') {
      const authHeader = req.headers.get('authorization') || '';
      if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Only a Super Admin can create another Super Admin.' }, { status: 403 });
      }
      try {
        const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        const requester = await User.findById(payload.id);
        if (!requester || requester.role !== 'SUPER_ADMIN') {
          return NextResponse.json({ error: 'Only a Super Admin can create another Super Admin.' }, { status: 403 });
        }
        assignedRole = 'SUPER_ADMIN';
      } catch {
        return NextResponse.json({ error: 'Invalid token for Super Admin creation.' }, { status: 403 });
      }
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered.' }, { status: 409 });
    }

    const user = await User.create({
      name, email, password,
      academyName: academyName || '',
      role: assignedRole,
      subscriptionStatus: 'TRIAL',
      // Self-registered ADMIN accounts start inactive and need Super Admin
      // approval before they can log in. A SUPER_ADMIN created directly by
      // another SUPER_ADMIN (assignedRole check above) is active immediately.
      isActive: assignedRole === 'SUPER_ADMIN'
    });

    // No token on register — the account is pending approval, so we don't
    // want an unapproved user holding a valid JWT. They log in separately
    // once a Super Admin approves them.
    return NextResponse.json({
      message: 'Registration successful. Your account is under review. You will be able to log in once a Super Admin approves your account.'
    }, { status: 201 });
  } catch (err) {
    if (err.code === 11000) {
      return NextResponse.json({ error: 'Email already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
