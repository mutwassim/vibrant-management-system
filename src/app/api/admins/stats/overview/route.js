import { NextResponse } from 'next/server';
import { verifyAuth } from '../../../../../lib/auth';
import { User, Student, Booking } from '../../../../../models';

export async function GET(req) {
  try {
    const { user } = await verifyAuth(req);
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const [
      totalAdmins,
      activeAdmins,
      trialAdmins,
      totalStudents,
      totalBookings,
      revenueAgg,
    ] = await Promise.all([
      User.countDocuments({ role: 'ADMIN' }),
      User.countDocuments({ role: 'ADMIN', subscriptionStatus: 'ACTIVE' }),
      User.countDocuments({ role: 'ADMIN', subscriptionStatus: 'TRIAL' }),
      Student.countDocuments({}),
      Booking.countDocuments({ status: { $ne: 'CANCELLED' } }),
      Booking.aggregate([{ $match: { status: { $ne: 'CANCELLED' } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);

    const totalRevenue = revenueAgg[0]?.total || 0;

    // Per-admin student count (top 10)
    const studentsByAdmin = await Student.aggregate([
      { $group: { _id: '$ownerId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'admin' } },
      { $unwind: { path: '$admin', preserveNullAndEmptyArrays: true } },
      { $project: { count: 1, adminName: '$admin.name', academyName: '$admin.academyName', email: '$admin.email' } }
    ]);

    return NextResponse.json({
      totalAdmins,
      activeAdmins,
      trialAdmins,
      totalStudents,
      totalBookings,
      totalRevenue,
      studentsByAdmin
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
