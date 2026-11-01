import { NextResponse } from 'next/server';
import { verifyAuth } from '../../../../../lib/auth';
import { User } from '../../../../../models';

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const { user } = await verifyAuth(req);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { newPassword } = await req.json();
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'newPassword must be at least 6 characters.' }, { status: 400 });
    }

    const admin = await User.findOne({ _id: id, role: 'ADMIN' });
    if (!admin) {
      return NextResponse.json({ error: 'Admin not found.' }, { status: 404 });
    }

    admin.password = newPassword; // hashed by pre-save
    await admin.save();
    return NextResponse.json({ success: true, message: `Password reset for ${admin.email}.` });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
