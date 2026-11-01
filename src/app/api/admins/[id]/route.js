import { NextResponse } from 'next/server';
import { verifyAuth } from '../../../../lib/auth';
import { User } from '../../../../models';

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const { user } = await verifyAuth(req);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const admin = await User.findById(id).select('-password');
    if (!admin || admin.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin not found.' }, { status: 404 });
    }
    return NextResponse.json(admin);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    const { user } = await verifyAuth(req);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { name, academyName, subscriptionPlan, subscriptionStatus, isActive } = await req.json();
    const update = {};
    if (name !== undefined)               update.name = name;
    if (academyName !== undefined)        update.academyName = academyName;
    if (subscriptionPlan !== undefined)   update.subscriptionPlan = subscriptionPlan;
    if (subscriptionStatus !== undefined) update.subscriptionStatus = subscriptionStatus;
    if (isActive !== undefined)           update.isActive = isActive;

    const admin = await User.findOneAndUpdate(
      { _id: id, role: 'ADMIN' },
      update,
      { new: true }
    ).select('-password');

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found.' }, { status: 404 });
    }
    return NextResponse.json(admin);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    const { user } = await verifyAuth(req);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const admin = await User.findOneAndDelete({ _id: id, role: 'ADMIN' });
    if (!admin) {
      return NextResponse.json({ error: 'Admin not found.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Admin "${admin.name}" deleted. Their data records are now orphaned — run cleanup if needed.`
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
