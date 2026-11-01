import { NextResponse } from 'next/server';
import { verifyAuth, hasEnterpriseAccess } from '../../../../lib/auth';
import { Booking } from '../../../../models';

function buildOwnerFilter(tenantId) {
  // Scoped strictly to this tenant - no null-ownerId fallback.
  if (!tenantId) return {};
  return { ownerId: tenantId };
}

export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    const { user, tenantId } = await verifyAuth(req);
    if (!hasEnterpriseAccess(user)) {
      return NextResponse.json({ error: 'Ground Bookings is an Enterprise feature. Upgrade your plan to use it.' }, { status: 403 });
    }
    const body = await req.json();
    const { date, startTime, endTime } = body;

    if (!date || !startTime || !endTime) {
      return NextResponse.json({ error: 'date, startTime, and endTime are required.' }, { status: 400 });
    }

    const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

    // Shift a 'YYYY-MM-DD' date string by `days` calendar days
    const shiftDateStr = (dateStr, days) => {
      const parts = (dateStr || '').split('-');
      if (parts.length !== 3) return dateStr;
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d);
      dt.setDate(dt.getDate() + days);
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const newStart = toMins(startTime);
    let newEnd = toMins(endTime);
    if (newEnd <= newStart) newEnd += 24 * 60; // booking crosses midnight (e.g. 23:00 -> 02:00)

    const prevDate = shiftDateStr(date, -1);
    const nextDate = shiftDateStr(date, 1);

    const ownerFilter = buildOwnerFilter(tenantId);
    // Also pull bookings from the adjacent dates, since a booking that
    // crosses midnight is stored under its start date but can still occupy
    // early-morning minutes on the following calendar date (and vice versa).
    // Only clash against bookings on the SAME ground — cricket and football
    // are separate pitches. Legacy rows have no `ground` and count as cricket.
    const ground = body.ground === 'FOOTBALL' ? 'FOOTBALL' : 'CRICKET';

    const existing = (await Booking.find({
      date: { $in: [date, prevDate, nextDate] },
      status: { $ne: 'CANCELLED' },
      _id: { $ne: id },
      ...ownerFilter
    })).filter(b => (b.ground || 'CRICKET') === ground);
    const overlap = existing.find(b => {
      const bStart0 = toMins(b.startTime);
      let bEnd0 = toMins(b.endTime);
      if (bEnd0 <= bStart0) bEnd0 += 24 * 60;

      // Re-express the existing booking's time on the SAME timeline as the
      // updated booking (minutes from `date`'s midnight), based on which
      // calendar date it actually falls on.
      let offset = 0;
      if (b.date === prevDate) offset = -24 * 60;
      else if (b.date === nextDate) offset = 24 * 60;

      const bStart = bStart0 + offset;
      const bEnd = bEnd0 + offset;

      return newStart < bEnd && newEnd > bStart;
    });
    if (overlap) {
      return NextResponse.json({
        error: `Slot conflict: "${overlap.teamName}" is already booked from ${overlap.startTime} to ${overlap.endTime}`
      }, { status: 409 });
    }

    // IMPORTANT: passing `body` directly as the update document replaces the
    // WHOLE document (Mongo treats an update arg with no operators as a
    // full replacement) — that would silently wipe `installments` (and
    // ownerId) on every single edit. Explicitly $set the editable fields
    // instead, and $push a new installment only when this edit actually
    // added new cash/online money (see newCashAmount/newOnlineAmount from
    // the frontend), so the payment trail accumulates instead of resetting.
    const { newCashAmount, newOnlineAmount, ...updateBody } = body;
    const updateOps = { $set: updateBody };
    if (newCashAmount || newOnlineAmount) {
      updateOps.$push = {
        installments: {
          date: body.paymentDate || body.date || '',
          cashAmount: Number(newCashAmount) || 0,
          onlineAmount: Number(newOnlineAmount) || 0,
          amount: (Number(newCashAmount) || 0) + (Number(newOnlineAmount) || 0),
          method: body.paymentMethod || 'Cash'
        }
      };
    }

    const booking = await Booking.findOneAndUpdate(
      { _id: id, ...ownerFilter },
      updateOps,
      { returnDocument: 'after' }
    );
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found or access denied.' }, { status: 404 });
    }
    return NextResponse.json(booking);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    const { user, tenantId } = await verifyAuth(req);
    if (!hasEnterpriseAccess(user)) {
      return NextResponse.json({ error: 'Ground Bookings is an Enterprise feature. Upgrade your plan to use it.' }, { status: 403 });
    }

    const ownerFilter = buildOwnerFilter(tenantId);
    const filter = { _id: id, ...ownerFilter };
    const deleted = await Booking.findOneAndDelete(filter);
    if (!deleted) {
      return NextResponse.json({ error: 'Booking not found or access denied.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}