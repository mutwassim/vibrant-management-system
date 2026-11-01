import { NextResponse } from 'next/server';
import { verifyAuth, hasEnterpriseAccess } from '../../../../lib/auth';
import { Stock, StockTransaction } from '../../../../models';

export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    const { user, tenantId } = await verifyAuth(req);
    if (!hasEnterpriseAccess(user)) {
      return NextResponse.json({ error: 'Stock / Inventory is an Enterprise feature. Upgrade your plan to use it.' }, { status: 403 });
    }

    // Scoped strictly to this tenant - no null-ownerId fallback.
    const ownerFilter = tenantId ? { ownerId: tenantId } : {};

    const filter = { _id: id, ...ownerFilter };
    const deleted = await StockTransaction.findOneAndDelete(filter);
    if (!deleted) {
      return NextResponse.json({ error: 'Transaction not found or access denied.' }, { status: 404 });
    }

    const stockOwnerFilter = tenantId ? { ownerId: tenantId } : {};

    if (deleted.type === 'SALE' && deleted.stockId) {
      const stockItem = await Stock.findOne({ _id: deleted.stockId, ...stockOwnerFilter });
      if (stockItem) {
        const restoredQty = (stockItem.qty || 0) + (deleted.qty || 0);
        await Stock.findByIdAndUpdate(deleted.stockId, { qty: restoredQty });
      }
    }

    if (deleted.type === 'PURCHASE' && deleted.stockId) {
      const stockItem = await Stock.findOne({ _id: deleted.stockId, ...stockOwnerFilter });
      if (stockItem) {
        const restoredQty = Math.max(0, (stockItem.qty || 0) - (deleted.qty || 0));
        await Stock.findByIdAndUpdate(deleted.stockId, { qty: restoredQty });
      }
    }

    if (deleted.type === 'ADJUST' && deleted.stockId) {
      const stockItem = await Stock.findOne({ _id: deleted.stockId, ...stockOwnerFilter });
      if (stockItem) {
        const restoredQty = Math.max(0, (stockItem.qty || 0) - (deleted.qty || 0));
        await Stock.findByIdAndUpdate(deleted.stockId, { qty: restoredQty });
      }
    }

    return NextResponse.json({ success: true, restored: deleted.type === 'SALE' ? deleted.qty : 0 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
