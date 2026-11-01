import { NextResponse } from 'next/server';
import { verifyAuth, hasEnterpriseAccess } from '../../../lib/auth';
import { Student, Expense, Stock, StockTransaction, Booking } from '../../../models';

export async function GET(req) {
  try {
    const { user, tenantId, tenantFilter } = await verifyAuth(req);

    // Scoped strictly to this tenant's own ownerId now. The previous
    // "$or ownerId: null" fallback made every record with a missing owner
    // (e.g. from a buggy import, or an accidental null ownerId) visible to
    // EVERY admin on the platform, not just one - a cross-tenant data leak.
    // If you still have legitimate migrated records with ownerId: null that
    // a specific admin should own, reassign their ownerId explicitly rather
    // than relying on this filter to surface them.
    const dataFilter = tenantId ? { ownerId: tenantId } : tenantFilter;

    const enterprise = hasEnterpriseAccess(user);

    // Students (and Attendance, which is just a filtered view of Students on
    // the frontend, not its own collection) are available on every plan.
    // Expenses, Stock/Inventory, and Ground Bookings require ENTERPRISE.
    const [students, expenses, stock, stockTransactions, bookings] = await Promise.all([
      Student.find(dataFilter).sort({ _id: -1 }),
      enterprise ? Expense.find(dataFilter) : Promise.resolve([]),
      enterprise ? Stock.find(dataFilter) : Promise.resolve([]),
      enterprise ? StockTransaction.find(dataFilter).sort({ createdAt: 1 }) : Promise.resolve([]),
      enterprise ? Booking.find(dataFilter).sort({ date: 1, startTime: 1 }) : Promise.resolve([]),
    ]);

    return NextResponse.json({ students, expenses, stock, stockTransactions, bookings, subscriptionPlan: user.subscriptionPlan, hasEnterpriseAccess: enterprise });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
