import { NextResponse } from 'next/server';
import { verifyAuth } from '../../../../../../lib/auth';
import { Student } from '../../../../../../models';

function buildOwnerFilter(tenantId) {
  if (!tenantId) return {};
  return { $or: [{ ownerId: tenantId }, { ownerId: null }] };
}

export async function PUT(req, { params }) {
  try {
    const { id, paymentId } = await params;
    const { tenantId } = await verifyAuth(req);
    const body = await req.json();
    const updateFields = {};
    if (body.fee !== undefined) updateFields['payments.$.fee'] = body.fee;
    if (body.feeDate !== undefined) updateFields['payments.$.feeDate'] = body.feeDate;
    if (body.month !== undefined) updateFields['payments.$.month'] = body.month;
    if (body.status !== undefined) updateFields['payments.$.status'] = body.status;
    if (body.method !== undefined) updateFields['payments.$.method'] = body.method;
    if (body.cashAmount !== undefined) updateFields['payments.$.cashAmount'] = body.cashAmount;
    if (body.onlineAmount !== undefined) updateFields['payments.$.onlineAmount'] = body.onlineAmount;
    if (body.amountPaid !== undefined) updateFields['payments.$.amountPaid'] = body.amountPaid;
    if (body.notes !== undefined) updateFields['payments.$.notes'] = body.notes;
    if (body.readmissionFee !== undefined) updateFields['payments.$.readmissionFee'] = body.readmissionFee;
    if (body.readmissionDate !== undefined) updateFields['payments.$.readmissionDate'] = body.readmissionDate;
    if (body.readmissionStatus !== undefined) updateFields['payments.$.readmissionStatus'] = body.readmissionStatus;
    if (body.readmissionMethod !== undefined) updateFields['payments.$.readmissionMethod'] = body.readmissionMethod;

    const ownerFilter = buildOwnerFilter(tenantId);

    // Record this transaction as one more installment on top of whatever
    // was already logged for this month, rather than only keeping the
    // latest running total — this is what lets the receipt later show
    // "Rs 2,000 cash, then Rs 1,000 online, then Rs 1,000 online" instead
    // of just the final combined numbers.
    const updateOps = { $set: updateFields };
    if (body.newCashAmount || body.newOnlineAmount) {
      updateOps.$push = {
        'payments.$.installments': {
          date: body.feeDate || '',
          cashAmount: Number(body.newCashAmount) || 0,
          onlineAmount: Number(body.newOnlineAmount) || 0,
          amount: (Number(body.newCashAmount) || 0) + (Number(body.newOnlineAmount) || 0),
          method: body.method || 'Cash'
        }
      };
    }

    const student = await Student.findOneAndUpdate(
      { _id: id, 'payments._id': paymentId, ...ownerFilter },
      updateOps,
      { returnDocument: 'after' }
    );

    if (!student) {
      return NextResponse.json({ error: 'Student/payment not found or access denied.' }, { status: 404 });
    }

    const updated = student.payments.find(p => p._id.toString() === paymentId);
    if (updated) {
      // Always resync top-level fields from the chronologically LATEST
      // payment (by month), not necessarily the one just edited. Editing
      // an older month's record should not overwrite the student's
      // current/most-recent status.
      const latest = [...student.payments]
        .filter(p => p.month)
        .sort((a, b) => a.month.localeCompare(b.month))
        .pop() || updated;
      student.fee = latest.fee;
      student.feeDate = latest.feeDate;
      student.month = latest.month;
      student.status = latest.status;
      if (tenantId && !student.ownerId) student.ownerId = tenantId;
      await student.save();
    }
    return NextResponse.json(student);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id, paymentId } = await params;
    const { tenantId } = await verifyAuth(req);
    
    const ownerFilter = buildOwnerFilter(tenantId);
    const student = await Student.findOneAndUpdate(
      { _id: id, ...ownerFilter },
      { $pull: { payments: { _id: paymentId } } },
      { returnDocument: 'after' }
    );
    if (!student) {
      return NextResponse.json({ error: 'Student not found or access denied.' }, { status: 404 });
    }

    if (student.payments.length > 0) {
      // Resync from the chronologically latest remaining payment (by month),
      // not just the last element in the array.
      const latest = [...student.payments]
        .filter(p => p.month)
        .sort((a, b) => a.month.localeCompare(b.month))
        .pop() || student.payments[student.payments.length - 1];
      student.fee = latest.fee; 
      student.feeDate = latest.feeDate;
      student.month = latest.month; 
      student.status = latest.status;
    } else {
      student.fee = 0; 
      student.feeDate = ''; 
      student.month = ''; 
      student.status = 'UNPAID';
    }
    if (tenantId && !student.ownerId) student.ownerId = tenantId;
    await student.save();
    return NextResponse.json(student);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}