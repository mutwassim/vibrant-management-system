import { NextResponse } from 'next/server';
import { verifyAuth } from '../../../../../lib/auth';
import { Student } from '../../../../../models';

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const { user, tenantId, tenantFilter } = await verifyAuth(req);
    const { fee, feeDate, month, status, method, cashAmount, onlineAmount, amountPaid, notes, readmissionFee, readmissionDate, readmissionStatus, readmissionMethod } = await req.json();

    // Build a filter that handles migrated data (ownerId may be null or unset)
    const ownerFilter = tenantId
      ? { $or: [{ ownerId: tenantId }, { ownerId: null }] }
      : {};
    const existing = await Student.findOne({ _id: id, ...ownerFilter });
    if (!existing) {
      return NextResponse.json({ error: 'Student not found or access denied.' }, { status: 404 });
    }

    // Assign ownerId if missing (fix migrated data on-the-fly)
    if (!existing.ownerId && tenantId) {
      existing.ownerId = tenantId;
    }

    // A PAID payment for a month is locked — reject an attempt to log
    // another payment for the same month instead of creating a duplicate.
    const paidExisting = existing.payments && existing.payments.find(p => p.month === month && p.status === 'PAID');
    if (paidExisting) {
      return NextResponse.json({ error: `Payment for ${month} already exists and is locked. Delete it first if you need to redo it.` }, { status: 409 });
    }

    const pushOps = [];

    const hasExistingPayments = existing.payments && existing.payments.length > 0;
    const alreadySaved = hasExistingPayments && existing.payments.some(p =>
      p.feeDate === existing.feeDate && p.month === existing.month && p.fee === existing.fee
    );
    const sameAsNew = (existing.fee === fee && existing.month === month && existing.feeDate === feeDate);

    if (!hasExistingPayments && !sameAsNew && (existing.fee || existing.feeDate || existing.month)) {
      pushOps.push({
        fee: existing.fee || 0,
        feeDate: existing.feeDate || '',
        month: existing.month || '',
        status: existing.status || 'UNPAID',
        method: 'Cash',
        notes: 'Migrated from previous record'
      });
    }

    pushOps.push({ fee, feeDate, month, status: status || 'PAID', method, cashAmount: cashAmount || 0, onlineAmount: onlineAmount || 0, amountPaid: amountPaid !== undefined ? (amountPaid || 0) : (status === 'PENDING' ? 0 : (Number(fee) || 0)), notes, readmissionFee: readmissionFee || 0, readmissionDate: readmissionDate || '', readmissionStatus: readmissionStatus || 'PAID', readmissionMethod: readmissionMethod || 'Cash',
      installments: ((Number(cashAmount) || 0) > 0 || (Number(onlineAmount) || 0) > 0) ? [{ date: feeDate || '', cashAmount: Number(cashAmount) || 0, onlineAmount: Number(onlineAmount) || 0, amount: (Number(cashAmount) || 0) + (Number(onlineAmount) || 0), method }] : []
    });

    const setFields = { fee, feeDate, month, status: status || 'PAID' };
    if (tenantId && !existing.ownerId) setFields.ownerId = tenantId;

    const student = await Student.findByIdAndUpdate(
      id,
      { $push: { payments: { $each: pushOps } }, $set: setFields },
      { returnDocument: 'after' }
    );

    return NextResponse.json(student);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}