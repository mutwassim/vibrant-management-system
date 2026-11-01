"use client";
import React, { useState } from 'react';
import html2canvas from 'html2canvas';
import { phoneError } from '../lib/phone';

/**
 * Football ground bookings — a separate pitch from the cricket ground, booked
 * in minutes (90 by default) instead of whole hours.
 *
 * Kept in its own file so the cricket module stays exactly as it was. Styling
 * reuses dashboard.css classes, so it matches the rest of the app.
 *
 * Props:
 *   db          the dashboard's data object (uses db.bookings)
 *   active      whether this page is the visible one
 *   getHeaders  () => fetch headers incl. auth token
 *   onToast     (msg, color) => void
 *   onReload    () => void    refetch after a change
 *   openHour    football ground opening hour (0-23)
 *   closeHour   football ground closing hour (0-23)
 *   onEditHours () => void    opens the hours settings modal
 */

const SLOT_MINS = 30; // timeline granularity; every duration is a multiple of it
const DURATION_OPTIONS = [30, 60, 90, 120];

const pad = (v) => String(v).padStart(2, '0');
const toMins = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (mins) => {
  const m = ((mins % 1440) + 1440) % 1440; // wrap past midnight
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};
const fmtTime = (t) => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${pad(m || 0)} ${ampm}`;
};
const fmtDuration = (mins) => {
  const n = Number(mins) || 0;
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const shiftDateStr = (dateStr, days) => {
  const parts = (dateStr || '').split('-');
  if (parts.length !== 3) return dateStr;
  const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

export default function FootballBookings({ db, active, getHeaders, onToast, onReload, openHour, closeHour, onEditHours, academySettings = {} }) {
  const [scheduleDate, setScheduleDate] = useState(localToday());
  const [dateFilter, setDateFilter] = useState('');
  const [yearFilter, setYearFilter] = useState(() => localToday().slice(0, 4));
  const [monthFilter, setMonthFilter] = useState(() => localToday().slice(5, 7));
  const [statusFilter, setStatusFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [team, setTeam] = useState('');
  const [contact, setContact] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [durationMins, setDurationMins] = useState('90');
  const [amount, setAmount] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [method, setMethod] = useState('Cash');
  // Split payment — part cash, part online, for the same booking. When both
  // are 0 (splitPayment off), `method` above is what to trust and
  // amountPaid is entered directly as one number.
  const [splitPayment, setSplitPayment] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');
  const [status, setStatus] = useState('CONFIRMED');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [slipBooking, setSlipBooking] = useState(null);
  const slipContentRef = React.useRef(null);
  const [slipSharing, setSlipSharing] = useState(false);

  // Same print/share approach as the student fee receipt in dashboard/page.js
  // — a hidden print-only copy of the receipt for window.print(), and
  // html2canvas for the native share sheet.
  const printFootballSlip = () => {
    const printArea = document.getElementById('football-slip-print-area');
    if (printArea) {
      printArea.style.display = 'block';
      document.body.classList.add('printing-slip');
      window.print();
      document.body.classList.remove('printing-slip');
      printArea.style.display = 'none';
    } else {
      window.print();
    }
  };

  const shareFootballSlip = async () => {
    if (!slipContentRef.current || slipSharing) return;
    setSlipSharing(true);
    try {
      const canvas = await html2canvas(slipContentRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not generate image');
      const fileName = `Receipt-${(slipBooking?.teamName || 'Booking').replace(/\s+/g, '-')}-${slipBooking?.date || ''}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      const shareText = `Football booking receipt for ${slipBooking?.teamName || ''} — ${slipBooking?.date || ''}`;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Booking Receipt', text: shareText });
      } else if (navigator.share) {
        await navigator.share({ title: 'Booking Receipt', text: shareText });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        onToast('Sharing not supported on this browser — image downloaded instead.', '#0d1b2e');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') onToast('Could not share the receipt.', '#ff3b5c');
    } finally {
      setSlipSharing(false);
    }
  };

  if (!active) return null;

  // Payment received on a booking now drives its status automatically:
  //   no payment yet -> PENDING, partial -> CONFIRMED, paid in full -> FINISHED.
  // CANCELLED stays a manual choice and is never overridden by this.
  const computeStatus = (amt, paid) => {
    const a = Number(amt) || 0;
    const p = Number(paid) || 0;
    if (p <= 0) return 'PENDING';
    if (a > 0 && p >= a) return 'FINISHED';
    return 'CONFIRMED';
  };

  // Bookings saved before "Amount Paid" existed have no such field. Treat a
  // legacy CONFIRMED/FINISHED booking as fully paid so old revenue totals
  // don't drop to zero just because the new field is missing.
  const getPaidAmount = (b) => {
    if (b.amountPaid !== undefined && b.amountPaid !== null && b.amountPaid !== '') return Number(b.amountPaid) || 0;
    return (b.status === 'CONFIRMED' || b.status === 'FINISHED') ? (Number(b.amount) || 0) : 0;
  };

  const bookings = (db.bookings || []).filter((b) => b.ground === 'FOOTBALL');

  // ── Filtering ──
  const filtered = bookings.filter((b) => {
    if (dateFilter && b.date !== dateFilter) return false;
    if (statusFilter && b.status !== statusFilter) return false;
    if (yearFilter && (b.date || '').slice(0, 4) !== yearFilter) return false;
    if (monthFilter && (b.date || '').slice(5, 7) !== monthFilter) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.startTime || '').localeCompare(a.startTime || ''));

  const today = localToday();
  const hasFilter = !!(dateFilter || yearFilter || monthFilter || statusFilter);
  const scope = hasFilter ? filtered : filtered.filter((b) => b.date === today);
  const totalCount = scope.filter((b) => b.status !== 'CANCELLED').length;
  const upcomingCount = filtered.filter((b) => b.date >= today && b.status !== 'CANCELLED').length;
  const revenue = scope.filter((b) => b.status === 'CONFIRMED' || b.status === 'FINISHED').reduce((sum, b) => sum + getPaidAmount(b), 0);
  const confirmedCount = scope.filter((b) => b.status === 'CONFIRMED').length;
  const finishedCount = scope.filter((b) => b.status === 'FINISHED').length;
  const pendingCount = scope.filter((b) => b.status === 'PENDING').length;
  const cancelledCount = scope.filter((b) => b.status === 'CANCELLED').length;

  // ── Day timeline ──
  // The ground can close after midnight (e.g. 20:00 -> 02:00), so walk minutes
  // forward from opening until closing rather than looping over clock hours.
  const openMins = openHour * 60;
  let closeMins = closeHour * 60;
  if (closeMins <= openMins) closeMins += 1440;

  // A booking that starts the previous day can still run into this morning.
  const dayBookings = (bookings || []).filter(
    (b) => b.status !== 'CANCELLED' && (b.date === scheduleDate || b.date === shiftDateStr(scheduleDate, -1))
  );
  const occupied = dayBookings.map((b) => {
    const offset = b.date === scheduleDate ? 0 : -1440;
    const s = toMins(b.startTime) + offset;
    let e = s + (Number(b.durationMins) || 0);
    if (!b.durationMins) {
      let raw = toMins(b.endTime);
      if (raw <= toMins(b.startTime)) raw += 1440;
      e = raw + offset;
    }
    return { booking: b, start: s, end: e };
  });

  const slots = [];
  for (let m = openMins; m < closeMins; m += SLOT_MINS) {
    const hit = occupied.find((o) => m >= o.start && m < o.end);
    slots.push({ mins: m, booking: hit ? hit.booking : null, isStart: hit ? hit.start === m : false });
  }

  // ── Conflict preview (the server checks this too — this is just early warning) ──
  const conflict = (() => {
    if (!date || !start || !durationMins) return '';
    const s = toMins(start);
    const e = s + Number(durationMins);
    const sameGround = bookings.filter(
      (b) => b.status !== 'CANCELLED' && b._id !== editingId &&
        (b.date === date || b.date === shiftDateStr(date, -1) || b.date === shiftDateStr(date, 1))
    );
    for (const b of sameGround) {
      const offset = b.date === date ? 0 : (b.date === shiftDateStr(date, -1) ? -1440 : 1440);
      const bs = toMins(b.startTime) + offset;
      let be = bs + (Number(b.durationMins) || 0);
      if (!b.durationMins) {
        let raw = toMins(b.endTime);
        if (raw <= toMins(b.startTime)) raw += 1440;
        be = raw + offset;
      }
      if (s < be && e > bs) {
        return `Clashes with "${b.teamName}" (${fmtTime(b.startTime)} – ${fmtTime(b.endTime)})`;
      }
    }
    return '';
  })();

  // ── Form ──
  const openAdd = (presetDate, presetStart) => {
    setEditingId(null);
    setTeam('');
    setContact('');
    setDate(presetDate || scheduleDate || localToday());
    setStart(presetStart || '');
    setDurationMins('90');
    setAmount('');
    setAmountPaid('');
    setPaymentDate(localToday());
    setMethod('Cash');
    setSplitPayment(false);
    setCashAmount('');
    setOnlineAmount('');
    setStatus('PENDING');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (b) => {
    setEditingId(b._id);
    setTeam(b.teamName || '');
    setContact(b.contact || '');
    setDate(b.date || '');
    setStart(b.startTime || '');
    setDurationMins(String(b.durationMins || 90));
    setAmount(b.amount || '');
    setAmountPaid(b.amountPaid ?? '');
    setPaymentDate(b.paymentDate || '');
    setMethod(b.paymentMethod || 'Cash');
    // Same fix as students/cricket: method === 'Split (Cash+Online)' is the
    // real signal, not "both amounts happen to be > 0".
    const hasSplit = b.paymentMethod === 'Split (Cash+Online)';
    setSplitPayment(hasSplit);
    setCashAmount(hasSplit ? (b.cashAmount || 0) : '');
    setOnlineAmount(hasSplit ? (b.onlineAmount || 0) : '');
    setStatus(b.status || 'CONFIRMED');
    setNotes(b.notes || '');
    setDetail(null);
    setModalOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!team) return onToast('Enter team name', '#ff3b5c');
    if (!date) return onToast('Select a date', '#ff3b5c');
    if (!start) return onToast('Select start time', '#ff3b5c');
    const contactErr = phoneError(contact, { label: 'Contact number' });
    if (contactErr) return onToast(contactErr, '#ff3b5c');

    const mins = Number(durationMins) || 90;
    const endTime = toHHMM(toMins(start) + mins);

    // Split payment: the amount actually received is Cash + Online added
    // together (not forced to equal the booking amount), so a half payment
    // split across two methods still works — same idea as the single field.
    const finalAmountPaid = splitPayment
      ? (Number(cashAmount) || 0) + (Number(onlineAmount) || 0)
      : (Number(amountPaid) || 0);
    // Once split is on, it's a split entry — don't require both amounts
    // > 0 to call it that (same fix as cricket bookings and students).
    const finalMethod = splitPayment ? 'Split (Cash+Online)' : method;

    const payload = {
      ground: 'FOOTBALL',
      teamName: team,
      contact,
      date,
      startTime: start,
      endTime,
      durationMins: mins,
      duration: mins / 60, // keeps the shared `duration` field meaningful (1.5 = 90 min)
      amount: Number(amount) || 0,
      amountPaid: finalAmountPaid,
      paymentDate,
      paymentMethod: finalMethod,
      cashAmount: splitPayment ? (Number(cashAmount) || 0) : 0,
      onlineAmount: splitPayment ? (Number(onlineAmount) || 0) : 0,
      status,
      notes
    };

    // Log any NEW money added during this edit as one more installment,
    // same trail-of-payments idea used for student fees and cricket
    // bookings — so the detail view can show "Rs 2,000 cash, then Rs
    // 1,000 online" instead of just the final combined totals.
    if (editingId) {
      const original = (db.bookings || []).find(b => b._id === editingId);
      if (original) {
        const newCash = Math.max(0, payload.cashAmount - (original.cashAmount || 0));
        const newOnline = Math.max(0, payload.onlineAmount - (original.onlineAmount || 0));
        if (newCash > 0 || newOnline > 0) {
          payload.newCashAmount = newCash;
          payload.newOnlineAmount = newOnline;
        }
      }
    } else if (payload.cashAmount > 0 || payload.onlineAmount > 0) {
      payload.newCashAmount = payload.cashAmount;
      payload.newOnlineAmount = payload.onlineAmount;
    }

    setSaving(true);
    try {
      const res = await fetch(editingId ? `/api/bookings/${editingId}` : '/api/bookings', {
        method: editingId ? 'PUT' : 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const raw = await res.text();
      let data = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          onToast(`Server error ${res.status} — check the terminal`, '#ff3b5c');
          setSaving(false);
          return;
        }
      }
      if (res.ok) {
        // Mongoose silently drops fields its cached schema doesn't know about.
        // If `ground` comes back missing, models/index.js is stale on the server
        // and this booking would land in the cricket list — say so loudly.
        if (data && data.ground !== 'FOOTBALL') {
          onToast('Saved, but the server dropped the "ground" field — update models/index.js and restart the dev server', '#ff6b35');
        } else {
          onToast(editingId ? 'Booking updated!' : 'Football booking added!', '#00a876');
        }
        setModalOpen(false);
        setSlipBooking(data);
        onReload();
      } else {
        onToast(data.error || `Failed to save booking (${res.status})`, '#ff3b5c');
      }
    } catch (err) {
      onToast(`Error saving booking: ${err.message}`, '#ff3b5c');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this booking permanently?')) return;
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) {
        onToast('Booking deleted.', '#ff6b35');
        setDetail(null);
        onReload();
      } else {
        onToast('Failed to delete booking', '#ff3b5c');
      }
    } catch (err) {
      onToast(`Error deleting booking: ${err.message}`, '#ff3b5c');
    }
  };

  const years = ['2024', '2025', '2026', '2027', '2028'];
  const months = [
    ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
    ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
    ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December']
  ];

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Football Ground</div>
          <div className="page-sub">Slot bookings by the minute — 90 min default</div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={onEditHours}>Ground Hours</button>
          <button className="btn btn-primary" onClick={() => openAdd()}>+ New Booking</button>
        </div>
      </div>

      <div id="ground-hours-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>🕒</span>
          <div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '18px', letterSpacing: '1px' }}>
              Football Hours: {fmtTime(toHHMM(openHour * 60))} to {fmtTime(toHHMM(closeHour * 60))}
            </div>
            <div style={{ fontSize: '12px', color: '#7a9ab8', marginTop: '2px' }}>
              Slots are 30 minutes. Tap any green slot to book from that time.
            </div>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onEditHours} style={{ borderColor: '#ffffff40', color: '#fff', background: 'transparent' }}>Edit Hours</button>
      </div>

      {/* Summary */}
      <div className="summary-row" style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
        {[
          ['#1a56db', totalCount, 'BOOKINGS'],
          ['#00a876', upcomingCount, 'UPCOMING'],
          ['#ff6b35', `RS ${revenue.toLocaleString()}`, 'REVENUE'],
          ['#00b8a9', confirmedCount, 'CONFIRMED'],
          ['#0084ff', finishedCount, 'FINISHED'],
          ['#7c3aed', cancelledCount, 'CANCELLED'],
          ['#ff3b5c', pendingCount, 'PENDING']
        ].map(([color, value, label]) => (
          <div key={label} className="summary-card" style={{ borderTop: `4px solid ${color}`, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>{value}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Day picker */}
      <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setScheduleDate(shiftDateStr(scheduleDate, -1))}>◀ Prev</button>
        <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} style={{ fontWeight: 600 }} />
        <button className="btn btn-secondary btn-sm" onClick={() => setScheduleDate(shiftDateStr(scheduleDate, 1))}>Next ▶</button>
        {scheduleDate !== localToday() && <button className="btn btn-secondary btn-sm" onClick={() => setScheduleDate(localToday())}>↩ Today</button>}
        <button className="btn btn-primary btn-sm" onClick={() => openAdd(scheduleDate)}>+ Book This Day</button>
      </div>

      {/* Timeline */}
      <div className="table-wrap" style={{ padding: '20px', marginBottom: '28px' }}>
        <div style={{ fontWeight: 700, marginBottom: '14px', fontSize: '15px' }}>
          Timeline for {new Date(scheduleDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
        <div className="time-slot-grid">
          {slots.map((slot) => {
            const timeStr = toHHMM(slot.mins);
            if (slot.booking) {
              const b = slot.booking;
              // Same look as the cricket timeline: every slot the booking covers
              // shows the team, so a 90-minute game reads as one solid block.
              const hours = Math.min(Math.max(Math.round((Number(b.durationMins) || 60) / 60), 1), 4);
              return (
                <div className={`time-slot booked-${hours}hr`} key={slot.mins} onClick={() => setDetail(b)} style={{ cursor: 'pointer' }}>
                  <div className="slot-time">{fmtTime(timeStr)}</div>
                  <div className="slot-team">{b.teamName}</div>
                  <div className="slot-dur">{fmtDuration(b.durationMins)} ({b.status})</div>
                </div>
              );
            }
            return (
              <div className="time-slot available" key={slot.mins} onClick={() => openAdd(scheduleDate, timeStr)}>
                <div className="slot-time">{fmtTime(timeStr)}</div>
                <div className="slot-dur">Available</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', borderTop: '1px solid var(--border)', paddingTop: '20px', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: '15px', marginRight: 'auto' }}>Booking History</div>
        <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
          <option value="">All Years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
          <option value="">All Months</option>
          {months.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option>PENDING</option>
          <option>CONFIRMED</option>
          <option>FINISHED</option>
          <option>CANCELLED</option>
        </select>
        {(dateFilter || statusFilter || !yearFilter || !monthFilter) && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setDateFilter(''); setStatusFilter(''); setYearFilter(localToday().slice(0, 4)); setMonthFilter(localToday().slice(5, 7)); }}>Reset</button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>Date</th>
              <th>Time</th>
              <th>Duration</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? filtered.map((b, i) => (
              <tr key={b._id}>
                <td>{i + 1}</td>
                <td>
                  <strong>{b.teamName}</strong>
                  {b.contact ? <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{b.contact}</div> : null}
                </td>
                <td>{b.date}</td>
                <td>{fmtTime(b.startTime)} – {fmtTime(b.endTime)}</td>
                <td>{fmtDuration(b.durationMins)}</td>
                <td>
                  Rs {(b.amount || 0).toLocaleString()}
                  {b.status !== 'CANCELLED' && Math.max(0, (Number(b.amount) || 0) - getPaidAmount(b)) > 0 ? (
                    <div style={{ fontSize: '11px', color: '#ff6b35' }}>Remaining: Rs {Math.max(0, (Number(b.amount) || 0) - getPaidAmount(b)).toLocaleString()}</div>
                  ) : null}
                </td>
                <td>
                  {b.paymentMethod || 'Cash'}
                  {((b.cashAmount || 0) > 0 || (b.onlineAmount || 0) > 0) ? (
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Cash Rs {(b.cashAmount || 0).toLocaleString()} + Online Rs {(b.onlineAmount || 0).toLocaleString()}</div>
                  ) : null}
                </td>
                <td><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                <td style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setDetail(b)}>View</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(b)}>Edit</button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No football bookings match this query</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Form modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => !saving && setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? 'Edit Football Booking' : 'New Football Booking'}</h3>
            <form onSubmit={save}>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Team Name *</label>
                  <input type="text" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Team name" required />
                </div>
                <div className="form-group">
                  <label>Contact Number</label>
                  <input type="tel" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="03139832544" />
                  {contact && phoneError(contact) ? (
                    <div style={{ color: '#ff3b5c', fontSize: '11px', marginTop: '4px' }}>Number is not valid — 11 digits starting with 03</div>
                  ) : null}
                </div>
                <div className="form-group">
                  <label>Date *</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Start Time *</label>
                  <input type="time" step="300" value={start} onChange={(e) => setStart(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Duration</label>
                  <select value={durationMins} onChange={(e) => setDurationMins(e.target.value)}>
                    {DURATION_OPTIONS.map((d) => (
                      <option key={d} value={d}>{fmtDuration(d)}</option>
                    ))}
                  </select>
                </div>
                {start && durationMins ? (
                  <div className="form-group full" style={{ marginTop: '-4px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Slot: <strong>{fmtTime(start)} – {fmtTime(toHHMM(toMins(start) + Number(durationMins)))}</strong>
                    </div>
                  </div>
                ) : null}
                {conflict ? (
                  <div className="form-group full">
                    <div style={{ background: '#ff3b5c18', border: '1px solid #ff3b5c', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: '#ff3b5c' }}>
                      ⚠ {conflict}
                    </div>
                  </div>
                ) : null}
                <div className="form-group">
                  <label>Amount (PKR)</label>
                  <input type="number" min="0" value={amount} onChange={(e) => {
                    const v = e.target.value;
                    setAmount(v);
                    setStatus((prev) => prev === 'CANCELLED' ? prev : computeStatus(v, amountPaid));
                  }} placeholder="5000" />
                </div>
                <div className="form-group full" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '2px 0' }}>
                  <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={splitPayment} onChange={(e) => {
                      const checked = e.target.checked;
                      setSplitPayment(checked);
                      if (checked) {
                        // Seed the split with whatever was already entered as a
                        // plain "Payment Received" number, in the Cash slot.
                        setCashAmount(amountPaid || '');
                        setOnlineAmount('');
                      }
                    }} />
                    Split this payment — part Cash, part Online
                  </label>
                </div>
                {!splitPayment && (
                  <div className="form-group">
                    <label>Payment Received</label>
                    <input type="number" min="0" value={amountPaid} onChange={(e) => {
                      const v = e.target.value;
                      setAmountPaid(v);
                      setStatus((prev) => prev === 'CANCELLED' ? prev : computeStatus(amount, v));
                    }} placeholder="0" />
                    {amount ? (
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                        Remaining: <strong>Rs {Math.max(0, (Number(amount) || 0) - (Number(amountPaid) || 0)).toLocaleString()}</strong>
                      </div>
                    ) : null}
                  </div>
                )}
                {!splitPayment && (
                  <div className="form-group">
                    <label>Payment Method</label>
                    <select value={method} onChange={(e) => setMethod(e.target.value)}>
                      <option>Cash</option>
                      <option>Online</option>
                      <option>Bank Transfer</option>
                    </select>
                  </div>
                )}
                {splitPayment && (
                  <div className="form-group full">
                    <label>Cash / Online Split — total received so far</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <input
                        type="number"
                        min="0"
                        placeholder="Cash amount"
                        value={cashAmount}
                        onChange={(e) => {
                          const cash = e.target.value;
                          setCashAmount(cash);
                          const total = (Number(cash) || 0) + (Number(onlineAmount) || 0);
                          setStatus((prev) => prev === 'CANCELLED' ? prev : computeStatus(amount, total));
                        }}
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Online amount"
                        value={onlineAmount}
                        onChange={(e) => {
                          const online = e.target.value;
                          setOnlineAmount(online);
                          const total = (Number(cashAmount) || 0) + (Number(online) || 0);
                          setStatus((prev) => prev === 'CANCELLED' ? prev : computeStatus(amount, total));
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                      Total received: <strong>Rs {((Number(cashAmount) || 0) + (Number(onlineAmount) || 0)).toLocaleString()}</strong> of Rs {(Number(amount) || 0).toLocaleString()}
                      {amount ? <> · Remaining: <strong style={{ color: '#ff6b35' }}>Rs {Math.max(0, (Number(amount) || 0) - (Number(cashAmount) || 0) - (Number(onlineAmount) || 0)).toLocaleString()}</strong></> : null}
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label>Payment Date</label>
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option>PENDING</option>
                    <option>CONFIRMED</option>
                    <option>FINISHED</option>
                    <option>CANCELLED</option>
                  </select>
                </div>
                <div className="form-group full">
                  <label>Notes</label>
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Advance paid, referee needed..." />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : (editingId ? 'Update Booking' : 'Save Booking')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <h3>{detail.teamName}</h3>
            <table style={{ width: '100%', fontSize: '13px', marginBottom: '10px' }}>
              <tbody>
                <tr><td style={{ color: 'var(--muted)', padding: '6px 0' }}>Date</td><td>{detail.date}</td></tr>
                <tr><td style={{ color: 'var(--muted)', padding: '6px 0' }}>Time</td><td>{fmtTime(detail.startTime)} – {fmtTime(detail.endTime)}</td></tr>
                <tr><td style={{ color: 'var(--muted)', padding: '6px 0' }}>Duration</td><td>{fmtDuration(detail.durationMins)}</td></tr>
                <tr><td style={{ color: 'var(--muted)', padding: '6px 0' }}>Contact</td><td>{detail.contact || '—'}</td></tr>
                <tr><td style={{ color: 'var(--muted)', padding: '6px 0' }}>Amount</td><td><strong>Rs {(detail.amount || 0).toLocaleString()}</strong></td></tr>
                <tr><td style={{ color: 'var(--muted)', padding: '6px 0' }}>Amount Paid</td><td>Rs {getPaidAmount(detail).toLocaleString()}</td></tr>
                <tr><td style={{ color: 'var(--muted)', padding: '6px 0' }}>Remaining</td><td>Rs {Math.max(0, (Number(detail.amount) || 0) - getPaidAmount(detail)).toLocaleString()}</td></tr>
                <tr><td style={{ color: 'var(--muted)', padding: '6px 0' }}>Method</td><td>{detail.paymentMethod || 'Cash'}{((detail.cashAmount || 0) > 0 || (detail.onlineAmount || 0) > 0) ? <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Cash Rs {(detail.cashAmount || 0).toLocaleString()} + Online Rs {(detail.onlineAmount || 0).toLocaleString()}</div> : null}
                  {detail.installments && detail.installments.length > 1 && (
                    <table style={{ width: '100%', fontSize: '11px', marginTop: '4px' }}>
                      <tbody>
                        {detail.installments.map((inst, i) => (
                          <tr key={i}>
                            <td style={{ padding: '1px 4px 1px 0', color: 'var(--muted)' }}>{inst.date || '—'}</td>
                            <td style={{ padding: '1px 0' }}>
                              {inst.cashAmount > 0 && inst.onlineAmount > 0
                                ? `Cash Rs ${inst.cashAmount.toLocaleString()} + Online Rs ${inst.onlineAmount.toLocaleString()}`
                                : inst.onlineAmount > 0
                                  ? `Online Rs ${inst.onlineAmount.toLocaleString()}`
                                  : `Cash Rs ${inst.cashAmount.toLocaleString()}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </td></tr>
                <tr><td style={{ color: 'var(--muted)', padding: '6px 0' }}>Payment Date</td><td>{detail.paymentDate || '—'}</td></tr>
                <tr><td style={{ color: 'var(--muted)', padding: '6px 0' }}>Status</td><td><span className={`badge badge-${detail.status}`}>{detail.status}</span></td></tr>
                <tr><td style={{ color: 'var(--muted)', padding: '6px 0' }}>Notes</td><td>{detail.notes || '—'}</td></tr>
              </tbody>
            </table>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => remove(detail._id)} style={{ color: '#ff3b5c', borderColor: '#ff3b5c' }}>Delete</button>
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => openEdit(detail)}>Edit</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HIDDEN PRINT AREA FOR BOOKING RECEIPT ── */}
      {slipBooking && (
        <div id="football-slip-print-area" className="receipt-doc" style={{ display: 'none', background: '#fff', color: '#000', padding: '20px' }}>
          <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '14px', marginBottom: '18px' }}>
            {academySettings.logo && <img src={academySettings.logo} alt="Logo" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', marginBottom: '6px' }} />}
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '26px', letterSpacing: '2px', color: '#000' }}>{academySettings.name}</div>
            <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '1px' }}>{academySettings.tagline}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '8px' }}>Booking Receipt</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>{slipBooking.paymentDate || slipBooking.date}</div>
          </div>
          <table style={{ width: '100%', fontSize: '11pt' }}>
            <tbody>
              <tr><td style={{ color: '#666', width: '40%', border: 'none', padding: '6px 0' }}>Team</td><td style={{ fontWeight: 600, border: 'none', padding: '6px 0' }}>{slipBooking.teamName}</td></tr>
              {slipBooking.contact && (
                <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Contact</td><td style={{ border: 'none', padding: '6px 0' }}>{slipBooking.contact}</td></tr>
              )}
              <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Ground</td><td style={{ border: 'none', padding: '6px 0' }}>Football</td></tr>
              <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Date</td><td style={{ border: 'none', padding: '6px 0' }}>{slipBooking.date}</td></tr>
              <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Time</td><td style={{ border: 'none', padding: '6px 0' }}>{slipBooking.startTime}{slipBooking.endTime ? ` – ${slipBooking.endTime}` : ''}</td></tr>
              <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Payment Type</td><td style={{ border: 'none', padding: '6px 0' }}>{slipBooking.paymentMethod}{((slipBooking.cashAmount || 0) > 0 || (slipBooking.onlineAmount || 0) > 0) ? ` (Cash Rs ${(slipBooking.cashAmount || 0).toLocaleString()} + Online Rs ${(slipBooking.onlineAmount || 0).toLocaleString()})` : ''}</td></tr>
              {slipBooking.installments && slipBooking.installments.length > 1 && (
                <tr>
                  <td style={{ color: '#666', border: 'none', padding: '6px 0', verticalAlign: 'top' }}>Received In</td>
                  <td style={{ border: 'none', padding: '6px 0' }}>
                    <table style={{ width: '100%', fontSize: '10.5pt', borderCollapse: 'collapse' }}>
                      <tbody>
                        {slipBooking.installments.map((inst, i) => (
                          <tr key={i}>
                            <td style={{ border: 'none', padding: '1px 0', color: '#888' }}>{inst.date || '—'}</td>
                            <td style={{ border: 'none', padding: '1px 0' }}>
                              {inst.cashAmount > 0 && inst.onlineAmount > 0
                                ? `Cash Rs ${inst.cashAmount.toLocaleString()} + Online Rs ${inst.onlineAmount.toLocaleString()}`
                                : inst.onlineAmount > 0
                                  ? `Online Rs ${inst.onlineAmount.toLocaleString()}`
                                  : `Cash Rs ${inst.cashAmount.toLocaleString()}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
              <tr style={{ borderTop: '2px solid #000' }}>
                <td style={{ fontWeight: 700, fontSize: '12pt', paddingTop: '10px', border: 'none' }}>Booking Amount</td>
                <td style={{ fontWeight: 700, fontSize: '13pt', color: '#00a876', paddingTop: '10px', border: 'none' }}>Rs {(slipBooking.amount || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, fontSize: '12pt', border: 'none', padding: '6px 0' }}>Total Received</td>
                <td style={{ fontWeight: 700, fontSize: '13pt', color: '#00a876', border: 'none', padding: '6px 0' }}>Rs {(slipBooking.amountPaid || 0).toLocaleString()}</td>
              </tr>
              <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Status</td><td style={{ fontWeight: 600, border: 'none', padding: '6px 0' }}>{slipBooking.status}</td></tr>
            </tbody>
          </table>
          <div style={{ textAlign: 'center', marginTop: '18px', fontSize: '11px', color: '#666', borderTop: '1px dashed #ccc', paddingTop: '12px' }}>
            Thank you! — {academySettings.name}
          </div>
          {(academySettings.email || academySettings.phone || academySettings.website || academySettings.address) && (
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '9px', color: '#888', borderTop: '1px solid #eee', paddingTop: '6px' }}>
              {academySettings.address && <>{academySettings.address}<br /></>}
              {[academySettings.email, academySettings.phone, academySettings.website].filter(Boolean).join(' | ')}
            </div>
          )}
        </div>
      )}

      {/* ── VISIBLE BOOKING RECEIPT MODAL ── */}
      {slipBooking && (
        <div className="modal-overlay" onClick={() => setSlipBooking(null)}>
          <div className="modal" style={{ maxWidth: '420px', padding: 0, display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div ref={slipContentRef} className="receipt-doc" style={{ padding: '28px 28px 20px', background: '#fff', color: '#0d1b2e' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #0d1b2e', paddingBottom: '14px', marginBottom: '18px' }}>
                {academySettings.logo && <img src={academySettings.logo} alt="Logo" style={{ width: '54px', height: '54px', borderRadius: '50%', objectFit: 'cover', marginBottom: '8px' }} />}
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '32px', letterSpacing: '3px', color: '#0d1b2e' }}>{academySettings.name}</div>
                <div style={{ fontSize: '11px', color: '#4a6080', textTransform: 'uppercase', letterSpacing: '2px' }}>{academySettings.tagline}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '8px' }}>Booking Receipt</div>
                <div style={{ fontSize: '12px', color: '#4a6080', marginTop: '4px' }}>{slipBooking.paymentDate || slipBooking.date}</div>
              </div>
              <table style={{ width: '100%', fontSize: '13px' }}>
                <tbody>
                  <tr><td style={{ color: '#4a6080', width: '40%' }}>Team</td><td style={{ fontWeight: 600 }}>{slipBooking.teamName}</td></tr>
                  {slipBooking.contact && (
                    <tr><td style={{ color: '#4a6080' }}>Contact</td><td>{slipBooking.contact}</td></tr>
                  )}
                  <tr><td style={{ color: '#4a6080' }}>Ground</td><td>Football</td></tr>
                  <tr><td style={{ color: '#4a6080' }}>Date</td><td>{slipBooking.date}</td></tr>
                  <tr><td style={{ color: '#4a6080' }}>Time</td><td>{slipBooking.startTime}{slipBooking.endTime ? ` – ${slipBooking.endTime}` : ''}</td></tr>
                  <tr><td style={{ color: '#4a6080' }}>Payment Type</td><td>{slipBooking.paymentMethod}{((slipBooking.cashAmount || 0) > 0 || (slipBooking.onlineAmount || 0) > 0) ? ` (Cash Rs ${(slipBooking.cashAmount || 0).toLocaleString()} + Online Rs ${(slipBooking.onlineAmount || 0).toLocaleString()})` : ''}</td></tr>
                  {slipBooking.installments && slipBooking.installments.length > 1 && (
                    <tr>
                      <td style={{ color: '#4a6080', verticalAlign: 'top' }}>Received In</td>
                      <td>
                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                          <tbody>
                            {slipBooking.installments.map((inst, i) => (
                              <tr key={i}>
                                <td style={{ padding: '1px 0', color: '#7a8ba0' }}>{inst.date || '—'}</td>
                                <td style={{ padding: '1px 0' }}>
                                  {inst.cashAmount > 0 && inst.onlineAmount > 0
                                    ? `Cash Rs ${inst.cashAmount.toLocaleString()} + Online Rs ${inst.onlineAmount.toLocaleString()}`
                                    : inst.onlineAmount > 0
                                      ? `Online Rs ${inst.onlineAmount.toLocaleString()}`
                                      : `Cash Rs ${inst.cashAmount.toLocaleString()}`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                  <tr style={{ borderTop: '2px solid #0d1b2e' }}>
                    <td style={{ fontWeight: 700, fontSize: '14px', paddingTop: '10px' }}>Booking Amount</td>
                    <td style={{ fontWeight: 700, fontSize: '16px', color: '#00a876', paddingTop: '10px' }}>Rs {(slipBooking.amount || 0).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700, fontSize: '14px' }}>Total Received</td>
                    <td style={{ fontWeight: 700, fontSize: '16px', color: '#00a876' }}>Rs {(slipBooking.amountPaid || 0).toLocaleString()}</td>
                  </tr>
                  <tr><td style={{ color: '#4a6080' }}>Status</td><td style={{ fontWeight: 600 }}>{slipBooking.status}</td></tr>
                </tbody>
              </table>
              <div style={{ textAlign: 'center', marginTop: '18px', fontSize: '11px', color: '#4a6080', borderTop: '1px dashed #c8d8e8', paddingTop: '12px' }}>
                Thank you! — {academySettings.name}
              </div>
              {(academySettings.email || academySettings.phone || academySettings.website || academySettings.address) && (
                <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '9px', color: '#888', borderTop: '1px solid #eee', paddingTop: '6px' }}>
                  {academySettings.address && <>{academySettings.address}<br /></>}
                  {[academySettings.email, academySettings.phone, academySettings.website].filter(Boolean).join(' | ')}
                </div>
              )}
            </div>
            <div className="no-print receipt-actions" style={{ display: 'flex', gap: '10px', padding: '16px 28px', background: '#f8fafc', borderTop: '1px solid #e8f0f8' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={printFootballSlip}>🖨️ Print</button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={shareFootballSlip} disabled={slipSharing}>
                {slipSharing ? 'Preparing…' : '📤 Share'}
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSlipBooking(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}