import { NextResponse } from 'next/server';
import { verifyAuth, hasEnterpriseAccess } from '../../../../../lib/auth';
import { Stock, StockTransaction } from '../../../../../models';

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const { user, tenantId, tenantFilter } = await verifyAuth(req);
    if (!hasEnterpriseAccess(user)) {
      return NextResponse.json({ error: 'Stock / Inventory is an Enterprise feature. Upgrade your plan to use it.' }, { status: 403 });
    }
    const { qty, salePrice, date, notes } = await req.json();

    const sellQty = parseInt(qty) || 0;
    const price = parseFloat(salePrice) || 0;

    // Scoped strictly to this tenant - no null-ownerId fallback.
    const ownerFilter = tenantId ? { ownerId: tenantId } : {};

    const existing = await Stock.findOne({ _id: id, ...ownerFilter });
    if (!existing) {
      return NextResponse.json({ error: 'Stock item not found or access denied.' }, { status: 404 });
    }
    if (sellQty <= 0) {
      return NextResponse.json({ error: 'Sale quantity must be greater than 0.' }, { status: 400 });
    }
    if (sellQty > (existing.qty || 0)) {
      return NextResponse.json({ error: 'Not enough stock available.' }, { status: 400 });
    }

    const newQty = (existing.qty || 0) - sellQty;
    const updateFields = { qty: newQty };
    if (tenantId && !existing.ownerId) updateFields.ownerId = tenantId;
    const stock = await Stock.findByIdAndUpdate(id, updateFields, { returnDocument: 'after' });

    const txData = {
      item: existing.item, 
      stockId: existing._id.toString(), 
      category: existing.category,
      type: 'SALE', 
      qty: sellQty, 
      unitPrice: price, 
      amount: sellQty * price,
      cash: sellQty * price,
      date: date || new Date().toISOString().slice(0, 10),
      notes: notes || ''
    };
    if (tenantId) txData.ownerId = tenantId;
    else if (user.role === 'ADMIN') txData.ownerId = user._id;

    const txn = await new StockTransaction(txData).save();

    return NextResponse.json({ stock, transaction: txn });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
