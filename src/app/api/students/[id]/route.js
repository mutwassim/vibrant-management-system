import { NextResponse } from 'next/server';
import { verifyAuth } from '../../../../lib/auth';
import { Student } from '../../../../models';
import { normalizePhone, phoneError } from '../../../../lib/phone';

// Build a filter that handles migrated data (ownerId may be null or unset)
function buildOwnerFilter(tenantId) {
  if (!tenantId) return {};
  return { $or: [{ ownerId: tenantId }, { ownerId: null }] };
}

export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    const { tenantId } = await verifyAuth(req);
    const body = await req.json();

    // Validate contacts only when the update actually carries them, so that
    // partial updates aren't forced to resend the phone numbers.
    if ('contact' in body) {
      const contactErr = phoneError(body.contact, { required: true, label: 'Contact number' });
      if (contactErr) return NextResponse.json({ error: contactErr }, { status: 400 });
      body.contact = normalizePhone(body.contact);
    }
    if ('contact2' in body) {
      const contact2Err = phoneError(body.contact2, { label: 'Contact number 2' });
      if (contact2Err) return NextResponse.json({ error: contact2Err }, { status: 400 });
      body.contact2 = normalizePhone(body.contact2);
    }
    if ('admissionFee' in body) {
      const admissionFee = Number(body.admissionFee) || 0;
      if (admissionFee < 0) {
        return NextResponse.json({ error: 'Admission fee cannot be negative.' }, { status: 400 });
      }
      body.admissionFee = admissionFee;
      body.admissionFeeStatus = admissionFee > 0 ? (body.admissionFeeStatus || 'PAID') : 'UNPAID';
      body.admissionDate = admissionFee > 0
        ? (body.admissionDate || new Date().toISOString().slice(0, 10))
        : '';
      body.admissionMethod = body.admissionMethod || 'Cash';

      // If the admission fee/date/status actually changed, it hasn't been
      // receipted in its new form yet — let it show on the next receipt again.
      // (Skip this when the caller explicitly sets admissionFeeCharged itself,
      // e.g. the payment flow marking it as shown.)
      if (!('admissionFeeCharged' in body)) {
        const existing = await Student.findOne({ _id: id });
        const changed = existing && (
          existing.admissionFee !== body.admissionFee ||
          existing.admissionDate !== body.admissionDate ||
          existing.admissionFeeStatus !== body.admissionFeeStatus
        );
        if (changed) body.admissionFeeCharged = false;
      }
    }

    const ownerFilter = buildOwnerFilter(tenantId);
    const filter = { _id: id, ...ownerFilter };
    
    // Also fix ownerId if missing
    if (tenantId) body.ownerId = body.ownerId || tenantId;
    
    const student = await Student.findOneAndUpdate(filter, body, { returnDocument: 'after' });
    if (!student) {
      return NextResponse.json({ error: 'Student not found or access denied.' }, { status: 404 });
    }
    return NextResponse.json(student);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    const { tenantId } = await verifyAuth(req);

    const ownerFilter = buildOwnerFilter(tenantId);
    const filter = { _id: id, ...ownerFilter };
    const deleted = await Student.findOneAndDelete(filter);
    if (!deleted) {
      return NextResponse.json({ error: 'Student not found or access denied.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}