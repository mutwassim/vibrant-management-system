import { NextResponse } from 'next/server';
import { verifyAuth, hasEnterpriseAccess } from '../../../lib/auth';
import { Stock, StockTransaction } from '../../../models';

export async function POST(req) {
  try {
    const { user, tenantId } = await verifyAuth(req);
    if (!hasEnterpriseAccess(user)) {
      return NextResponse.json({ error: 'Stock / Inventory is an Enterprise feature. Upgrade your plan to use it.' }, { status: 403 });
    }
    const body = await req.json();

    const stockData = { ...body };
    if (tenantId) stockData.ownerId = tenantId;
    else if (user.role === 'ADMIN') stockData.ownerId = user._id;

    const stock = new Stock(stockData);
    await stock.save();

    const qty = stock.qty || 0;
    const unitCost = stock.unitCost || 0;
    if (qty > 0 && unitCost >= 0) {
      const txData = {
        item: stock.item, 
        stockId: stock._id.toString(), 
        category: stock.category,
        type: 'PURCHASE', 
        qty, 
        unitPrice: unitCost, 
        amount: qty * unitCost,
        cash: -(qty * unitCost),
        date: new Date().toISOString().slice(0, 10),
        notes: 'New stock item added'
      };
      if (tenantId) txData.ownerId = tenantId;
      else if (user.role === 'ADMIN') txData.ownerId = user._id;

      await new StockTransaction(txData).save();
    }

    return NextResponse.json(stock);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
