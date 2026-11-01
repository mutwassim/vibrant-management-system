import { NextResponse } from 'next/server';
import { verifyAuth, getSuperAdminOrTenant } from '../../../lib/auth';
import { Student, Expense, Stock, StockTransaction, Booking } from '../../../models';

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function POST(req) {
  try {
    const { user } = await verifyAuth(req);
    const body = await req.json();

    // SUPER_ADMIN must say which academy the data belongs to; an ADMIN always
    // imports into their own tenant.
    const { tenantId } = getSuperAdminOrTenant(user, body.tenantId);
    if (!tenantId) {
      return NextResponse.json({ error: 'Select an admin/academy before importing.' }, { status: 400 });
    }

    const studentRows = Array.isArray(body.students) ? body.students : [];
    const expenseRows = Array.isArray(body.expenses) ? body.expenses : [];
    const stockRows = Array.isArray(body.stock) ? body.stock : [];
    const stockTxRows = Array.isArray(body.stockTransactions) ? body.stockTransactions : [];
    const bookingRows = Array.isArray(body.bookings) ? body.bookings : [];
    if (!studentRows.length && !expenseRows.length && !stockRows.length && !stockTxRows.length && !bookingRows.length) {
      return NextResponse.json({ error: 'Nothing to import.' }, { status: 400 });
    }

    // Records migrated from the old system carry ownerId: null and are shown to
    // the tenant by /api/data, so match them too — otherwise we'd create dupes.
    const ownerFilter = { $or: [{ ownerId: tenantId }, { ownerId: null }] };

    const result = {
      studentsCreated: 0,
      studentsUpdated: 0,
      paymentsAdded: 0,
      paymentsUpdated: 0,
      expensesCreated: 0,
      expensesUpdated: 0,
      stockCreated: 0,
      stockUpdated: 0,
      stockTransactionsCreated: 0,
      stockTransactionsSkipped: 0,
      bookingsCreated: 0,
      bookingsUpdated: 0
    };

    // ── Students: one DB record per name, one payment entry per month ──
    const byName = new Map();
    for (const row of studentRows) {
      const key = String(row.name || '').trim().toLowerCase();
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(row);
    }

    for (const rows of byName.values()) {
      rows.sort((a, b) => String(a.month).localeCompare(String(b.month)));
      const latest = rows[rows.length - 1];
      // Admission happens once, on the earliest row that carries a fee.
      const admissionRow = rows.find((r) => Number(r.admissionFee) > 0);
      const name = String(rows[0].name).trim();

      const existing = await Student.findOne({
        name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
        ...ownerFilter
      });

      const toPayment = (r) => ({
        fee: Number(r.fee) || 0,
        feeDate: r.feeDate || '',
        month: r.month,
        status: r.status || 'UNPAID',
        method: r.method || 'Cash',
        cashAmount: Number(r.cashAmount) || 0,
        onlineAmount: Number(r.onlineAmount) || 0,
        notes: r.notes || ''
      });

      if (existing) {
        for (const r of rows) {
          const idx = existing.payments.findIndex((p) => p.month === r.month);
          if (idx >= 0) {
            const p = existing.payments[idx];
            p.fee = Number(r.fee) || 0;
            p.status = r.status || p.status;
            p.method = r.method || p.method;
            p.cashAmount = Number(r.cashAmount) || 0;
            p.onlineAmount = Number(r.onlineAmount) || 0;
            if (r.feeDate) p.feeDate = r.feeDate;
            if (r.notes) p.notes = r.notes;
            result.paymentsUpdated++;
          } else {
            existing.payments.push(toPayment(r));
            result.paymentsAdded++;
          }
        }
        existing.payments.sort((a, b) => String(a.month).localeCompare(String(b.month)));

        // Only fill in blanks — never overwrite details already in the system.
        if (!existing.guardian && latest.guardian) existing.guardian = latest.guardian;
        if (!existing.contact && latest.contact) existing.contact = latest.contact;
        if (!existing.contact2 && latest.contact2) existing.contact2 = latest.contact2;
        if (!(existing.admissionFee > 0) && admissionRow) {
          existing.admissionFee = Number(admissionRow.admissionFee) || 0;
          existing.admissionDate = admissionRow.admissionDate || admissionRow.feeDate || '';
          existing.admissionFeeStatus = admissionRow.admissionFeeStatus || 'PAID';
        }
        if (!existing.ageGroup && latest.ageGroup) existing.ageGroup = latest.ageGroup;
        if (!existing.session && latest.session) existing.session = latest.session;

        // Restored/imported students already have payment history, so their
        // admission fee has already been receipted before — don't let it
        // show up again on their next payment slip.
        if (existing.admissionFee > 0 && existing.payments.length > 0) {
          existing.admissionFeeCharged = true;
        }

        // The top-level month/fee/status mirror the student's most recent month,
        // so older imported rows must not clobber the current month.
        if (!existing.month || String(latest.month) >= String(existing.month)) {
          existing.month = latest.month;
          existing.fee = Number(latest.fee) || 0;
          existing.feeDate = latest.feeDate || existing.feeDate;
          existing.status = latest.status || existing.status;
        }

        if (!existing.ownerId) existing.ownerId = tenantId;
        await existing.save();
        result.studentsUpdated++;
      } else {
        await Student.create({
          ownerId: tenantId,
          name,
          guardian: latest.guardian || '',
          contact: latest.contact || '',
          contact2: latest.contact2 || '',
          admissionFee: admissionRow ? Number(admissionRow.admissionFee) || 0 : 0,
          admissionDate: admissionRow ? (admissionRow.admissionDate || admissionRow.feeDate || '') : '',
          admissionFeeStatus: admissionRow ? (admissionRow.admissionFeeStatus || 'PAID') : 'UNPAID',
          // A restored/imported student already has payment history below,
          // so its admission fee has already been receipted — don't show
          // it again on the next payment slip.
          admissionFeeCharged: !!(admissionRow && rows.length > 0),
          ageGroup: latest.ageGroup || '',
          session: latest.session || '',
          month: latest.month,
          fee: Number(latest.fee) || 0,
          feeDate: latest.feeDate || '',
          status: latest.status || 'UNPAID',
          payments: rows.map(toPayment)
        });
        result.studentsCreated++;
        result.paymentsAdded += rows.length;
      }
    }

    // ── Expenses: matched on title + month + amount ──
    for (const row of expenseRows) {
      const title = String(row.title || '').trim();
      if (!title) continue;

      const existing = await Expense.findOne({
        title: new RegExp(`^${escapeRegex(title)}$`, 'i'),
        month: row.month,
        amount: Number(row.amount) || 0,
        ...ownerFilter
      });

      if (existing) {
        existing.category = row.category || existing.category;
        if (row.date) existing.date = row.date;
        if (row.description) existing.description = row.description;
        if (!existing.ownerId) existing.ownerId = tenantId;
        await existing.save();
        result.expensesUpdated++;
      } else {
        await Expense.create({
          ownerId: tenantId,
          title,
          amount: Number(row.amount) || 0,
          category: row.category || 'Other',
          date: row.date || '',
          month: row.month,
          description: row.description || ''
        });
        result.expensesCreated++;
      }
    }

    // ── Stock: current inventory levels — matched on item + category, this
    // is a snapshot restore, so a match overwrites qty/cost/condition ──
    for (const row of stockRows) {
      const item = String(row.item || '').trim();
      if (!item) continue;
      const category = String(row.category || '').trim() || 'Other';

      const existing = await Stock.findOne({
        item: new RegExp(`^${escapeRegex(item)}$`, 'i'),
        category: new RegExp(`^${escapeRegex(category)}$`, 'i'),
        ...ownerFilter
      });

      if (existing) {
        existing.qty = Number(row.qty) || 0;
        existing.unitCost = Number(row.unitCost) || 0;
        existing.condition = row.condition || existing.condition;
        existing.lastUpdated = row.lastUpdated || existing.lastUpdated;
        if (!existing.ownerId) existing.ownerId = tenantId;
        await existing.save();
        result.stockUpdated++;
      } else {
        await Stock.create({
          ownerId: tenantId,
          item,
          category,
          qty: Number(row.qty) || 0,
          unitCost: Number(row.unitCost) || 0,
          condition: row.condition || 'New',
          lastUpdated: row.lastUpdated || ''
        });
        result.stockCreated++;
      }
    }

    // ── Stock Transactions: historical log entries — matched on
    // item+date+type+qty+amount so re-importing the same backup never
    // duplicates the same transaction twice ──
    for (const row of stockTxRows) {
      const item = String(row.item || '').trim();
      if (!item || !row.date) continue;

      const existing = await StockTransaction.findOne({
        item: new RegExp(`^${escapeRegex(item)}$`, 'i'),
        date: row.date,
        type: row.type || 'PURCHASE',
        qty: Number(row.qty) || 0,
        amount: Number(row.amount) || 0,
        ...ownerFilter
      });

      if (existing) {
        result.stockTransactionsSkipped++;
      } else {
        await StockTransaction.create({
          ownerId: tenantId,
          item,
          category: row.category || '',
          type: row.type || 'PURCHASE',
          qty: Number(row.qty) || 0,
          unitPrice: Number(row.unitPrice) || 0,
          amount: Number(row.amount) || 0,
          cash: Number(row.cash) || 0,
          date: row.date,
          notes: row.notes || ''
        });
        result.stockTransactionsCreated++;
      }
    }

    // ── Bookings: matched on team + date + start time + ground ──
    for (const row of bookingRows) {
      if (!row.date) continue;
      const teamName = String(row.teamName || '').trim();

      const existing = await Booking.findOne({
        teamName: new RegExp(`^${escapeRegex(teamName)}$`, 'i'),
        date: row.date,
        startTime: row.startTime || '',
        ground: row.ground || 'CRICKET',
        ...ownerFilter
      });

      if (existing) {
        existing.contact = row.contact || existing.contact;
        existing.endTime = row.endTime || existing.endTime;
        existing.duration = Number(row.duration) || existing.duration;
        existing.durationMins = Number(row.durationMins) || existing.durationMins;
        existing.amount = Number(row.amount) || existing.amount;
        existing.amountPaid = Number(row.amountPaid) || existing.amountPaid;
        existing.status = row.status || existing.status;
        existing.paymentMethod = row.paymentMethod || existing.paymentMethod;
        existing.paymentDate = row.paymentDate || existing.paymentDate;
        existing.notes = row.notes || existing.notes;
        if (!existing.ownerId) existing.ownerId = tenantId;
        await existing.save();
        result.bookingsUpdated++;
      } else {
        await Booking.create({
          ownerId: tenantId,
          teamName,
          contact: row.contact || '',
          ground: row.ground || 'CRICKET',
          date: row.date,
          paymentDate: row.paymentDate || '',
          startTime: row.startTime || '',
          endTime: row.endTime || '',
          duration: Number(row.duration) || 1,
          durationMins: Number(row.durationMins) || 0,
          amount: Number(row.amount) || 0,
          amountPaid: Number(row.amountPaid) || 0,
          status: row.status || 'CONFIRMED',
          paymentMethod: row.paymentMethod || 'Cash',
          notes: row.notes || ''
        });
        result.bookingsCreated++;
      }
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}