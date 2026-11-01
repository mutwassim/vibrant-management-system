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
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required.' }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }
    const valid = await user.comparePassword(password);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    // Checked after password so we don't leak account-status info to someone
    // who doesn't even have the right password. Blocking here (before the
    // token is signed) means an unapproved/deactivated user never holds a
    // valid JWT, unlike checking isActive only inside verifyAuth().
    if (!user.isActive) {
      return NextResponse.json({ error: 'Your account is under review. Please wait for Super Admin approval.' }, { status: 403 });
    }

    // Update lastLogin
    user.lastLogin = new Date();
    await user.save();

    const token = signToken(user);
    return NextResponse.json({ token, user: user.toJSON() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
