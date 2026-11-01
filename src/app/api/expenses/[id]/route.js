import { NextResponse } from 'next/server';
import { verifyAuth, hasEnterpriseAccess } from '../../../../lib/auth';
import { Expense } from '../../../../models';

export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    const { user, tenantId } = await verifyAuth(req);
    if (!hasEnterpriseAccess(user)) {
      return NextResponse.json({ error: 'Expenses is an Enterprise feature. Upgrade your plan to use it.' }, { status: 403 });
    }
    const body = await req.json();

    // Scoped to this tenant's own records only - a "$or ownerId: null"
    // fallback here would let this admin edit/delete every academy's
    // orphaned records, not just their own.
    const ownerFilter = tenantId ? { ownerId: tenantId } : {};

    const update = {};
    if ('title' in body) update.title = body.title;
    if ('amount' in body) update.amount = Number(body.amount) || 0;
    if ('category' in body) update.category = body.category;
    if ('date' in body) {
      update.date = body.date;
      update.month = body.date.slice(0, 7);
    }
    if ('description' in body) update.description = body.description;
    if ('method' in body) update.method = body.method;

    const filter = { _id: id, ...ownerFilter };
    const updated = await Expense.findOneAndUpdate(filter, update, { new: true });
    if (!updated) {
      return NextResponse.json({ error: 'Expense not found or access denied.' }, { status: 404 });
    }
    return NextResponse.json({ expense: updated });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    const { user, tenantId } = await verifyAuth(req);
    if (!hasEnterpriseAccess(user)) {
      return NextResponse.json({ error: 'Expenses is an Enterprise feature. Upgrade your plan to use it.' }, { status: 403 });
    }

    const ownerFilter = tenantId ? { ownerId: tenantId } : {};

    const filter = { _id: id, ...ownerFilter };
    const deleted = await Expense.findOneAndDelete(filter);
    if (!deleted) {
      return NextResponse.json({ error: 'Expense not found or access denied.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
