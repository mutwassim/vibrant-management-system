// Client-side helpers for the Excel / CSV bulk import feature.
// SheetJS ("xlsx") is imported dynamically so it is only downloaded by the
// browser when the user actually opens the Import modal.

import { normalizePhone, isValidPhone } from './phone';

const MONTH_WORDS = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12'
};

const pad = (n) => String(n).padStart(2, '0');
const localTodayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// "Fee Date", "fee_date", "FEE-DATE" -> "feedate"
const normHeader = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const STUDENT_ALIASES = {
  name:     ['name', 'studentname', 'student', 'fullname', 'playername'],
  guardian: ['guardian', 'guardianname', 'father', 'fathername', 'parent', 'parentname'],
  contact:  ['contact', 'contactnumber', 'contactno', 'phone', 'phoneno', 'phonenumber', 'mobile', 'mobileno', 'cell', 'cellno', 'number'],
  contact2: ['contact2', 'contactnumber2', 'contactno2', 'phone2', 'mobile2', 'number2', 'secondcontact', 'secondarycontact', 'alternatecontact', 'alternatenumber', 'altcontact', 'emergencycontact', 'emergencynumber', 'othernumber'],
  ageGroup: ['agegroup', 'age', 'group', 'category'],
  session:  ['session', 'timing', 'shift', 'batch'],
  admissionFee:    ['admissionfee', 'registrationfee', 'admissioncharges', 'admission', 'registration', 'regfee'],
  admissionDate:   ['admissiondate', 'registrationdate', 'joindate', 'joiningdate', 'doj', 'dateofjoining'],
  admissionStatus: ['admissionstatus', 'admissionfeestatus', 'registrationstatus'],
  month:    ['month', 'feemonth', 'monthyear', 'period'],
  fee:      ['fee', 'fees', 'amount', 'feeamount', 'paidamount', 'amountpaid'],
  feeDate:  ['feedate', 'date', 'paymentdate', 'paiddate', 'datepaid', 'depositdate'],
  status:   ['status', 'feestatus', 'paymentstatus'],
  method:   ['method', 'paymentmethod', 'mode', 'paymentmode'],
  cashAmount:   ['cashamount', 'cash'],
  onlineAmount: ['onlineamount', 'online'],
  notes:    ['notes', 'note', 'remarks', 'remark', 'comment', 'comments']
};

const EXPENSE_ALIASES = {
  title:       ['title', 'expense', 'expensetitle', 'expensename', 'item', 'particulars', 'head', 'name'],
  amount:      ['amount', 'cost', 'price', 'value', 'total', 'paid'],
  category:    ['category', 'type', 'expensetype', 'expensecategory'],
  date:        ['date', 'expensedate', 'paiddate', 'paymentdate'],
  month:       ['month', 'expensemonth', 'monthyear', 'period'],
  description: ['description', 'details', 'detail', 'notes', 'note', 'remarks', 'remark', 'comment', 'comments']
};

const STOCK_ALIASES = {
  item:        ['item', 'itemname', 'stockitem', 'product', 'productname', 'name'],
  category:    ['category', 'type', 'stockcategory'],
  qty:         ['qty', 'quantity', 'stock', 'stockqty', 'count'],
  unitCost:    ['unitcost', 'cost', 'costperunit', 'price', 'unitprice'],
  condition:   ['condition', 'itemcondition', 'state'],
  lastUpdated: ['lastupdated', 'updated', 'updateddate', 'date']
};

const STOCKTX_ALIASES = {
  item:      ['item', 'itemname', 'stockitem', 'product', 'productname'],
  category:  ['category', 'type', 'stockcategory'],
  type:      ['transactiontype', 'txtype', 'movementtype', 'type'],
  qty:       ['qty', 'quantity', 'count'],
  unitPrice: ['unitprice', 'priceperunit', 'rate'],
  amount:    ['amount', 'total', 'totalamount', 'value'],
  cash:      ['cash', 'cashamount', 'cashreceived'],
  date:      ['date', 'transactiondate', 'txdate'],
  notes:     ['notes', 'note', 'remarks', 'remark', 'comment', 'comments']
};

