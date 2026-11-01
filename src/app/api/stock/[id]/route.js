import { NextResponse } from 'next/server';
import { verifyAuth, hasEnterpriseAccess } from '../../../../lib/auth';
import { Stock, StockTransaction } from '../../../../models';

function buildOwnerFilter(tenantId) {
  // Scoped strictly to this tenant - no null-ownerId fallback, which
  // previously let any admin match (and edit/delete) another academy's
  // orphaned records.
  if (!tenantId) return {};
  return { ownerId: tenantId };
}

export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    const { user, tenantId } = await verifyAuth(req);
    if (!hasEnterpriseAccess(user)) {
      return NextResponse.json({ error: 'Stock / Inventory is an Enterprise feature. Upgrade your plan to use it.' }, { status: 403 });
    }
    const body = await req.json();

    const ownerFilter = buildOwnerFilter(tenantId);
    const existing = await Stock.findOne({ _id: id, ...ownerFilter });
    if (!existing) {
      return NextResponse.json({ error: 'Stock item not found or access denied.' }, { status: 404 });
    }

    // Auto-assign ownerId to migrated data
    if (tenantId && !existing.ownerId) body.ownerId = tenantId;

    const stock = await Stock.findByIdAndUpdate(id, body, { returnDocument: 'after' });

    if (body.qty !== undefined) {
      const delta = (body.qty || 0) - (existing.qty || 0);
      const unitCost = (body.unitCost !== undefined ? body.unitCost : existing.unitCost) || 0;
      const today = new Date().toISOString().slice(0, 10);

      if (delta !== 0) {
        const amount = delta * unitCost;
        const effectiveTenantId = tenantId || (user.role === 'ADMIN' ? user._id : null);

        const txData = {
          item: stock.item, 
          stockId: stock._id.toString(), 
          category: stock.category,
          type: 'PURCHASE', 
          qty: delta, 
          unitPrice: unitCost, 
          amount: amount,
          cash: -amount,
          date: today, 
          notes: delta > 0 ? `Manual restock (+${delta} units)` : `Manual reduction (${delta} units)`
        };
        if (effectiveTenantId) txData.ownerId = effectiveTenantId;
        await new StockTransaction(txData).save();
      }
    }

    return NextResponse.json(stock);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    const { user, tenantId } = await verifyAuth(req);
    if (!hasEnterpriseAccess(user)) {
      return NextResponse.json({ error: 'Stock / Inventory is an Enterprise feature. Upgrade your plan to use it.' }, { status: 403 });
    }

    const ownerFilter = buildOwnerFilter(tenantId);
    const existing = await Stock.findOne({ _id: id, ...ownerFilter });
    if (!existing) {
      return NextResponse.json({ error: 'Stock item not found or access denied.' }, { status: 404 });
    }

    const effectiveTenantId = tenantId || (user.role === 'ADMIN' ? user._id : null);

    if ((existing.qty || 0) > 0) {
      const txData = {
        item: existing.item, 
        stockId: existing._id.toString(), 
        category: existing.category,
        type: 'REMOVE', 
        qty: existing.qty || 0, 
        unitPrice: existing.unitCost || 0,
        amount: (existing.qty || 0) * (existing.unitCost || 0),
        cash: 0,
        date: new Date().toISOString().slice(0, 10),
        notes: 'Item removed from inventory'
      };
      if (effectiveTenantId) txData.ownerId = effectiveTenantId;
      await new StockTransaction(txData).save();
    }

    await Stock.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
