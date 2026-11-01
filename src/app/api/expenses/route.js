import { NextResponse } from 'next/server';
import { verifyAuth, hasEnterpriseAccess } from '../../../lib/auth';
import { Expense } from '../../../models';

export async function POST(req) {
  try {
    const { user, tenantId } = await verifyAuth(req);
    if (!hasEnterpriseAccess(user)) {
      return NextResponse.json({ error: 'Expenses is an Enterprise feature. Upgrade your plan to use it.' }, { status: 403 });
    }
    const body = await req.json();

    const expenseData = { ...body };
    if (tenantId) expenseData.ownerId = tenantId;
    else if (user.role === 'ADMIN') expenseData.ownerId = user._id;

    const expense = new Expense(expenseData);
    await expense.save();
    return NextResponse.json(expense);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