const BOOKING_ALIASES = {
  teamName:      ['teamclient', 'team', 'teamname', 'client', 'clientname', 'customer', 'customername', 'name'],
  contact:       ['contact', 'contactnumber', 'contactno', 'phone', 'phoneno', 'mobile', 'mobileno'],
  ground:        ['ground', 'groundtype', 'venue'],
  date:          ['date', 'bookingdate'],
  paymentDate:   ['paymentdate', 'paiddate', 'datepaid'],
  startTime:     ['starttime', 'from', 'timefrom'],
  endTime:       ['endtime', 'to', 'timeto'],
  duration:      ['durationhrs', 'duration', 'hours', 'durationhours'],
  durationMins:  ['durationmins', 'durationminutes', 'minutes', 'mins'],
  amount:        ['amount', 'totalamount', 'total', 'bookingamount'],
  amountPaid:    ['amountpaid', 'paid', 'paidamount'],
  status:        ['status', 'bookingstatus'],
  paymentMethod: ['paymentmethod', 'method', 'mode', 'paymentmode'],
  notes:         ['notes', 'note', 'remarks', 'remark', 'comment', 'comments']
};

const STATUS_MAP = {
  paid: 'PAID', p: 'PAID', yes: 'PAID', y: 'PAID', done: 'PAID', clear: 'PAID', cleared: 'PAID',
  unpaid: 'UNPAID', u: 'UNPAID', no: 'UNPAID', n: 'UNPAID', pending: 'UNPAID', due: 'UNPAID', notpaid: 'UNPAID',
  freeze: 'FREEZE', frozen: 'FREEZE', hold: 'FREEZE',
  defaulter: 'DEFAULTER', default: 'DEFAULTER',
  left: 'LEFT', quit: 'LEFT', inactive: 'LEFT',
  sponsored: 'SPONSORED', sponsor: 'SPONSORED', free: 'SPONSORED', scholarship: 'SPONSORED'
};

const AGE_GROUPS = ['Kids', 'U-8', 'U-10', 'U-12', 'U-14', 'U-16', 'U-18', 'U-20', 'Girls'];
const SESSIONS = ['Weekends', 'Weekdays', 'Both'];
const EXPENSE_CATEGORIES = ['Salaries', 'Equipment', 'Maintenance', 'Transport', 'Utilities', 'Marketing', 'Other'];

// ── Value normalizers ────────────────────────────────────

// Excel stores dates as a serial number counting days from 1899-12-30.
const fromExcelSerial = (num) => {
  const ms = Math.round((Number(num) - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d)) return '';
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

// Anything -> "YYYY-MM-DD" (or '' when it can't be understood).
// Ambiguous numeric dates like 05/03/2026 are read as DD/MM/YYYY (Pakistan format).
export function normalizeDate(v) {
  if (v === null || v === undefined || v === '') return '';

  if (v instanceof Date) {
    if (isNaN(v)) return '';
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'number') return fromExcelSerial(v);

  const s = String(v).trim();
  if (!s) return '';

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    let y = m[3];
    if (y.length === 2) y = (Number(y) < 50 ? '20' : '19') + y;
    let day = a;
    let mo = b;
    if (b > 12 && a <= 12) { day = b; mo = a; } // clearly MM/DD/YYYY
    if (mo < 1 || mo > 12 || day < 1 || day > 31) return '';
    return `${y}-${pad(mo)}-${pad(day)}`;
  }

  // "5 Jan 2026", "Jan 5, 2026", "5-Jan-26" …
  const parsed = new Date(s);
  if (!isNaN(parsed)) {
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }
  return '';
}

