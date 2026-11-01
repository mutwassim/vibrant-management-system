import { NextResponse } from 'next/server';
import { verifyAuth } from '../../../lib/auth';
import { User } from '../../../models';

export async function GET(req) {
  try {
    const { user } = await verifyAuth(req);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const filter = { role: 'ADMIN' };
    if (status) filter.subscriptionStatus = status;
    if (search) {
      filter.$or = [
        { name:        { $regex: search, $options: 'i' } },
        { email:       { $regex: search, $options: 'i' } },
        { academyName: { $regex: search, $options: 'i' } },
      ];
    }

    const admins = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 });

    return NextResponse.json(admins);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { user: requester } = await verifyAuth(req);
    if (requester.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { name, email, password, academyName, subscriptionPlan, subscriptionStatus } = await req.json();
    if (!name || !email || !password) {
      return NextResponse.json({ error: 'name, email, and password are required.' }, { status: 400 });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered.' }, { status: 409 });
    }

    const admin = await User.create({
      name, email, password,
      academyName: academyName || '',
      role: 'ADMIN',
      subscriptionPlan: subscriptionPlan || 'FREE',
      subscriptionStatus: subscriptionStatus || 'TRIAL',
      createdBy: requester._id
    });

    return NextResponse.json(admin.toJSON(), { status: 201 });
  } catch (err) {
    if (err.code === 11000) {
      return NextResponse.json({ error: 'Email already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
