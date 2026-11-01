import { NextResponse } from 'next/server';
import { verifyAuth } from '../../../lib/auth';
import { Student } from '../../../models';
import { normalizePhone, phoneError } from '../../../lib/phone';

export async function POST(req) {
  try {
    const { user, tenantId } = await verifyAuth(req);
    const body = await req.json();

    const studentData = { ...body };

    // Contact 1 is mandatory, contact 2 is optional — both must be real numbers.
    const contactErr = phoneError(body.contact, { required: true, label: 'Contact number' });
    if (contactErr) return NextResponse.json({ error: contactErr }, { status: 400 });
    const contact2Err = phoneError(body.contact2, { label: 'Contact number 2' });
    if (contact2Err) return NextResponse.json({ error: contact2Err }, { status: 400 });
    studentData.contact = normalizePhone(body.contact);
    studentData.contact2 = normalizePhone(body.contact2);

    // Admission fee is optional, but a real amount needs a date to sit on,
    // otherwise it can never be matched by the dashboard's month filter.
    const admissionFee = Number(body.admissionFee) || 0;
    if (admissionFee < 0) {
      return NextResponse.json({ error: 'Admission fee cannot be negative.' }, { status: 400 });
    }
    studentData.admissionFee = admissionFee;
    studentData.admissionFeeStatus = admissionFee > 0 ? (body.admissionFeeStatus || 'PAID') : 'UNPAID';
    studentData.admissionDate = admissionFee > 0
      ? (body.admissionDate || new Date().toISOString().slice(0, 10))
      : '';
    studentData.admissionMethod = body.admissionMethod || 'Cash';

    if (tenantId) studentData.ownerId = tenantId;
    else if (user.role === 'ADMIN') studentData.ownerId = user._id;

    // Initialize payment history with the initial month entry (whether PAID or UNPAID)
    if (studentData.month) {
      const cashAmount = Number(body.cashAmount) || 0;
      const onlineAmount = Number(body.onlineAmount) || 0;
      // Trust the frontend's method flag first: it already knows the split
      // toggle was checked. Recomputing isSplit from amounts alone (the old
      // behavior) silently downgraded a real split entry back to "Cash"
      // whenever the online box was left blank (e.g. Rs 3,000 cash / 0
      // online) — so the record lost the fact that it was ever split.
      const isSplit = body.method === 'Split (Cash+Online)' || (cashAmount > 0 && onlineAmount > 0);
      const fee = Number(studentData.fee) || 0;
      // amountPaid: how much was actually received at signup. If the admin
      // only received part of the fee (a "half payment"), status is forced
      // to PENDING regardless of what was picked in the dropdown, so it
      // matches how much money has actually come in.
      let amountPaid = body.amountPaid !== undefined && body.amountPaid !== '' ? (Number(body.amountPaid) || 0) : (studentData.status === 'PAID' ? fee : 0);
      let initialStatus = studentData.status || 'UNPAID';
      if (amountPaid > 0 && amountPaid < fee) initialStatus = 'PENDING';
      else if (fee > 0 && amountPaid >= fee) initialStatus = 'PAID';
      studentData.status = initialStatus;
      studentData.payments = [{
        fee,
        feeDate: studentData.feeDate || new Date().toISOString().slice(0, 10),
        month: studentData.month,
        status: initialStatus,
        method: isSplit ? 'Split (Cash+Online)' : (body.method || 'Cash'),
        cashAmount,
        onlineAmount,
        amountPaid,
        installments: (cashAmount > 0 || onlineAmount > 0)
          ? [{ date: studentData.feeDate || new Date().toISOString().slice(0, 10), cashAmount, onlineAmount, amount: cashAmount + onlineAmount, method: isSplit ? 'Split (Cash+Online)' : (body.method || 'Cash') }]
          : [],
        notes: initialStatus === 'UNPAID' ? 'Pending registration fee' : (initialStatus === 'PENDING' ? 'Half payment received — balance pending' : 'Initial registration fee')
      }];
    }

    const student = new Student(studentData);
    await student.save();
    return NextResponse.json(student);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}