// Anything -> "YYYY-MM" (or '' when it can't be understood).
export function normalizeMonth(v) {
  if (v === null || v === undefined || v === '') return '';

  if (v instanceof Date) {
    if (isNaN(v)) return '';
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}`;
  }
  if (typeof v === 'number') return fromExcelSerial(v).slice(0, 7);

  const s = String(v).trim();
  if (!s) return '';

  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) {
    const mo = Number(m[2]);
    return mo >= 1 && mo <= 12 ? `${m[1]}-${pad(mo)}` : '';
  }

  // "Jan 2026", "January-26", "2026 Jan"
  const lower = s.toLowerCase();
  const word = Object.keys(MONTH_WORDS)
    .sort((a, b) => b.length - a.length)
    .find((w) => new RegExp(`\\b${w}\\b`).test(lower));
  if (word) {
    const yr = lower.match(/\b(19|20)\d{2}\b/);
    if (yr) return `${yr[0]}-${MONTH_WORDS[word]}`;
    const yr2 = lower.match(/\b(\d{2})\b(?!.*\b(19|20)\d{2}\b)/);
    if (yr2) return `${(Number(yr2[1]) < 50 ? '20' : '19') + yr2[1]}-${MONTH_WORDS[word]}`;
    return '';
  }

  // "03/2026" or "3-2026"
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const mo = Number(m[1]);
    return mo >= 1 && mo <= 12 ? `${m[2]}-${pad(mo)}` : '';
  }

  return normalizeDate(s).slice(0, 7);
}

export function normalizeAmount(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  // handles "Rs. 5,500/-", "PKR 5500", "5,500" etc. — take the first real
  // number, ignoring any currency text around it.
  const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return 0;
  const num = parseFloat(m[0]);
  return isNaN(num) ? 0 : num;
}

export function normalizeStatus(v, fee) {
  const key = String(v || '').toLowerCase().replace(/[^a-z]/g, '');
  if (STATUS_MAP[key]) return STATUS_MAP[key];
  // Blank status on a historical row: a fee amount implies it was collected.
  return Number(fee) > 0 ? 'PAID' : 'UNPAID';
}

const matchFromList = (v, list, fallback) => {
  const s = String(v || '').trim();
  if (!s) return fallback;
  const key = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hit = list.find((x) => x.toLowerCase().replace(/[^a-z0-9]/g, '') === key);
  return hit || s; // unknown values are kept as-is rather than dropped
};

// ── Sheet reading ────────────────────────────────────────

// Builds { field -> actual header } for a row object using the alias table.
function buildFieldMap(headers, aliases) {
  const map = {};
  const used = new Set();
  for (const [field, names] of Object.entries(aliases)) {
    for (const name of names) {
      const hit = headers.find((h) => normHeader(h) === name && !used.has(h));
      if (hit) {
        map[field] = hit;
        used.add(hit);
        break;
      }
    }
  }
  return map;
}

function scoreSheet(headers, aliases) {
  const map = buildFieldMap(headers, aliases);
  return Object.keys(map).length;
}

export function detectSheetType(sheetName, headers) {
  const n = String(sheetName || '').toLowerCase();
  if (n.includes('student') || n.includes('fee')) return 'students';
  if (n.includes('expense') || n.includes('kharch')) return 'expenses';
  if (n.includes('transaction')) return 'stockTransactions';
  if (n.includes('stock') || n.includes('inventory')) return 'stock';
  if (n.includes('booking') || n.includes('ground')) return 'bookings';

  const hSet = headers.map(normHeader);
  const looksLikeStudent = hSet.includes('name') || hSet.includes('studentname');
  const looksLikeExpense = hSet.includes('title') || hSet.includes('particulars') || hSet.includes('expense');

  if (looksLikeExpense && !looksLikeStudent) return 'expenses';
  if (looksLikeStudent && !looksLikeExpense) return 'students';

  const scores = {
    students: scoreSheet(headers, STUDENT_ALIASES),
    expenses: scoreSheet(headers, EXPENSE_ALIASES),
    stock: scoreSheet(headers, STOCK_ALIASES),
    stockTransactions: scoreSheet(headers, STOCKTX_ALIASES),
    bookings: scoreSheet(headers, BOOKING_ALIASES)
  };
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : 'unknown';
}

function readStudentRows(rows, headers, sheetName, out) {
  const map = buildFieldMap(headers, STUDENT_ALIASES);
  if (!map.name) {
    out.errors.push(`Sheet "${sheetName}": no student Name column found.`);
    return;
  }

  rows.forEach((row, i) => {
    const rowNo = i + 2; // +1 for header row, +1 because spreadsheets are 1-indexed
    const get = (f) => (map[f] ? row[map[f]] : undefined);

    const name = String(get('name') ?? '').trim();
    if (!name) return; // silently skip blank filler rows

    const month = normalizeMonth(get('month'));
    if (!month) {
      out.errors.push(`Sheet "${sheetName}" row ${rowNo} (${name}): month missing or unreadable — row skipped.`);
      return;
    }

    const fee = normalizeAmount(get('fee'));
    const admissionFee = normalizeAmount(get('admissionFee'));

    // Numbers are cleaned (Excel often eats the leading zero) and anything that
    // still doesn't look like a real mobile is flagged — the row is kept, since
    // the fee history matters more than the phone.
    const contact = normalizePhone(get('contact'));
    const contact2 = normalizePhone(get('contact2'));
    if (contact && !isValidPhone(contact)) {
      out.errors.push(`Sheet "${sheetName}" row ${rowNo} (${name}): contact "${contact}" is not a valid number — imported as-is, fix it later.`);
    }
    if (contact2 && !isValidPhone(contact2)) {
      out.errors.push(`Sheet "${sheetName}" row ${rowNo} (${name}): contact 2 "${contact2}" is not a valid number — imported as-is, fix it later.`);
    }

    out.students.push({
      name,
      guardian: String(get('guardian') ?? '').trim(),
      contact,
      contact2,
      ageGroup: matchFromList(get('ageGroup'), AGE_GROUPS, ''),
      session: matchFromList(get('session'), SESSIONS, ''),
      admissionFee: admissionFee,
      admissionDate: normalizeDate(get('admissionDate')),
      admissionFeeStatus: normalizeStatus(get('admissionStatus'), admissionFee),
      month,
      fee,
      feeDate: normalizeDate(get('feeDate')) || `${month}-01`,
      status: normalizeStatus(get('status'), fee),
      method: String(get('method') ?? '').trim() || 'Cash',
      cashAmount: normalizeAmount(get('cashAmount')),
      onlineAmount: normalizeAmount(get('onlineAmount')),
      notes: String(get('notes') ?? '').trim() || 'Imported from Excel'
    });
  });
}

function readExpenseRows(rows, headers, sheetName, out) {
  const map = buildFieldMap(headers, EXPENSE_ALIASES);
  if (!map.title && !map.amount) {
    out.errors.push(`Sheet "${sheetName}": no expense Title/Amount columns found.`);
    return;
  }

  rows.forEach((row, i) => {
    const rowNo = i + 2;
    const get = (f) => (map[f] ? row[map[f]] : undefined);

    const title = String(get('title') ?? '').trim();
    const amount = normalizeAmount(get('amount'));
    if (!title && !amount) return;

    if (!title) {
      out.errors.push(`Sheet "${sheetName}" row ${rowNo}: title missing — row skipped.`);
      return;
    }

    const date = normalizeDate(get('date'));
    const month = normalizeMonth(get('month')) || date.slice(0, 7);
    if (!month) {
      out.errors.push(`Sheet "${sheetName}" row ${rowNo} (${title}): date/month missing or unreadable — row skipped.`);
      return;
    }

    out.expenses.push({
      title,
      amount,
      category: matchFromList(get('category'), EXPENSE_CATEGORIES, 'Other'),
      date: date || `${month}-01`,
      month,
      description: String(get('description') ?? '').trim()
    });
  });
}

function readStockRows(rows, headers, sheetName, out) {
  const map = buildFieldMap(headers, STOCK_ALIASES);
  if (!map.item) {
    out.errors.push(`Sheet "${sheetName}": no stock Item column found.`);
    return;
  }

  rows.forEach((row, i) => {
    const rowNo = i + 2;
    const get = (f) => (map[f] ? row[map[f]] : undefined);

    const item = String(get('item') ?? '').trim();
    if (!item) return; // silently skip blank filler rows

    out.stock.push({
      item,
      category: String(get('category') ?? '').trim() || 'Other',
      qty: normalizeAmount(get('qty')),
      unitCost: normalizeAmount(get('unitCost')),
      condition: String(get('condition') ?? '').trim() || 'New',
      lastUpdated: normalizeDate(get('lastUpdated')) || localTodayISO()
    });
  });
}

function readStockTransactionRows(rows, headers, sheetName, out) {
  const map = buildFieldMap(headers, STOCKTX_ALIASES);
  if (!map.item) {
    out.errors.push(`Sheet "${sheetName}": no stock transaction Item column found.`);
    return;
  }

  rows.forEach((row, i) => {
    const rowNo = i + 2;
    const get = (f) => (map[f] ? row[map[f]] : undefined);

    const item = String(get('item') ?? '').trim();
    if (!item) return;

    const date = normalizeDate(get('date'));
    if (!date) {
      out.errors.push(`Sheet "${sheetName}" row ${rowNo} (${item}): date missing or unreadable — row skipped.`);
      return;
    }

    out.stockTransactions.push({
      item,
      category: String(get('category') ?? '').trim() || '',
      type: matchFromList(get('type'), ['PURCHASE', 'SALE'], 'PURCHASE').toUpperCase(),
      qty: normalizeAmount(get('qty')),
      unitPrice: normalizeAmount(get('unitPrice')),
      amount: normalizeAmount(get('amount')),
      cash: normalizeAmount(get('cash')),
      date,
      notes: String(get('notes') ?? '').trim()
    });
  });
}

function readBookingRows(rows, headers, sheetName, out) {
  const map = buildFieldMap(headers, BOOKING_ALIASES);
  if (!map.teamName && !map.date) {
    out.errors.push(`Sheet "${sheetName}": no booking Team/Date columns found.`);
    return;
  }

  rows.forEach((row, i) => {
    const rowNo = i + 2;
    const get = (f) => (map[f] ? row[map[f]] : undefined);

    const teamName = String(get('teamName') ?? '').trim();
    const date = normalizeDate(get('date'));
    if (!teamName && !date) return; // silently skip blank filler rows
    if (!date) {
      out.errors.push(`Sheet "${sheetName}" row ${rowNo} (${teamName || 'unnamed'}): date missing or unreadable — row skipped.`);
      return;
    }

    out.bookings.push({
      teamName,
      contact: normalizePhone(get('contact')),
      ground: matchFromList(get('ground'), ['CRICKET', 'FOOTBALL'], 'CRICKET').toUpperCase(),
      date,
      paymentDate: normalizeDate(get('paymentDate')),
      startTime: String(get('startTime') ?? '').trim(),
      endTime: String(get('endTime') ?? '').trim(),
      duration: normalizeAmount(get('duration')) || 1,
      durationMins: normalizeAmount(get('durationMins')),
      amount: normalizeAmount(get('amount')),
      amountPaid: normalizeAmount(get('amountPaid')),
      status: matchFromList(get('status'), ['PENDING', 'CONFIRMED', 'FINISHED', 'CANCELLED'], 'CONFIRMED').toUpperCase(),
      paymentMethod: String(get('paymentMethod') ?? '').trim() || 'Cash',
      notes: String(get('notes') ?? '').trim()
    });
  });
}

/**
 * Parses an uploaded .xlsx / .xls / .csv file.
 * @param {File} file
 * @param {'auto'|'students'|'expenses'} forcedType  what a single-sheet file should be treated as
 * @returns {Promise<{students: Array, expenses: Array, errors: string[], sheets: Array}>}
 */
export async function parseImportFile(file, forcedType = 'auto') {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { cellDates: true });

  const out = { students: [], expenses: [], stock: [], stockTransactions: [], bookings: [], errors: [], sheets: [] };
  const readers = {
    students: readStudentRows,
    expenses: readExpenseRows,
    stock: readStockRows,
    stockTransactions: readStockTransactionRows,
    bookings: readBookingRows
  };

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, cellDates: true });
    if (!rows.length) continue;

    const headers = Object.keys(rows[0]);
    let type = forcedType === 'auto' ? detectSheetType(sheetName, headers) : forcedType;

    // With multiple sheets, an explicit override only applies to sheets we
    // can't confidently identify on our own.
    if (forcedType !== 'auto' && wb.SheetNames.length > 1) {
      const detected = detectSheetType(sheetName, headers);
      if (detected !== 'unknown') type = detected;
    }

    if (type === 'unknown' || !readers[type]) {
      out.errors.push(`Sheet "${sheetName}": couldn't tell what kind of data this is — pick the type manually.`);
      continue;
    }

    const before = out[type].length;
    readers[type](rows, headers, sheetName, out);
    const after = out[type].length;

    out.sheets.push({ name: sheetName, type, rows: after - before });
  }

  if (!out.students.length && !out.expenses.length && !out.stock.length && !out.stockTransactions.length && !out.bookings.length && !out.errors.length) {
    out.errors.push('No usable rows found in this file.');
  }

  return out;
}

