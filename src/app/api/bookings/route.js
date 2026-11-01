import { NextResponse } from 'next/server';
import { verifyAuth, hasEnterpriseAccess } from '../../../lib/auth';
import { Booking } from '../../../models';

export async function GET(req) {
  try {
    const { user, tenantFilter } = await verifyAuth(req);
    if (!hasEnterpriseAccess(user)) {
      return NextResponse.json({ error: 'Ground Bookings is an Enterprise feature. Upgrade your plan to use it.' }, { status: 403 });
    }
    const bookings = await Booking.find(tenantFilter).sort({ date: 1, startTime: 1 });
    return NextResponse.json(bookings);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { user, tenantId, tenantFilter } = await verifyAuth(req);
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

    // Also pull bookings from the adjacent dates, since a booking that
    // crosses midnight is stored under its start date but can still occupy
    // early-morning minutes on the following calendar date (and vice versa).
    // Cricket and football are separate grounds, so a booking on one can never
    // clash with the other. Legacy rows have no `ground` and count as cricket.
    const ground = body.ground === 'FOOTBALL' ? 'FOOTBALL' : 'CRICKET';

    const existing = (await Booking.find({
      date: { $in: [date, prevDate, nextDate] },
      status: { $ne: 'CANCELLED' },
      ...tenantFilter
    })).filter(b => (b.ground || 'CRICKET') === ground);
    const overlap = existing.find(b => {
      const bStart0 = toMins(b.startTime);
      let bEnd0 = toMins(b.endTime);
      if (bEnd0 <= bStart0) bEnd0 += 24 * 60;

      // Re-express the existing booking's time on the SAME timeline as the
      // new booking (minutes from `date`'s midnight), based on which
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

    const bookingData = { ...body, ground };
    if (tenantId) bookingData.ownerId = tenantId;
    else if (user.role === 'ADMIN') bookingData.ownerId = user._id;
    // Seed the first installment from whatever cash/online was entered at
    // booking time, same as new-student creation — so later edits that add
    // more money can append to this instead of starting from nothing.
    const initCash = Number(body.cashAmount) || 0;
    const initOnline = Number(body.onlineAmount) || 0;
    if (initCash > 0 || initOnline > 0) {
      bookingData.installments = [{
        date: body.paymentDate || body.date || '',
        cashAmount: initCash,
        onlineAmount: initOnline,
        amount: initCash + initOnline,
        method: body.paymentMethod || 'Cash'
      }];
    }

    const booking = new Booking(bookingData);
    await booking.save();
    return NextResponse.json(booking);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}