/** Downloads a ready-made .xlsx template with the exact columns the importer expects. */
export async function downloadImportTemplate() {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const students = XLSX.utils.aoa_to_sheet([
    ['Name', 'Guardian', 'Contact', 'Contact 2', 'Age Group', 'Session', 'Admission Fee', 'Admission Date', 'Month', 'Fee', 'Fee Date', 'Status', 'Method', 'Notes'],
    ['Muhammad Ali', 'Ahmed Ali', '03139832544', '03001234567', 'U-14', 'Weekends', 2000, '2026-05-03', '2026-05', 5500, '2026-05-03', 'PAID', 'Cash', 'Admission fee only on the joining row'],
    ['Muhammad Ali', 'Ahmed Ali', '03139832544', '', 'U-14', 'Weekends', '', '', '2026-06', 5500, '2026-06-05', 'PAID', 'Cash', 'One row per month per student'],
    ['Hassan Raza', 'Raza Khan', '03217654321', '', 'Kids', 'Weekdays', 2000, '2026-06-01', '2026-06', 4000, '', 'UNPAID', '', '']
  ]);
  students['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, students, 'Students');

  const expenses = XLSX.utils.aoa_to_sheet([
    ['Title', 'Amount', 'Category', 'Date', 'Month', 'Description'],
    ['Coach salaries', 45000, 'Salaries', '2026-05-01', '2026-05', 'May payroll'],
    ['Nets repair', 8000, 'Maintenance', '2026-05-14', '2026-05', ''],
    ['Electricity bill', 12500, 'Utilities', '2026-06-08', '2026-06', '']
  ]);
  expenses['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, expenses, 'Expenses');

  const stock = XLSX.utils.aoa_to_sheet([
    ['Item', 'Category', 'Qty', 'Unit Cost', 'Condition', 'Last Updated'],
    ['Cricket Bats', 'Equipment', 12, 1500, 'New', '2026-05-01'],
    ['Footballs', 'Equipment', 20, 800, 'Used', '2026-05-10']
  ]);
  stock['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, stock, 'Stock');

  const stockTx = XLSX.utils.aoa_to_sheet([
    ['Item', 'Category', 'Type', 'Qty', 'Unit Price', 'Amount', 'Cash', 'Date', 'Notes'],
    ['Cricket Bats', 'Equipment', 'PURCHASE', 10, 1500, 15000, 15000, '2026-05-01', 'Initial stock'],
    ['Footballs', 'Equipment', 'SALE', 2, 1000, 2000, 2000, '2026-05-15', 'Sold to walk-in customer']
  ]);
  stockTx['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, stockTx, 'Stock Transactions');

  const bookings = XLSX.utils.aoa_to_sheet([
    ['Team / Client', 'Contact', 'Ground', 'Date', 'Start Time', 'End Time', 'Duration (hrs)', 'Duration (mins)', 'Amount', 'Amount Paid', 'Status', 'Payment Method', 'Payment Date', 'Notes'],
    ['Falcons XI', '03001234567', 'CRICKET', '2026-05-10', '18:00', '20:00', 2, 0, 6000, 6000, 'FINISHED', 'Cash', '2026-05-10', ''],
    ['United FC', '03217654321', 'FOOTBALL', '2026-05-12', '19:00', '20:30', 0, 90, 3000, 1500, 'CONFIRMED', 'Online', '2026-05-11', 'Half advance paid']
  ]);
  bookings['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, bookings, 'Bookings');

  XLSX.writeFile(wb, 'AMS-Import-Template.xlsx');
}