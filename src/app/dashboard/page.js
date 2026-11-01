"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import './dashboard.css';
import ImportModal from '../../components/ImportModal';
import FootballBookings from '../../components/FootballBookings';
import ThemeSwitcher from '../../components/ThemeSwitcher';
import { normalizePhone, phoneError } from '../../lib/phone';
import html2canvas from 'html2canvas';

const ALL_ATTENDANCE_STATUSES = ['PAID', 'FREEZE', 'UNPAID', 'DEFAULTER', 'SPONSORED'];

const monthNames = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12'
};

const monthDisplayOptions = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

// "2026-07" -> "July 2026". Handles comma-joined multi-month strings
// ("2026-07, 2026-08") the same way. Anything unparseable is returned as-is.
const formatBillingMonth = (raw) => {
  if (!raw) return raw;
  return raw.split(',').map(part => {
    const trimmed = part.trim();
    const [year, mm] = trimmed.split('-');
    const label = monthDisplayOptions.find(m => m.value === mm)?.label;
    return label && year ? `${label} ${year}` : trimmed;
  }).join(', ');
};

const extractYear = (str) => {
  if (!str) return null;
  const s = String(str);
  const match4 = s.match(/\b(19|20)\d{2}\b/);
  if (match4) return match4[0];
  const match2 = s.match(/\b\d{2}$/);
  if (match2) {
    const yr = parseInt(match2[0]);
    if (yr >= 0 && yr <= 99) {
      return (yr < 50 ? '20' : '19') + String(yr).padStart(2, '0');
    }
  }
  const matchStart = s.match(/^(19|20)\d{2}/);
  if (matchStart) return matchStart[0];
  return null;
};

// Payment received on a booking (cricket or football) drives its status:
//   no payment yet -> PENDING, partial -> CONFIRMED, paid in full -> FINISHED.
// CANCELLED is never auto-computed — it's always a manual choice.
const computeBookingStatus = (amt, paid) => {
  const a = Number(amt) || 0;
  const p = Number(paid) || 0;
  if (p <= 0) return 'PENDING';
  if (a > 0 && p >= a) return 'FINISHED';
  return 'CONFIRMED';
};

// Bookings saved before "Amount Paid" existed have no such field. Treat a
// legacy CONFIRMED/FINISHED booking as fully paid so old revenue totals
// don't drop to zero just because the new field is missing.
const getBookingPaid = (b) => {
  if (b.amountPaid !== undefined && b.amountPaid !== null && b.amountPaid !== '') return Number(b.amountPaid) || 0;
  return (b.status === 'CONFIRMED' || b.status === 'FINISHED') ? (Number(b.amount) || 0) : 0;
};

const extractMonth = (str) => {
  if (!str) return null;
  const s = String(str).toLowerCase();
  const standardMatch = s.match(/\b\d{4}-(0[1-9]|1[0-2])\b/);
  if (standardMatch) return standardMatch[1];
  for (const [name, num] of Object.entries(monthNames)) {
    if (s.includes(name)) {
      return num;
    }
  }
  return null;
};

// Columns on the printed attendance sheet — one box per day of the week.
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STOCK_CATEGORIES = [
  'Bats',
  'Balls',
  // Kits are listed smallest to largest so the dropdown reads in size order.
  'Kit (5XS)',
  'Kit (4XS)',
  'Kit (3XS)',
  'Kit (2XS)',
  'Kit (XS)',
  'Kit (Small)',
  'Kit (Medium)',
  'Kit (Large)',
  'Kit (X Large)',
  'Kit (XX Large)',
  'Gloves',
  'Pads',
  'Helmets',
  'Cones',
  'Nets',
  'Other'
];

const matchYearMonthDay = (str, selectedYear, selectedMonth, selectedDay) => {
  // selectedDay can be a single day string ('05') or an array of them
  // (['05', '12']) for filters that let the admin pick more than one day
  // at once — a match against ANY day in the array counts.
  const dayList = Array.isArray(selectedDay) ? selectedDay.filter(Boolean) : (selectedDay ? [selectedDay] : []);
  if (!str) return !selectedYear && !selectedMonth && dayList.length === 0;
  const s = String(str);
  if (selectedYear) {
    const yr = extractYear(s);
    if (yr !== selectedYear) return false;
  }
  if (selectedMonth) {
    const mo = extractMonth(s);
    if (mo !== selectedMonth) return false;
  }
  if (dayList.length > 0) {
    const standardMatch = s.match(/^\d{4}-\d{2}-(\d{2})/);
    if (standardMatch) {
      if (!dayList.includes(standardMatch[1])) return false;
    } else {
      const numberMatch = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
      if (numberMatch) {
        const dayVal = String(numberMatch[1]).padStart(2, '0');
        if (!dayList.includes(dayVal)) return false;
      } else {
        return false;
      }
    }
  }
  return true;
};

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');
  // "Ground Bookings" is just a heading — it opens the two grounds below it.
  const [groundMenuOpen, setGroundMenuOpen] = useState(false);
  // The heading itself is never highlighted — only the open ground is.
  // Students and Attendance (a filtered view of Students, not a separate
  // module) are available on every plan. These three require ENTERPRISE.
  const ENTERPRISE_ONLY_PAGES = ['expenses', 'stock', 'bookings', 'football'];
  const isEnterprise = currentUser?.role === 'SUPER_ADMIN' || currentUser?.subscriptionPlan === 'ENTERPRISE';

  const goToPage = (page) => {
    if (ENTERPRISE_ONLY_PAGES.includes(page) && !isEnterprise) {
      triggerToast('This feature requires the Enterprise plan. Contact the Super Admin to upgrade.', '#ff3b5c');
      return;
    }
    setActivePage(page);
  };
  const [darkMode, setDarkMode] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  // Keeps the shared theme-accent CSS variables (used by ThemeSwitcher's
  // popover) in sync with the dashboard's own dark-mode setting, so the
  // popover doesn't render in the wrong mode relative to the page around it.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Core Data State (DB)
  const [db, setDb] = useState({
    students: [],
    expenses: [],
    stock: [],
    stockTransactions: [],
    bookings: []
  });
  const [loading, setLoading] = useState(true);

  // Settings / Profile State
  const [academySettings, setAcademySettings] = useState({
    name: 'AMS',
    tagline: 'Academy Manager',
    phone: '',
    email: '',
    website: '',
    address: '',
    logo: ''
  });

  // Toast notifications
  const [toastMsg, setToastMsg] = useState('');
  const [toastBg, setToastBg] = useState('#0d1b2e');
  const [toastShow, setToastShow] = useState(false);

  const triggerToast = (msg, bg = '#0d1b2e') => {
    setToastMsg(msg);
    setToastBg(bg);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 2800);
  };

  const getHeaders = () => {
    const token = localStorage.getItem('ams_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const logout = () => {
    localStorage.removeItem('ams_token');
    localStorage.removeItem('ams_user');
    // Clear DOM state that lives on <body>, which survives client-side
    // navigation and would otherwise leak into whichever account logs in next.
    document.body.classList.remove('dark-mode');
    router.replace('/login');
  };

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // ── Date and helper calculations ───────────────────────
  const getPKRDate = () => {
    // Current date/time shifted to Pakistan Standard Time (PKT = UTC+5).
    // Date.now() is always a pure UTC epoch timestamp regardless of the
    // device's own timezone, so we only need to add the fixed +5 hour PKT
    // offset here — we must NOT also add the device's own
    // getTimezoneOffset(), since that offset has nothing to do with
    // Pakistan and was cancelling out the +5 hour shift (or worse) on any
    // device not already set to UTC+0, which caused "today" to read as
    // yesterday for users actually in Pakistan between 12:00 AM-4:59 AM PKT.
    const nowUtcMs = Date.now();
    return new Date(nowUtcMs + (3600000 * 5));
  };

  const localToday = () => {
    const pkr = getPKRDate();
    return pkr.toISOString().slice(0, 10);
  };

  const localMonth = () => {
    const pkr = getPKRDate();
    return pkr.toISOString().slice(0, 7); // "YYYY-MM"
  };

  // Dashboard Filters
  const [dashYear, setDashYear] = useState(() => localToday().slice(0, 4));
  const [dashMonth, setDashMonth] = useState(() => localToday().slice(0, 7));
  // Array so more than one day can be picked at once (e.g. compare the 5th
  // and the 20th together) — matchYearMonthDay treats it as "match any of
  // these days".
  const [dashDay, setDashDay] = useState(() => [localToday().slice(8, 10)]);
  const [dashDayPickerOpen, setDashDayPickerOpen] = useState(false);

  // Students Page state
  const [studentSearch, setStudentSearch] = useState('');
  const [studentStatusFilter, setStudentStatusFilter] = useState('');
  const [studentAgeFilter, setStudentAgeFilter] = useState('');
  const [studentSessionFilter, setStudentSessionFilter] = useState('');
  const [studentYearFilter, setStudentYearFilter] = useState(() => localToday().slice(0, 4));
  const [studentMonthFilter, setStudentMonthFilter] = useState(() => localToday().slice(5, 7));
  const [studentDayFilter, setStudentDayFilter] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const studentsPerPage = 20;

  // Student Form Modal state
  const [importModalOpen, setImportModalOpen] = useState(false);

  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [sName, setSName] = useState('');
  const [sGuardian, setSGuardian] = useState('');
  const [sContact, setSContact] = useState('');
  const [sContact2, setSContact2] = useState('');
  const [sAdmissionFee, setSAdmissionFee] = useState('');
  const [sAdmissionDate, setSAdmissionDate] = useState('');
  const [sAdmissionStatus, setSAdmissionStatus] = useState('PAID');
  const [sAdmissionMethod, setSAdmissionMethod] = useState('Cash');
  const [sMethod, setSMethod] = useState('Cash');
  const [sSplitPayment, setSSplitPayment] = useState(false);
  const [sCashAmount, setSCashAmount] = useState('');
  const [sOnlineAmount, setSOnlineAmount] = useState('');
  const [sAge, setSAge] = useState('Kids');
  const [sSession, setSSession] = useState('Weekends');
  const [sMonth, setSMonth] = useState('');
  const [sFee, setSFee] = useState(0);
  const [sFeeDate, setSFeeDate] = useState('');
  const [sStatus, setSStatus] = useState('UNPAID');
  // How much of the fee was actually received right now — if it's less than
  // the fee, this is a half/partial payment and status auto-switches to
  // PENDING; the rest can be added later from Record Payment.
  const [sAmountPaid, setSAmountPaid] = useState('');
  // When checked, saving keeps the modal open with guardian/contact/fee/
  // payment details intact and only clears the name — so a parent's next
  // child can be added right away instead of retyping everything from
  // scratch as a separate "Add Student" action. sTotalChildren says exactly
  // how many are coming (set once, up front), so the last one is detected
  // automatically instead of relying on the admin remembering to uncheck
  // the box themselves.
  const [sAddAnotherSibling, setSAddAnotherSibling] = useState(false);
  const [sTotalChildren, setSTotalChildren] = useState(2);
  // Children added this batch whose receipt is still waiting to be shown —
  // held here so the whole family gets ONE combined slip after the last
  // child, instead of one slip popping up per child.
  const [sPendingSiblings, setSPendingSiblings] = useState([]);

  // Payments / Receipt Modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [pStudentNameInput, setPStudentNameInput] = useState('');
  const [pStudentSelectedId, setPStudentSelectedId] = useState('');
  // Multiple children can be paid together when they share a guardian.
  const [pStudentSelectedIds, setPStudentSelectedIds] = useState([]);
  const [pStudentSelectedText, setPStudentSelectedText] = useState('');
  const [pStudentDropdownOpen, setPStudentDropdownOpen] = useState(false);
  const [pAmount, setPAmount] = useState('');
  // Per-student overrides used when a guardian's whole family is selected —
  // siblings can have different fees and/or different sessions, so each
  // child keeps their own amount/session instead of one shared value.
  const [pStudentAmounts, setPStudentAmounts] = useState({}); // { studentId: '5500' }
  const [pStudentSessions, setPStudentSessions] = useState({}); // { studentId: 'Weekends' }
  const [pMonths, setPMonths] = useState([]); // multiple months selected for one payment
  const [pMonthPickerOpen, setPMonthPickerOpen] = useState(false);
  const [pMonthPickerYear, setPMonthPickerYear] = useState(() => Number(localMonth().slice(0, 4)));
  const [pMonthPickerChecked, setPMonthPickerChecked] = useState([]); // draft selection while the picker is open
  const [pDate, setPDate] = useState('');
  const [pStatus, setPStatus] = useState('PAID');
  const [pMethod, setPMethod] = useState('Cash');
  // Half/partial payment support (single student, single month only): the
  // amount actually being received in THIS transaction. It's added on top
  // of whatever was already received for that student+month, and the status
  // is derived automatically — same idea as the ground booking PENDING /
  // CONFIRMED / FINISHED flow.
  const [pAmountReceived, setPAmountReceived] = useState('');
  // Split payment — one child pays part cash, part online, in the same
  // transaction. pStudentCashAmounts/pStudentOnlineAmounts hold each
  // child's own split when a family is selected, exactly like
  // pStudentAmounts/pStudentSessions above.
  const [pSplitPayment, setPSplitPayment] = useState(false);
  const [pCashAmount, setPCashAmount] = useState('');
  const [pOnlineAmount, setPOnlineAmount] = useState('');
  const [pStudentCashAmounts, setPStudentCashAmounts] = useState({});
  const [pStudentOnlineAmounts, setPStudentOnlineAmounts] = useState({});
  const [pNotes, setPNotes] = useState('');
  const [pSession, setPSession] = useState('Weekends');
  const [pReadmissionFee, setPReadmissionFee] = useState('');
  const [pReadmissionDate, setPReadmissionDate] = useState('');
  const [pReadmissionStatus, setPReadmissionStatus] = useState('PAID');
  const [pReadmissionMethod, setPReadmissionMethod] = useState('Cash');
  const [pShowReadmission, setPShowReadmission] = useState(false);

  // Payment History Modal state
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyStudent, setHistoryStudent] = useState(null);

  // Status Change Date Modal state
  const [statusDateModalOpen, setStatusDateModalOpen] = useState(false);
  const [statusDateTarget, setStatusDateTarget] = useState(null); // { studentId, paymentId, newStatus }
  const [statusDateInput, setStatusDateInput] = useState('');

  // Edit Payment: reuses the Record Payment modal itself, pre-filled from
  // the payment being corrected. When set, the modal is in "edit" mode and
  // Save sends a single PUT to this exact payment instead of creating one.
  const [editPaymentTarget, setEditPaymentTarget] = useState(null); // { studentId, paymentId }

  // Delete Student Modal state
  const [deleteStudentModalOpen, setDeleteStudentModalOpen] = useState(false);
  const [delSearchQuery, setDelSearchQuery] = useState('');
  const [delStudentDropdownOpen, setDelStudentDropdownOpen] = useState(false);
  // Multiple students can be queued up and deleted together in one go.
  const [delSelectedStudents, setDelSelectedStudents] = useState([]);

  // Carry Forward Month Modal state
  const [carryForwardModalOpen, setCarryForwardModalOpen] = useState(false);
  const [cfMonth, setCfMonth] = useState('');
  const [cfFromMonth, setCfFromMonth] = useState('');
  const [cfRunning, setCfRunning] = useState(false);

  // Receipt Slip Modal state
  const [slipModalOpen, setSlipModalOpen] = useState(false);
  const [slipData, setSlipData] = useState(null);
  const [slipSharing, setSlipSharing] = useState(false);
  const slipContentRef = useRef(null);

  // Expenses Page Filters
  const [expYearFilter, setExpYearFilter] = useState(() => localToday().slice(0, 4));
  const [expMonthFilter, setExpMonthFilter] = useState(() => localToday().slice(5, 7));
  const [expDayFilter, setExpDayFilter] = useState('');
  const [expCatFilter, setExpCatFilter] = useState('');

  // Expense Form Modal state
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [eTitle, setETitle] = useState('');
  const [eAmount, setEAmount] = useState('');
  const [eCategory, setECategory] = useState('Salaries');
  const [eDate, setEDate] = useState('');
  const [eDescription, setEDescription] = useState('');
  const [eMethod, setEMethod] = useState('Cash');

  // Stock / Inventory POS state
  const [stxYearFilter, setStxYearFilter] = useState(() => localToday().slice(0, 4));
  const [stxMonthFilter, setStxMonthFilter] = useState(() => localToday().slice(5, 7));
  const [stxDayFilter, setStxDayFilter] = useState('');
  const [stxTypeFilter, setStxTypeFilter] = useState('');

  // Stock Form Modal state
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stName, setStName] = useState('');
  const [stCategory, setStCategory] = useState('Bats');
  const [stQty, setStQty] = useState('');
  const [stCost, setStCost] = useState('');
  const [stCondition, setStCondition] = useState('New');

  // POS Sale picker and form state
  const [sellPickerOpen, setSellPickerOpen] = useState(false);
  const [spSelectedItemId, setSpSelectedItemId] = useState('');
  const [spCategory, setSpCategory] = useState('All');
  const [sellFormOpen, setSellFormOpen] = useState(false);
  const [slItem, setSlItem] = useState(null);
  const [slQty, setSlQty] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [slDate, setSlDate] = useState('');
  const [slNotes, setSlNotes] = useState('');

  // Attendance Page state
  const [attMonthFilter, setAttMonthFilter] = useState(localMonth);
  const [attSessionFilter, setAttSessionFilter] = useState('');
  const [attAgeFilter, setAttAgeFilter] = useState('');
  const [attStatusFilters, setAttStatusFilters] = useState(() => [...ALL_ATTENDANCE_STATUSES]); // multi-select: all selected = All Status
  const [attStatusPickerOpen, setAttStatusPickerOpen] = useState(false);
  // Filled in after mount, never during SSR: Node formats dates as 7/17/2026
  // while the browser uses 17/07/2026, and rendering that on the server caused
  // a hydration mismatch. Empty on the first render = server and client agree.
  const [printDateLabel, setPrintDateLabel] = useState('');

  // Bookings / Schedule state
  const [scheduleDate, setScheduleDate] = useState('');
  const [bkDateFilter, setBkDateFilter] = useState('');
  const [bkYearFilter, setBkYearFilter] = useState(() => localToday().slice(0, 4));
  const [bkMonthFilter, setBkMonthFilter] = useState(() => localToday().slice(5, 7));
  const [bkStatusFilter, setBkStatusFilter] = useState('');

  // Ground Hours Settings State (loaded from User details or default to 20:00 - 02:00,
  // i.e. 8:00 PM to 2:00 AM, matching the academy's actual overnight schedule)
  const [groundOpen, setGroundOpen] = useState(20);
  const [groundClose, setGroundClose] = useState(2);
  const [groundHoursModalOpen, setGroundHoursModalOpen] = useState(false);
  const [gsOpenVal, setGsOpenVal] = useState(20);
  const [gsCloseVal, setGsCloseVal] = useState(2);
  // The football pitch is a separate ground and keeps its own opening hours.
  const [fbOpen, setFbOpen] = useState(20);
  const [fbClose, setFbClose] = useState(2);
  const [gsFbOpenVal, setGsFbOpenVal] = useState(20);
  const [gsFbCloseVal, setGsFbCloseVal] = useState(2);

  // Booking Form Modal state
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState(null);
  const [bkTeam, setBkTeam] = useState('');
  const [bkContact, setBkContact] = useState('');
  const [bkDate, setBkDate] = useState('');
  const [bkStart, setBkStart] = useState('');
  const [bkDuration, setBkDuration] = useState('1');
  const [bkAmount, setBkAmount] = useState('');
  const [bkAmountPaid, setBkAmountPaid] = useState('');
  const [bkPaymentDate, setBkPaymentDate] = useState('');
  const [bkMethod, setBkMethod] = useState('Cash');
  // Split payment — part cash, part online, for the same cricket booking.
  const [bkSplitPayment, setBkSplitPayment] = useState(false);
  const [bkCashAmount, setBkCashAmount] = useState('');
  const [bkOnlineAmount, setBkOnlineAmount] = useState('');
  const [bkStatus, setBkStatus] = useState('CONFIRMED');
  const [bkNotes, setBkNotes] = useState('');
  const [bkConflictWarn, setBkConflictWarn] = useState('');

  // Booking Detail Modal state
  const [bookingDetailModalOpen, setBookingDetailModalOpen] = useState(false);
  const [bkDetail, setBkDetail] = useState(null);

  // Profile Form state
  const [profileName, setProfileName] = useState('');
  const [profileTagline, setProfileTagline] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileWebsite, setProfileWebsite] = useState('');
  const [profileAddress, setProfileAddress] = useState('');

  // Settings live on the account. These two helpers are the only path in and
  // out, so the server is always the source of truth.
  const applySettings = (st) => {
    if (!st) return;
    setAcademySettings(prev => ({
      ...prev,
      name: st.name || prev.name,
      tagline: st.tagline || prev.tagline,
      phone: st.phone ?? prev.phone,
      email: st.email ?? prev.email,
      website: st.website ?? prev.website,
      address: st.address ?? prev.address,
      logo: st.logo ?? prev.logo
    }));
    if (st.name !== undefined) setProfileName(st.name || '');
    if (st.tagline !== undefined) setProfileTagline(st.tagline || '');
    if (st.phone !== undefined) setProfilePhone(st.phone || '');
    if (st.email !== undefined) setProfileEmail(st.email || '');
    if (st.website !== undefined) setProfileWebsite(st.website || '');
    if (st.address !== undefined) setProfileAddress(st.address || '');
    if (st.groundOpen !== undefined) setGroundOpen(st.groundOpen);
    if (st.groundClose !== undefined) setGroundClose(st.groundClose);
    if (st.fbOpen !== undefined) setFbOpen(st.fbOpen);
    if (st.fbClose !== undefined) setFbClose(st.fbClose);
  };

  const saveSettingsToServer = async (patch) => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ settings: patch })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        triggerToast(data.error || 'Could not save settings to your account', '#ff3b5c');
        return false;
      }
      return true;
    } catch (err) {
      triggerToast(`Could not save settings: ${err.message}`, '#ff3b5c');
      return false;
    }
  };

  // ── ON INITIAL MOUNT ──────────────────────────────────
  useEffect(() => {
    setPrintDateLabel(new Date().toLocaleDateString('en-GB'));

    const token = localStorage.getItem('ams_token');
    const user = JSON.parse(localStorage.getItem('ams_user') || 'null');

    if (!token || !user || user.role !== 'ADMIN') {
      logout();
    } else {
      setCurrentUser(user);
      
      // Dark mode is a per-device choice, so it stays in this browser.
      const settingsKey = 'ams_settings_v1';
      try {
        const savedSettings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
        if (savedSettings.darkMode) {
          setDarkMode(true);
          document.body.classList.add('dark-mode');
        } else {
          // Without this, a dark-mode class set by a previous account on
          // this browser stays stuck on <body> after switching accounts,
          // because <body> persists across client-side navigation in
          // Next.js — only a full page refresh was clearing it before.
          setDarkMode(false);
          document.body.classList.remove('dark-mode');
        }
        setProfileName(user.academyName || '');

        // Everything else comes from the account. If this browser still holds
        // settings from the old localStorage-only version, push them up once so
        // nothing is lost, then never read them again.
        (async () => {
          try {
            const res = await fetch('/api/auth/me', {
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return;
            const me = await res.json();
            const serverSettings = me.settings || {};

            if (serverSettings.name) {
              applySettings(serverSettings);
            } else if (savedSettings.name) {
              const { darkMode, ...toMigrate } = savedSettings;
              applySettings(toMigrate);
              await fetch('/api/auth/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ settings: toMigrate })
              });
            } else {
              applySettings(serverSettings);
            }
          } catch (err) {
            // Offline or server hiccup — the app still works, settings just
            // show their defaults until the next load.
          }
        })();
      } catch (e) {
        console.error('Settings load error:', e);
      }

      setScheduleDate(localToday());
      setAttMonthFilter(localMonth());
      loadData(true);
    }
  }, []);

  // Fetch full data
  const loadData = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch('/api/data', { headers: getHeaders() });
      if (res.status === 401) {
        logout();
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setDb(data);
        // Keep the plan-gate live: if the Super Admin changes this admin's
        // plan while they're already logged in, the next data refresh
        // reflects it immediately instead of requiring them to log out and
        // back in for the sidebar locks to update.
        if (data.subscriptionPlan && currentUser && data.subscriptionPlan !== currentUser.subscriptionPlan) {
          setCurrentUser(prev => {
            const updated = { ...prev, subscriptionPlan: data.subscriptionPlan };
            localStorage.setItem('ams_user', JSON.stringify(updated));
            return updated;
          });
        }
      } else {
        triggerToast(data.error || 'Failed to load data', '#ff3b5c');
      }
    } catch (err) {
      triggerToast('Cannot reach server', '#ff3b5c');
    } finally {
      setLoading(false);
    }
  };

  // ── DARK MODE TOGGLE ──────────────────────────────────
  const toggleDarkMode = (checked) => {
    setDarkMode(checked);
    if (checked) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    const settingsKey = 'ams_settings_v1';
    const currentSettings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    currentSettings.darkMode = checked;
    localStorage.setItem(settingsKey, JSON.stringify(currentSettings));
  };

  // ── SAVE PROFILE BRANDING ──────────────────────────────
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const update = {
      name: profileName.trim(),
      tagline: profileTagline.trim(),
      phone: profilePhone.trim(),
      email: profileEmail.trim(),
      website: profileWebsite.trim(),
      address: profileAddress.trim(),
      logo: academySettings.logo
    };

    setAcademySettings(prev => ({ ...prev, ...update }));
    if (await saveSettingsToServer(update)) {
      triggerToast('Profile updated!', '#00a876');
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      triggerToast('Image too large (max 2MB)', '#ff3b5c');
      return;
    }
    const reader = new FileReader();
    reader.onload = async function (event) {
      const updatedLogo = event.target.result;
      setAcademySettings(prev => ({ ...prev, logo: updatedLogo }));
      if (await saveSettingsToServer({ logo: updatedLogo })) {
        triggerToast('Logo saved!', '#00a876');
      }
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = async () => {
    setAcademySettings(prev => ({ ...prev, logo: '' }));
    if (await saveSettingsToServer({ logo: '' })) {
      triggerToast('Logo removed', '#ff6b35');
    }
  };

  // Full data backup — one Excel file, every module on its own sheet.
  // The "Students" and "Expenses" sheets use the exact same column layout as
  // the Import feature (Students page → Import Excel), so this file can be
  // fed straight back in to restore students/expenses/payment history if
  // data is ever lost. Stock, Stock Transactions and Bookings sheets are
  // included for record-keeping but aren't re-importable yet.
  const [exportingData, setExportingData] = useState(false);
  const exportAllData = async () => {
    setExportingData(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Students — one row per month per student (same shape the importer expects)
      const studentRows = [[
        'Name', 'Guardian', 'Contact', 'Contact 2', 'Age Group', 'Session',
        'Admission Fee', 'Admission Date', 'Admission Status', 'Admission Method',
        'Month', 'Fee', 'Fee Date', 'Status', 'Method', 'Cash Amount', 'Online Amount', 'Notes'
      ]];
      db.students.forEach(s => {
        const payments = (s.payments && s.payments.length)
          ? [...s.payments].sort((a, b) => String(a.month).localeCompare(String(b.month)))
          : [{ month: s.month, fee: s.fee, feeDate: s.feeDate, status: s.status, method: '', cashAmount: 0, onlineAmount: 0, notes: '' }];
        payments.forEach((p, idx) => {
          const isFirstRow = idx === 0; // admission info only needs to appear once per student
          studentRows.push([
            s.name || '', s.guardian || '', s.contact || '', s.contact2 || '',
            s.ageGroup || '', s.session || '',
            isFirstRow ? (s.admissionFee || 0) : '',
            isFirstRow ? (s.admissionDate || '') : '',
            isFirstRow ? (s.admissionFeeStatus || '') : '',
            isFirstRow ? (s.admissionMethod || '') : '',
            p.month || '', p.fee || 0, p.feeDate || '', p.status || '', p.method || '',
            p.cashAmount || 0, p.onlineAmount || 0, p.notes || ''
          ]);
        });
      });
      const studentsSheet = XLSX.utils.aoa_to_sheet(studentRows);
      studentsSheet['!cols'] = studentRows[0].map(() => ({ wch: 15 }));
      XLSX.utils.book_append_sheet(wb, studentsSheet, 'Students');

      // Expenses — same columns the importer expects
      const expenseRows = [['Title', 'Amount', 'Category', 'Date', 'Month', 'Description']];
      db.expenses.forEach(e => expenseRows.push([e.title || '', e.amount || 0, e.category || '', e.date || '', e.month || '', e.description || '']));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expenseRows), 'Expenses');

      // Stock — reference only
      const stockRows = [['Item', 'Category', 'Qty', 'Unit Cost', 'Condition', 'Last Updated']];
      db.stock.forEach(i => stockRows.push([i.item || '', i.category || '', i.qty || 0, i.unitCost || 0, i.condition || '', i.lastUpdated || '']));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stockRows), 'Stock');

      // Stock Transactions — reference only
      const stxRows = [['Item', 'Category', 'Type', 'Qty', 'Unit Price', 'Amount', 'Cash', 'Date', 'Notes']];
      db.stockTransactions.forEach(t => stxRows.push([t.item || '', t.category || '', t.type || '', t.qty || 0, t.unitPrice || 0, t.amount || 0, t.cash || 0, t.date || '', t.notes || '']));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stxRows), 'Stock Transactions');

      // Ground Bookings (Cricket + Football) — reference only
      const bkRows = [['Team / Client', 'Contact', 'Ground', 'Date', 'Start Time', 'End Time', 'Duration (hrs)', 'Duration (mins)', 'Amount', 'Amount Paid', 'Status', 'Payment Method', 'Payment Date', 'Notes']];
      db.bookings.forEach(b => bkRows.push([
        b.teamName || '', b.contact || '', b.ground || 'CRICKET', b.date || '', b.startTime || '', b.endTime || '',
        b.duration || 0, b.durationMins || 0, b.amount || 0, b.amountPaid || 0, b.status || '', b.paymentMethod || '', b.paymentDate || '', b.notes || ''
      ]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bkRows), 'Bookings');

      const stamp = localToday();
      XLSX.writeFile(wb, `AMS-Backup-${stamp}.xlsx`);
      triggerToast('Backup file downloaded!', '#00a876');
    } catch (err) {
      console.error('Export failed:', err);
      triggerToast('Export failed: ' + err.message, '#ff3b5c');
    } finally {
      setExportingData(false);
    }
  };

  // ── DASHBOARD AGGREGATES ────────────────────────────────
  const getFilteredDashboardData = () => {
    let filteredFees = 0;
    let feeTxCount = 0;
    let filteredAdmissionFees = 0;
    let admissionCount = 0;
    let filteredReadmissionFees = 0;
    let readmissionCount = 0;
    let filteredCashFees = 0;
    let cashTxCount = 0;
    let filteredCricketBookings = 0;
    let cricketBookingsCount = 0;
    let filteredFootballBookings = 0;
    let footballBookingsCount = 0;
    let filteredOnlineFees = 0;
    let onlineTxCount = 0;
    let filteredExpenses = 0;
    let expenseCount = 0;
    let filteredBookings = 0;
    let bookingsCount = 0;

    // Apply dashboard filters
    const selectedYear = dashMonth ? dashMonth.split('-')[0] : dashYear;
    const selectedMonth = dashMonth ? dashMonth.split('-')[1] : '';
    const selectedDay = dashDay;

    db.students.forEach(student => {
      student.payments.forEach(payment => {
        // Readmission fee — one-time charge attached to a payment record,
        // matched on its own date like admission fee is.
        if ((payment.readmissionStatus || 'PAID') === 'PAID' && (payment.readmissionFee || 0) > 0) {
          if (matchYearMonthDay(payment.readmissionDate || '', selectedYear, selectedMonth, selectedDay)) {
            filteredReadmissionFees += (payment.readmissionFee || 0);
            readmissionCount++;
            if ((payment.readmissionMethod || 'Cash') === 'Cash') {
              filteredCashFees += (payment.readmissionFee || 0);
              cashTxCount++;
            } else {
              filteredOnlineFees += (payment.readmissionFee || 0);
              onlineTxCount++;
            }
          }
        }
        if (payment.status === 'PAID') {
          // Money is counted in the month it was RECEIVED (feeDate), not the
          // month it pays for — August's fee collected on 17 July belongs to
          // July's takings. Records with no feeDate fall back to their month so
          // they can never vanish from the totals.
          const receivedOn = payment.feeDate || (payment.month ? `${payment.month}-01` : '');
          const matches = matchYearMonthDay(receivedOn, selectedYear, selectedMonth, selectedDay);
          if (matches) {
            filteredFees += (payment.fee || 0);
            feeTxCount++;
            // Split by how the money came in. Anything that isn't cash (Online,
            // Bank Transfer) counts as online, so Cash + Online always equals
            // total fees collected. A split payment (part cash, part online)
            // is counted on both sides using its own cashAmount/onlineAmount.
            if ((payment.cashAmount || 0) > 0 || (payment.onlineAmount || 0) > 0) {
              if ((payment.cashAmount || 0) > 0) { filteredCashFees += payment.cashAmount; cashTxCount++; }
              if ((payment.onlineAmount || 0) > 0) { filteredOnlineFees += payment.onlineAmount; onlineTxCount++; }
            } else if ((payment.method || 'Cash') === 'Cash') {
              filteredCashFees += (payment.fee || 0);
              cashTxCount++;
            } else {
              filteredOnlineFees += (payment.fee || 0);
              onlineTxCount++;
            }
          }
        } else if (payment.status === 'PENDING') {
          // Half payment: only the amount actually received so far is real
          // money in the drawer — the rest isn't collected until it's topped
          // up (which then flips this record to PAID and counts in full).
          const receivedOn = payment.feeDate || (payment.month ? `${payment.month}-01` : '');
          const matches = matchYearMonthDay(receivedOn, selectedYear, selectedMonth, selectedDay);
          const receivedSoFar = Number(payment.amountPaid) || 0;
          if (matches && receivedSoFar > 0) {
            filteredFees += receivedSoFar;
            feeTxCount++;
            if ((payment.cashAmount || 0) > 0 || (payment.onlineAmount || 0) > 0) {
              if ((payment.cashAmount || 0) > 0) { filteredCashFees += payment.cashAmount; cashTxCount++; }
              if ((payment.onlineAmount || 0) > 0) { filteredOnlineFees += payment.onlineAmount; onlineTxCount++; }
            } else if ((payment.method || 'Cash') === 'Cash') {
              filteredCashFees += receivedSoFar;
              cashTxCount++;
            } else {
              filteredOnlineFees += receivedSoFar;
              onlineTxCount++;
            }
          }
        }
      });

      // One-time admission fee — matched on its own date, like an expense is.
      if (student.admissionFeeStatus === 'PAID' && (student.admissionFee || 0) > 0) {
        if (matchYearMonthDay(student.admissionDate || '', selectedYear, selectedMonth, selectedDay)) {
          filteredAdmissionFees += (student.admissionFee || 0);
          admissionCount++;
          // Admission money is real money in the drawer, so it belongs in the
          // cash/online split too.
          if ((student.admissionMethod || 'Cash') === 'Cash') {
            filteredCashFees += (student.admissionFee || 0);
            cashTxCount++;
          } else {
            filteredOnlineFees += (student.admissionFee || 0);
            onlineTxCount++;
          }
        }
      }
    });

    db.expenses.forEach(exp => {
      const dateToCheck = exp.date || exp.month || '';
      if (matchYearMonthDay(dateToCheck, selectedYear, selectedMonth, selectedDay)) {
        filteredExpenses += (exp.amount || 0);
        expenseCount++;
        // Money spent leaves the same drawer it came in through — a cash
        // expense reduces the Cash Payments box, an online/bank one reduces
        // Online Payments, same as how every payment above adds to them.
        if ((exp.method || 'Cash') === 'Cash') {
          filteredCashFees -= (exp.amount || 0);
          cashTxCount++;
        } else {
          filteredOnlineFees -= (exp.amount || 0);
          onlineTxCount++;
        }
      }
    });

    db.bookings.forEach(bk => {
      if (bk.status === 'FINISHED') {
        // Counted on the day the money actually came in (paymentDate), not
        // the ground-use date — same principle as student fees, which land
        // on their feeDate, not the month they're paying for. Older rows
        // saved before paymentDate existed fall back to the booking date.
        if (matchYearMonthDay(bk.paymentDate || bk.date, selectedYear, selectedMonth, selectedDay)) {
          const paidAmt = getBookingPaid(bk);
          filteredBookings += paidAmt;
          bookingsCount++;
          // Ground money is real money too — split it by how it was received so
          // the cash/online cards show every rupee that came in. This used to
          // check paymentMethod === 'Cash' only, dumping the WHOLE amount into
          // Online whenever the method was "Split (Cash+Online)" — losing the
          // fact that part of it was actually cash. Read the real cashAmount/
          // onlineAmount split (same fields the receipt shows), same as how
          // student fee payments are split into these cards above.
          if ((bk.cashAmount || 0) > 0 || (bk.onlineAmount || 0) > 0) {
            if ((bk.cashAmount || 0) > 0) { filteredCashFees += bk.cashAmount; cashTxCount++; }
            if ((bk.onlineAmount || 0) > 0) { filteredOnlineFees += bk.onlineAmount; onlineTxCount++; }
          } else if ((bk.paymentMethod || 'Cash') === 'Cash') {
            filteredCashFees += paidAmt;
            cashTxCount++;
          } else {
            filteredOnlineFees += paidAmt;
            onlineTxCount++;
          }
          // Two separate grounds, tracked separately. Rows saved before the
          // football module existed have no `ground` and count as cricket.
          if ((bk.ground || 'CRICKET') === 'FOOTBALL') {
            filteredFootballBookings += paidAmt;
            footballBookingsCount++;
          } else {
            filteredCricketBookings += paidAmt;
            cricketBookingsCount++;
          }
        }
      }
    });

    // Filter stock list dynamically by creation date
    const getStockCreationDate = (item) => {
      try {
        const timestamp = parseInt(item._id.toString().substring(0, 8), 16) * 1000;
        return isNaN(timestamp) ? '' : new Date(timestamp).toISOString().slice(0, 10);
      } catch (e) {
        return item.lastUpdated || '';
      }
    };

    const filteredStockList = db.stock.filter(item => {
      if (selectedYear) {
        const cDate = getStockCreationDate(item);
        const cMonth = cDate ? cDate.slice(0, 7) : '';
        if (selectedMonth) {
          const filterMonthStr = `${selectedYear}-${selectedMonth}`;
          if (cMonth && cMonth > filterMonthStr) return false;
          if (selectedDay) {
            const filterDateStr = `${selectedYear}-${selectedMonth}-${selectedDay}`;
            if (cDate && cDate > filterDateStr) return false;
          }
        } else {
          const regYear = cMonth ? cMonth.slice(0, 4) : '';
          if (regYear && regYear > selectedYear) return false;
        }
      }
      return true;
    });

    const totalStockVal = filteredStockList.reduce((acc, curr) => acc + ((curr.qty || 0) * (curr.unitCost || 0)), 0);

    // Breakdown lists (always all students, not filtered by date)
    const paymentStatusBreakdown = {
      PAID: 0,
      FREEZE: 0,
      UNPAID: 0,
      DEFAULTER: 0,
      LEFT: 0,
      SPONSORED: 0
    };
    const ageBreakdown = {};

    db.students.forEach(s => {
      // Determine registration/join month from the EARLIEST payment record,
      // falling back to the student's record-creation date. We deliberately
      // do NOT use student.feeDate/month here, because those top-level fields
      // get overwritten to reflect the *latest* payment, not the original
      // registration month — using them caused earlier-enrolled students to
      // wrongly disappear (and dashboard totals to read 0) when filtering by
      // an earlier month. (Mirrors the fix used in getFilteredStudents.)
      const paymentMonths = (s.payments || []).map(p => p.month).filter(Boolean).sort();
      const idCreationDate = (() => {
        try {
          const timestamp = parseInt(s._id.toString().substring(0, 8), 16) * 1000;
          return isNaN(timestamp) ? '' : new Date(timestamp).toISOString().slice(0, 10);
        } catch (e) {
          return '';
        }
      })();
      const idMonth = idCreationDate ? idCreationDate.slice(0, 7) : '';
      const joinMonth = paymentMonths.length > 0
        ? (idMonth && idMonth < paymentMonths[0] ? idMonth : paymentMonths[0])
        : idMonth;
      const joinDate = idCreationDate;

      // Filter out students who registered after the selected filter period
      if (selectedYear) {
        if (selectedMonth) {
          const filterMonthStr = `${selectedYear}-${selectedMonth}`;
          if (joinMonth && joinMonth > filterMonthStr) {
            return;
          }
          if (selectedDay) {
            const filterDateStr = `${selectedYear}-${selectedMonth}-${selectedDay}`;
            if (joinDate && joinMonth === selectedMonth && joinDate > filterDateStr) {
              return;
            }
          }
        } else {
          const regYear = joinMonth ? joinMonth.slice(0, 4) : '';
          if (regYear && regYear > selectedYear) {
            return;
          }
        }
      }

      if (selectedYear) {
        if (selectedMonth) {
          const targetMonthStr = `${selectedYear}-${selectedMonth}`;
          const p = s.payments.find(pm => pm.month === targetMonthStr);
          if (p) {
            paymentStatusBreakdown[p.status] = (paymentStatusBreakdown[p.status] || 0) + 1;
            const age = s.ageGroup || 'Other';
            ageBreakdown[age] = (ageBreakdown[age] || 0) + 1;
          }
          // No explicit record for this month (e.g. Carry Forward hasn't
          // been run for it yet, or the student left before this month) —
          // don't count them at all, rather than guessing UNPAID/LEFT.
          return;
        } else {
          const yearPayments = s.payments.filter(pm => pm.month && pm.month.startsWith(selectedYear));
          let status;
          if (yearPayments.length > 0) {
            yearPayments.sort((a, b) => b.month.localeCompare(a.month));
            status = yearPayments[0].status;
          } else {
            return; // no record at all this year — don't count them
          }
          paymentStatusBreakdown[status] = (paymentStatusBreakdown[status] || 0) + 1;
          const age = s.ageGroup || 'Other';
          ageBreakdown[age] = (ageBreakdown[age] || 0) + 1;
          return;
        }
      }

      let status = s.status || 'UNPAID';
      paymentStatusBreakdown[status] = (paymentStatusBreakdown[status] || 0) + 1;

      const age = s.ageGroup || 'Other';
      ageBreakdown[age] = (ageBreakdown[age] || 0) + 1;
    });

    const totalStudents = Object.values(paymentStatusBreakdown).reduce((a, b) => a + b, 0);
    const totalStockQty = filteredStockList.reduce((acc, curr) => acc + (curr.qty || 0), 0);

    const totalStockSales = db.stockTransactions
      .filter(tx => tx.type === 'SALE' && matchYearMonthDay(tx.date, selectedYear, selectedMonth, selectedDay))
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);

    const totalStockBuys = db.stockTransactions
      .filter(tx => tx.type === 'PURCHASE' && matchYearMonthDay(tx.date, selectedYear, selectedMonth, selectedDay))
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);

    // Net balance deliberately EXCLUDES stock/inventory movement — stock sales
    // and stock purchases are tracked on the STOCK ITEMS card instead, so this
    // figure reflects academy operations only (fees, admissions, bookings,
    // expenses).
    const netBalance = filteredFees + filteredAdmissionFees + filteredReadmissionFees + filteredBookings - filteredExpenses;

    return {
      filteredFees,
      feeTxCount,
      filteredAdmissionFees,
      admissionCount,
      filteredReadmissionFees,
      readmissionCount,
      filteredCashFees,
      cashTxCount,
      filteredCricketBookings,
      cricketBookingsCount,
      filteredFootballBookings,
      footballBookingsCount,
      filteredOnlineFees,
      onlineTxCount,
      filteredExpenses,
      expenseCount,
      filteredBookings,
      bookingsCount,
      totalStockVal,
      netBalance,
      paymentStatusBreakdown,
      ageBreakdown,
      totalStudents,
      totalStockQty,
      totalStockSales,
      totalStockBuys
    };
  };

  const dashStats = getFilteredDashboardData();

  // ── Dashboard stat-box breakdown ("click a box to see what makes it up") ──
  const [statDetailOpen, setStatDetailOpen] = useState(false);
  const [statDetail, setStatDetail] = useState(null); // { type: 'txn'|'students', key, title }
  const openStatDetail = (type, key, title) => {
    setStatDetail({ type, key, title });
    setStatDetailOpen(true);
  };

  // Same student list currently shown in a filtered status count/card —
  // used to list actual names when that box is clicked, mirroring the exact
  // join-month filtering logic getFilteredDashboardData uses to count them.
  const getStudentsByStatus = (statusKey) => {
    const selectedYear = dashMonth ? dashMonth.split('-')[0] : dashYear;
    const selectedMonth = dashMonth ? dashMonth.split('-')[1] : '';
    const selectedDay = dashDay;
    const result = [];

    db.students.forEach(s => {
      const paymentMonths = (s.payments || []).map(p => p.month).filter(Boolean).sort();
      const idCreationDate = (() => {
        try {
          const timestamp = parseInt(s._id.toString().substring(0, 8), 16) * 1000;
          return isNaN(timestamp) ? '' : new Date(timestamp).toISOString().slice(0, 10);
        } catch (e) {
          return '';
        }
      })();
      const idMonth = idCreationDate ? idCreationDate.slice(0, 7) : '';
      const joinMonth = paymentMonths.length > 0
        ? (idMonth && idMonth < paymentMonths[0] ? idMonth : paymentMonths[0])
        : idMonth;
      const joinDate = idCreationDate;

      if (selectedYear) {
        if (selectedMonth) {
          const filterMonthStr = `${selectedYear}-${selectedMonth}`;
          if (joinMonth && joinMonth > filterMonthStr) return;
          // selectedDay may now be several days at once — a student only
          // needs to have joined by the LATEST of them to count.
          const dayList = Array.isArray(selectedDay) ? selectedDay.filter(Boolean) : (selectedDay ? [selectedDay] : []);
          if (dayList.length > 0) {
            const latestDay = dayList.reduce((a, b) => (b > a ? b : a));
            const filterDateStr = `${selectedYear}-${selectedMonth}-${latestDay}`;
            if (joinDate && joinMonth === selectedMonth && joinDate > filterDateStr) return;
          }
        } else {
          const regYear = joinMonth ? joinMonth.slice(0, 4) : '';
          if (regYear && regYear > selectedYear) return;
        }
      }

      let status;
      if (selectedYear) {
        if (selectedMonth) {
          const targetMonthStr = `${selectedYear}-${selectedMonth}`;
          const p = s.payments.find(pm => pm.month === targetMonthStr);
          if (!p) return;
          status = p.status;
        } else {
          const yearPayments = s.payments.filter(pm => pm.month && pm.month.startsWith(selectedYear));
          if (yearPayments.length === 0) return;
          yearPayments.sort((a, b) => b.month.localeCompare(a.month));
          status = yearPayments[0].status;
        }
      } else {
        status = s.status || 'UNPAID';
      }

      if (statusKey !== 'ALL' && status !== statusKey) return;
      result.push({ name: s.name, guardian: s.guardian, session: s.session, status });
    });

    return result;
  };

  // Every rupee-line-item behind the filtered totals above — same source
  // data and same date-matching rules as getFilteredDashboardData, just
  // collected instead of only summed, so a box can show its own working.
  const getStatDetailItems = (bucketKey) => {
    const items = [];
    const selectedYear = dashMonth ? dashMonth.split('-')[0] : dashYear;
    const selectedMonth = dashMonth ? dashMonth.split('-')[1] : '';
    const selectedDay = dashDay;

    db.students.forEach(student => {
      student.payments.forEach(payment => {
        if ((payment.readmissionStatus || 'PAID') === 'PAID' && (payment.readmissionFee || 0) > 0) {
          if (matchYearMonthDay(payment.readmissionDate || '', selectedYear, selectedMonth, selectedDay)) {
            items.push({ bucket: 'readmission', source: 'Readmission Fee', name: student.name, detail: student.guardian, amount: payment.readmissionFee, date: payment.readmissionDate });
            items.push({ bucket: (payment.readmissionMethod || 'Cash') === 'Cash' ? 'cash' : 'online', source: 'Readmission Fee', name: student.name, detail: student.guardian, amount: payment.readmissionFee, date: payment.readmissionDate });
          }
        }
        if (payment.status === 'PAID') {
          const receivedOn = payment.feeDate || (payment.month ? `${payment.month}-01` : '');
          if (matchYearMonthDay(receivedOn, selectedYear, selectedMonth, selectedDay)) {
            items.push({ bucket: 'fees', source: 'Student Fee', name: student.name, detail: payment.month, amount: payment.fee || 0, date: receivedOn });
            if ((payment.cashAmount || 0) > 0 || (payment.onlineAmount || 0) > 0) {
              if ((payment.cashAmount || 0) > 0) items.push({ bucket: 'cash', source: 'Student Fee', name: student.name, detail: payment.month, amount: payment.cashAmount, date: receivedOn });
              if ((payment.onlineAmount || 0) > 0) items.push({ bucket: 'online', source: 'Student Fee', name: student.name, detail: payment.month, amount: payment.onlineAmount, date: receivedOn });
            } else if ((payment.method || 'Cash') === 'Cash') {
              items.push({ bucket: 'cash', source: 'Student Fee', name: student.name, detail: payment.month, amount: payment.fee || 0, date: receivedOn });
            } else {
              items.push({ bucket: 'online', source: 'Student Fee', name: student.name, detail: payment.month, amount: payment.fee || 0, date: receivedOn });
            }
          }
        } else if (payment.status === 'PENDING') {
          const receivedOn = payment.feeDate || (payment.month ? `${payment.month}-01` : '');
          const receivedSoFar = Number(payment.amountPaid) || 0;
          if (matchYearMonthDay(receivedOn, selectedYear, selectedMonth, selectedDay) && receivedSoFar > 0) {
            items.push({ bucket: 'fees', source: 'Student Fee (partial)', name: student.name, detail: payment.month, amount: receivedSoFar, date: receivedOn });
            if ((payment.cashAmount || 0) > 0 || (payment.onlineAmount || 0) > 0) {
              if ((payment.cashAmount || 0) > 0) items.push({ bucket: 'cash', source: 'Student Fee (partial)', name: student.name, detail: payment.month, amount: payment.cashAmount, date: receivedOn });
              if ((payment.onlineAmount || 0) > 0) items.push({ bucket: 'online', source: 'Student Fee (partial)', name: student.name, detail: payment.month, amount: payment.onlineAmount, date: receivedOn });
            } else if ((payment.method || 'Cash') === 'Cash') {
              items.push({ bucket: 'cash', source: 'Student Fee (partial)', name: student.name, detail: payment.month, amount: receivedSoFar, date: receivedOn });
            } else {
              items.push({ bucket: 'online', source: 'Student Fee (partial)', name: student.name, detail: payment.month, amount: receivedSoFar, date: receivedOn });
            }
          }
        }
      });

      if (student.admissionFeeStatus === 'PAID' && (student.admissionFee || 0) > 0) {
        if (matchYearMonthDay(student.admissionDate || '', selectedYear, selectedMonth, selectedDay)) {
          items.push({ bucket: 'admission', source: 'Admission Fee', name: student.name, detail: student.guardian, amount: student.admissionFee, date: student.admissionDate });
          items.push({ bucket: (student.admissionMethod || 'Cash') === 'Cash' ? 'cash' : 'online', source: 'Admission Fee', name: student.name, detail: student.guardian, amount: student.admissionFee, date: student.admissionDate });
        }
      }
    });

    db.expenses.forEach(exp => {
      const dateToCheck = exp.date || exp.month || '';
      if (matchYearMonthDay(dateToCheck, selectedYear, selectedMonth, selectedDay)) {
        // Grouped by how the expense was PAID (Cash/Online/Bank Transfer),
        // not by category — that's the breakdown asked for when this box
        // is clicked. Category still shows in the line-item detail.
        items.push({ bucket: 'expenses', source: exp.method || 'Cash', name: exp.title || exp.category || 'Expense', detail: exp.category, amount: exp.amount || 0, date: exp.date || exp.month });
        // Same expense, shown as a deduction inside whichever payments box
        // it actually came out of.
        items.push({ bucket: (exp.method || 'Cash') === 'Cash' ? 'cash' : 'online', source: 'Expense', name: exp.title || exp.category || 'Expense', detail: exp.category, amount: -(exp.amount || 0), date: exp.date || exp.month });
      }
    });

    db.bookings.forEach(bk => {
      if (bk.status === 'FINISHED' && matchYearMonthDay(bk.paymentDate || bk.date, selectedYear, selectedMonth, selectedDay)) {
        const paidAmt = getBookingPaid(bk);
        const ground = (bk.ground || 'CRICKET') === 'FOOTBALL' ? 'football' : 'cricket';
        const groundLabel = ground === 'football' ? 'Football Booking' : 'Cricket Booking';
        items.push({ bucket: ground, source: groundLabel, name: bk.teamName || 'Booking', detail: bk.date, amount: paidAmt, date: bk.date });
        if ((bk.cashAmount || 0) > 0 || (bk.onlineAmount || 0) > 0) {
          if ((bk.cashAmount || 0) > 0) items.push({ bucket: 'cash', source: groundLabel, name: bk.teamName || 'Booking', detail: bk.date, amount: bk.cashAmount, date: bk.date });
          if ((bk.onlineAmount || 0) > 0) items.push({ bucket: 'online', source: groundLabel, name: bk.teamName || 'Booking', detail: bk.date, amount: bk.onlineAmount, date: bk.date });
        } else if ((bk.paymentMethod || 'Cash') === 'Cash') {
          items.push({ bucket: 'cash', source: groundLabel, name: bk.teamName || 'Booking', detail: bk.date, amount: paidAmt, date: bk.date });
        } else {
          items.push({ bucket: 'online', source: groundLabel, name: bk.teamName || 'Booking', detail: bk.date, amount: paidAmt, date: bk.date });
        }
      }
    });

    if (bucketKey === 'stock') {
      const getStockCreationDate = (item) => {
        try {
          const timestamp = parseInt(item._id.toString().substring(0, 8), 16) * 1000;
          return isNaN(timestamp) ? '' : new Date(timestamp).toISOString().slice(0, 10);
        } catch (e) {
          return item.lastUpdated || '';
        }
      };
      db.stock.forEach(item => {
        const cDate = getStockCreationDate(item);
        let include = true;
        if (selectedYear) {
          const cMonth = cDate ? cDate.slice(0, 7) : '';
          if (selectedMonth) {
            const filterMonthStr = `${selectedYear}-${selectedMonth}`;
            if (cMonth && cMonth > filterMonthStr) include = false;
            if (selectedDay) {
              const filterDateStr = `${selectedYear}-${selectedMonth}-${selectedDay}`;
              if (cDate && cDate > filterDateStr) include = false;
            }
          } else {
            const regYear = cMonth ? cMonth.slice(0, 4) : '';
            if (regYear && regYear > selectedYear) include = false;
          }
        }
        if (include) {
          items.push({ bucket: 'stock', source: item.category || 'Stock', name: item.name, detail: `Qty ${item.qty || 0} @ Rs ${(item.unitCost || 0).toLocaleString()}`, amount: (item.qty || 0) * (item.unitCost || 0), date: cDate });
        }
      });
    }

    return items.filter(it => it.bucket === bucketKey);
  };

  // ── Fees vs Expenses trend (last 6 months, ending this month) ──
  const getTrendData = () => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months.map(key => {
      let fees = 0;
      db.students.forEach(s => {
        (s.payments || []).forEach(p => {
          if (p.month === key && p.status === 'PAID') fees += (p.fee || 0);
        });
      });
      let expenses = 0;
      db.expenses.forEach(e => {
        if (e.month === key) expenses += (e.amount || 0);
      });
      const label = new Date(key + '-01').toLocaleDateString('en-GB', { month: 'short' });
      return { key, label, fees, expenses };
    });
  };
  const trendData = getTrendData();

  // Converts a { value, color }[] breakdown into SVG donut arc segments.
  const buildDonutSegments = (data, circumference) => {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return [];
    let offset = 0;
    return data.filter(d => d.value > 0).map(d => {
      const dash = (d.value / total) * circumference;
      const seg = { color: d.color, dash, offset, label: d.label, value: d.value };
      offset += dash;
      return seg;
    });
  };

  // Helper lists for selects
  const getYearsList = (collection, dateField = 'date') => {
    const yearsSet = new Set();
    collection.forEach(item => {
      if (item[dateField]) {
        const yr = extractYear(String(item[dateField]));
        if (yr) yearsSet.add(yr);
      }
    });
    return Array.from(yearsSet).sort();
  };

  const getMonthsList = [
    { value: '01', label: 'January' }, { value: '02', label: 'February' },
    { value: '03', label: 'March' }, { value: '04', label: 'April' },
    { value: '05', label: 'May' }, { value: '06', label: 'June' },
    { value: '07', label: 'July' }, { value: '08', label: 'August' },
    { value: '09', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' }, { value: '12', label: 'December' }
  ];

  // ── STUDENTS LOGIC ──────────────────────────────────────
  const getFilteredStudents = () => {
    const selectedYear = studentYearFilter;
    const selectedMonth = studentMonthFilter;
    const selectedDay = studentDayFilter;

    return db.students.filter(student => {
      const matchSearch = !studentSearch || 
        student.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
        (student.guardian && student.guardian.toLowerCase().includes(studentSearch.toLowerCase()));
      const matchAge = !studentAgeFilter || student.ageGroup === studentAgeFilter;
      const matchSession = !studentSessionFilter || student.session === studentSessionFilter;

      // Determine registration/join month from the EARLIEST payment record,
      // falling back to the student's record-creation date. We deliberately
      // do NOT use student.feeDate/month here, because those top-level fields
      // get overwritten to reflect the *latest* payment, not the original
      // registration month — using them caused earlier-enrolled students to
      // wrongly disappear when filtering by an earlier month.
      const paymentMonths = (student.payments || []).map(p => p.month).filter(Boolean).sort();
      const idCreationDate = (() => {
        try {
          const timestamp = parseInt(student._id.toString().substring(0, 8), 16) * 1000;
          return isNaN(timestamp) ? '' : new Date(timestamp).toISOString().slice(0, 10);
        } catch (e) { return ''; }
      })();
      const idMonth = idCreationDate ? idCreationDate.slice(0, 7) : '';
      const joinMonth = paymentMonths.length > 0
        ? (idMonth && idMonth < paymentMonths[0] ? idMonth : paymentMonths[0])
        : idMonth;

      // Exclude students who registered after the selected filter period
      let withinPeriod = true;
      if (selectedYear) {
        if (selectedMonth) {
          const filterMonthStr = `${selectedYear}-${selectedMonth}`;
          if (joinMonth && joinMonth > filterMonthStr) withinPeriod = false;
        } else {
          const regYear = joinMonth ? joinMonth.slice(0, 4) : '';
          if (regYear && regYear > selectedYear) withinPeriod = false;
        }
      }

      // This student's payment record for the selected month (if any)
      let monthPayment = null;
      if (selectedYear && selectedMonth) {
        const targetMonthStr = `${selectedYear}-${selectedMonth}`;
        monthPayment = student.payments && student.payments.find(pm => pm.month === targetMonthStr);
        // Require an explicit record for the selected month. Without this,
        // every joined student would silently show up as UNPAID every
        // month even if Carry Forward was never run for it, and a student
        // marked LEFT would keep reappearing in every month after they left.
        if (!monthPayment) withinPeriod = false;
      }

      // Day filter: only meaningful against an actual recorded payment date.
      let matchDay = true;
      if (selectedDay) {
        if (selectedMonth) {
          matchDay = !!(monthPayment && monthPayment.feeDate && monthPayment.feeDate.slice(8, 10) === selectedDay);
        } else {
          matchDay = !!(student.payments && student.payments.some(pm =>
            matchYearMonthDay(pm.feeDate, selectedYear, '', selectedDay)
          ));
        }
      }

      // Compute the status specific to the selected month (mirrors Dashboard logic).
      let effectiveStatus = student.status;
      if (selectedYear && selectedMonth && monthPayment) {
        effectiveStatus = monthPayment.status;
      }

      const matchStatus = !studentStatusFilter || effectiveStatus === studentStatusFilter;

      return matchSearch && matchStatus && matchAge && matchSession && withinPeriod && matchDay;
    }).map(student => {
      // When a specific month is selected, show that month's payment details
      // (fee, date, status) instead of the student's top-level/most-recent fields.
      let displayFee = student.fee;
      let displayDate = student.feeDate;
      let displayStatus = student.status;
      if (studentYearFilter && studentMonthFilter) {
        const targetMonthStr = `${studentYearFilter}-${studentMonthFilter}`;
        const p = student.payments && student.payments.find(pm => pm.month === targetMonthStr);
        if (p) {
          displayFee = p.fee;
          displayDate = p.feeDate;
          displayStatus = p.status;
        }
      }
      return { ...student, displayFee, displayDate, displayStatus };
    });
  };

  const filteredStudents = getFilteredStudents();
  const paginatedStudents = filteredStudents.slice((studentPage - 1) * studentsPerPage, studentPage * studentsPerPage);
  const totalStudentPages = Math.ceil(filteredStudents.length / studentsPerPage);

  const openAddStudent = () => {
    setEditingStudentId(null);
    setSName('');
    setSGuardian('');
    setSContact('');
    setSContact2('');
    setSAdmissionFee('');
    setSAdmissionDate(localToday());
    setSAdmissionStatus('PAID');
    setSAdmissionMethod('Cash');
    setSMethod('Cash');
    setSSplitPayment(false);
    setSCashAmount('');
    setSOnlineAmount('');
    setSAge('Kids');
    setSSession('Weekends');
    setSMonth(localMonth());
    setSFee('');
    setSFeeDate(localToday());
    setSStatus('UNPAID');
    setSAmountPaid('');
    setSAddAnotherSibling(false);
    setSTotalChildren(2);
    setSPendingSiblings([]);
    setStudentModalOpen(true);
  };

  const openEditStudent = (student) => {
    setEditingStudentId(student._id);
    setSName(student.name || '');
    setSGuardian(student.guardian || '');
    setSContact(student.contact || '');
    setSContact2(student.contact2 || '');
    setSAdmissionFee(student.admissionFee || '');
    setSAdmissionDate(student.admissionDate || '');
    setSAdmissionStatus(student.admissionFeeStatus || 'PAID');
    setSAdmissionMethod(student.admissionMethod || 'Cash');
    setSMethod('Cash');
    setSSplitPayment(false);
    setSCashAmount('');
    setSOnlineAmount('');
    setSAge(student.ageGroup || 'Kids');
    setSSession(student.session || 'Weekends');
    setSMonth(student.month || '');
    setSFee(student.fee || '');
    setSFeeDate(student.feeDate || '');
    setSStatus(student.status || 'UNPAID');
    setSAmountPaid('');
    setStudentModalOpen(true);
  };

  // Shows one receipt for one or more just-added children (used both right
  // after saving the last sibling in a chain, and as a safety net if the
  // modal gets closed/cancelled with siblings still pending — so a
  // forgotten unchecked box never silently loses the receipt).
  // How much was actually collected for one child — mirrors the same
  // "amountPaid if present, else fee only when PAID" rule used for the
  // regular receipt's Total Received (slipMonthlyReceived below). Getting
  // this right per child is the whole point: an UNPAID sibling must
  // contribute 0, never their full fee.
  const receivedForChild = (c) => {
    if (c.amountPaid !== undefined && c.amountPaid !== null && c.amountPaid !== '') {
      return Number(c.amountPaid) || 0;
    }
    return c.status === 'PAID' ? (Number(c.fee) || 0) : 0;
  };

  const openSiblingSlip = (allChildren) => {
    if (!allChildren.length) return;
    const markAdmissionCharged = (child) => {
      // Only mark it "already shown" when it was actually paid and counted
      // just now — an admission fee that's still unpaid (only displayed for
      // visibility) must stay eligible to show again once it IS paid.
      if ((child.admissionFeeReceived || 0) > 0 && child.studentId) {
        fetch(`/api/students/${child.studentId}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ admissionFeeCharged: true })
        }).catch(() => {});
      }
    };
    if (allChildren.length === 1) {
      const only = allChildren[0];
      setSlipData({
        student: { name: only.name, guardian: only.guardian, session: only.session },
        payment: { fee: only.fee, feeDate: only.feeDate, month: only.month, status: only.status, method: only.method, cashAmount: only.cashAmount, onlineAmount: only.onlineAmount, amountPaid: only.amountPaid, notes: '' },
        admissionFee: only.admissionFee,
        admissionFeeReceived: only.admissionFeeReceived,
        admissionMethod: only.admissionMethod
      });
      setSlipModalOpen(true);
      markAdmissionCharged(only);
      return;
    }
    // Nothing at all was collected for anyone in this batch (every sibling
    // left UNPAID, no admission fee either) — nothing worth putting on a
    // receipt.
    const anyMoneyCollected = allChildren.some(c => receivedForChild(c) > 0 || (c.admissionFeeReceived || 0) > 0);
    if (!anyMoneyCollected) return;

    const fees = allChildren.map(c => c.fee || 0);
    const feesDiffer = new Set(fees).size > 1;
    const sessions = [...new Set(allChildren.map(c => c.session).filter(Boolean))];
    const totalReceived = allChildren.reduce((sum, c) => sum + receivedForChild(c), 0);
    setSlipData({
      student: { name: allChildren[0].name, guardian: allChildren[0].guardian, session: sessions.length === 1 ? sessions[0] : 'Multiple sessions' },
      // Every sibling shows up here — including one left UNPAID — each with
      // their own status and what was actually received for them, so the
      // receipt reads as "here's the whole family" rather than hiding
      // whoever didn't pay.
      students: allChildren.map(c => ({
        _id: c.studentId,
        name: c.name,
        guardian: c.guardian,
        session: c.session,
        receiptFee: c.fee || 0,
        receiptStatus: c.status,
        receiptReceived: receivedForChild(c),
        receiptMethod: c.method,
        receiptCashAmount: c.cashAmount || 0,
        receiptOnlineAmount: c.onlineAmount || 0,
        receiptAdmissionFee: c.admissionFee || 0,
        receiptAdmissionReceived: c.admissionFeeReceived || 0,
        receiptAdmissionMethod: c.admissionMethod
      })),
      feesDiffer,
      showPerChildStatus: true,
      payment: {
        fee: fees.reduce((sum, f) => sum + f, 0),
        feeDate: allChildren[0].feeDate,
        month: allChildren[0].month,
        status: allChildren.every(c => c.status === allChildren[0].status) ? allChildren[0].status : 'MIXED',
        method: allChildren.every(c => c.method === allChildren[0].method) ? allChildren[0].method : 'Split (Cash+Online)',
        cashAmount: allChildren.reduce((sum, c) => sum + (c.cashAmount || 0), 0),
        onlineAmount: allChildren.reduce((sum, c) => sum + (c.onlineAmount || 0), 0),
        // Explicit sum of what was actually collected per child — without
        // this, the receipt's Total Received fell back to "fee if the
        // FIRST child in the list happened to be PAID," which could count
        // a sibling who was left UNPAID as if they'd paid in full too.
        amountPaid: totalReceived,
        notes: ''
      },
      admissionFee: allChildren.reduce((sum, c) => sum + (c.admissionFee || 0), 0),
      admissionFeeReceived: allChildren.reduce((sum, c) => sum + (c.admissionFeeReceived || 0), 0)
    });
    setSlipModalOpen(true);
    allChildren.forEach(markAdmissionCharged);
  };

  // Closes the Add Student modal — if any siblings were saved via "add
  // another child" but the admin left the box checked (or just cancelled
  // instead of unchecking it for the last one), show their receipt now
  // instead of silently discarding it.
  const closeStudentModal = () => {
    if (sPendingSiblings.length) {
      openSiblingSlip(sPendingSiblings);
      setSPendingSiblings([]);
    }
    setStudentModalOpen(false);
  };

  const saveStudent = async (e) => {
    e.preventDefault();
    if (savingStudent) return;
    if (!sName) {
      triggerToast('Name is required', '#ff3b5c');
      return;
    }
    const contactErr = phoneError(sContact, { required: true, label: 'Contact number' });
    if (contactErr) {
      triggerToast(contactErr, '#ff3b5c');
      return;
    }
    const contact2Err = phoneError(sContact2, { label: 'Contact number 2' });
    if (contact2Err) {
      triggerToast(contact2Err, '#ff3b5c');
      return;
    }
    const isSplit = sSplitPayment && !editingStudentId;
    // Snapshot the pre-edit record so a just-settled admission fee can be
    // detected after the save succeeds (the edit form only carries the NEW
    // values, not what they used to be).
    const originalStudent = editingStudentId ? db.students.find(s => s._id === editingStudentId) : null;
    const payload = {
      name: sName,
      guardian: sGuardian,
      contact: normalizePhone(sContact),
      contact2: normalizePhone(sContact2),
      admissionFee: Number(sAdmissionFee) || 0,
      admissionDate: sAdmissionDate,
      admissionFeeStatus: sAdmissionStatus,
      admissionMethod: sAdmissionMethod,
      method: isSplit ? 'Split (Cash+Online)' : sMethod,
      // UNPAID means nothing was received, full stop — even if an amount
      // was typed into the fields earlier and the status was then switched
      // back to UNPAID by hand, that stale figure must not carry through.
      cashAmount: (isSplit && sStatus !== 'UNPAID') ? (Number(sCashAmount) || 0) : 0,
      onlineAmount: (isSplit && sStatus !== 'UNPAID') ? (Number(sOnlineAmount) || 0) : 0,
      ageGroup: sAge,
      session: sSession,
      month: sMonth,
      fee: Number(sFee) || 0,
      feeDate: sFeeDate,
      // For a split payment, "amount actually received" is the cash+online
      // total, not sAmountPaid (that field only exists for the non-split
      // input). Without this the backend fell back to "PAID ? fee : 0",
      // which recorded 0 received even though cash/online showed money in.
      amountPaid: sStatus === 'UNPAID' ? 0 : (isSplit ? ((Number(sCashAmount) || 0) + (Number(sOnlineAmount) || 0)) : sAmountPaid),
      status: sStatus
    };

    const method = editingStudentId ? 'PUT' : 'POST';
    const url = editingStudentId ? `/api/students/${editingStudentId}` : '/api/students';

    setSavingStudent(true);
    try {
      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      // Read as text first: a crashed API route replies with an HTML error
      // page, and res.json() would throw and hide the real reason.
      const raw = await res.text();
      let data = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (parseErr) {
          console.error('Student save — server did not return JSON:', res.status, raw.slice(0, 500));
          triggerToast(`Server error ${res.status} — check the terminal running npm run dev`, '#ff3b5c');
          return;
        }
      }
      if (res.ok) {
        triggerToast(editingStudentId ? 'Student updated!' : 'Student added!', '#00a876');
        // "Add another sibling" keeps the modal open with guardian/contact/
        // fee/payment details intact and only clears the name, instead of
        // closing and forcing the admin to retype all of it for the next
        // child under the same guardian. sTotalChildren says exactly how
        // many are coming, so the LAST one is detected automatically —
        // no need to remember to uncheck anything.
        const savedSoFarCount = sPendingSiblings.length + 1;
        const chainingSibling = !editingStudentId && sAddAnotherSibling && savedSoFarCount < (Number(sTotalChildren) || 2);
        if (chainingSibling) {
          setSName('');
        } else {
          setStudentModalOpen(false);
        }
        // Show the change immediately instead of waiting on the next full
        // /api/data reload (which re-fetches every student, expense, stock
        // item and booking) — that round trip is what made a new/edited
        // student feel slow to show up in the list.
        if (data && data._id) {
          setDb(prev => ({
            ...prev,
            students: editingStudentId
              ? prev.students.map(s => (s._id === data._id ? data : s))
              : [...prev.students, data]
          }));
        }
        loadData();
        // Auto-open a slip for new students if they paid a monthly fee
        // and/or an admission fee — a joining student often pays only the
        // admission fee. When chaining siblings, don't pop one slip per
        // child — collect each paid child and show ONE combined receipt
        // for the whole family once the last sibling is saved.
        const admissionPaid = payload.admissionFeeStatus === 'PAID' && payload.admissionFee > 0;
        const worthReceipt = (payload.fee && payload.status === 'PAID') || admissionPaid;
        if (!editingStudentId) {
          const childReceiptData = {
            studentId: data && data._id,
            name: payload.name,
            guardian: payload.guardian,
            session: payload.session,
            fee: payload.fee,
            feeDate: payload.feeDate,
            month: payload.month,
            status: payload.status,
            method: payload.method,
            cashAmount: payload.cashAmount,
            onlineAmount: payload.onlineAmount,
            amountPaid: payload.amountPaid,
            // admissionFee is what to DISPLAY on the receipt (shown even if
            // still unpaid, so it isn't silently dropped); admissionFeeReceived
            // is the subset that actually counts toward Total Received.
            admissionFee: payload.admissionFee || 0,
            admissionFeeReceived: admissionPaid ? payload.admissionFee : 0,
            admissionMethod: payload.admissionMethod,
            admissionFeeStatus: payload.admissionFeeStatus
          };

          if (chainingSibling) {
            // Keep every sibling, paid or not — the combined receipt at the
            // end should show the whole family (who paid, who didn't), not
            // silently drop whichever ones happened to be unpaid.
            setSPendingSiblings(prev => [...prev, childReceiptData]);
          } else if (sPendingSiblings.length > 0) {
            // Last sibling in a multi-child batch.
            const allChildren = [...sPendingSiblings, childReceiptData];
            setSPendingSiblings([]);
            openSiblingSlip(allChildren);
          } else if (worthReceipt) {
            // Plain single-student add (sibling flow never used) — same as
            // before: only pop a receipt when there's actually something
            // to show for it.
            openSiblingSlip([childReceiptData]);
          }
        } else if (originalStudent && originalStudent.admissionFeeStatus !== 'PAID' && admissionPaid) {
          // Editing a student and settling their (previously unpaid)
          // admission fee right here — pop a receipt for just that, so the
          // admin doesn't have to wait for the next monthly Record Payment
          // to get a printable proof of it.
          setSlipData({
            student: { name: payload.name, guardian: payload.guardian, session: payload.session },
            payment: { fee: 0, feeDate: payload.admissionDate, month: '', status: 'PAID', method: payload.admissionMethod, amountPaid: 0, notes: '' },
            admissionOnly: true,
            admissionFee: payload.admissionFee,
            admissionFeeReceived: payload.admissionFee,
            admissionMethod: payload.admissionMethod
          });
          setSlipModalOpen(true);
          fetch(`/api/students/${editingStudentId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ admissionFeeCharged: true })
          }).catch(() => {});
        }
      } else {
        console.error('Student save failed:', res.status, data);
        triggerToast(data.error || `Failed to save student (${res.status})`, '#ff3b5c');
      }
    } catch (err) {
      console.error('Student save threw:', err);
      triggerToast(`Error saving student: ${err.message}`, '#ff3b5c');
    } finally {
      setSavingStudent(false);
    }
  };

  // Recording Payment Modal Trigger
  const openAddPayment = (prefStudentId = '', prefStudentText = '') => {
    setEditPaymentTarget(null);
    setPStudentSelectedId(prefStudentId);
    setPStudentSelectedIds(prefStudentId ? [prefStudentId] : []);
    setPStudentSelectedText(prefStudentText);
    setPStudentNameInput(prefStudentText);
    setPAmount('');
    setPAmountReceived('');
    setPMonths([localMonth()]);
    setPDate(localToday());
    setPStatus('PAID');
    setPMethod('Cash');
    setPNotes('');
    setPReadmissionFee('');
    setPReadmissionDate('');
    setPReadmissionStatus('PAID');
    setPReadmissionMethod('Cash');
    setPShowReadmission(false);
    setPStudentAmounts({});
    setPStudentSessions({});
    setPSplitPayment(false);
    setPCashAmount('');
    setPOnlineAmount('');
    setPStudentCashAmounts({});
    setPStudentOnlineAmounts({});
    const prefStudent = prefStudentId ? db.students.find(s => s._id === prefStudentId) : null;
    setPSession(prefStudent?.session || 'Weekends');
    setPaymentModalOpen(true);
  };

  const openAddPaymentForStudent = () => {
    if (!historyStudent) return;
    setHistoryModalOpen(false);
    openAddPayment(historyStudent._id, `${historyStudent.name} (${historyStudent.guardian || 'No Guardian'})`);
  };

  const filterStudentDropdown = () => {
    if (!pStudentNameInput) return [];
    return db.students.filter(s =>
      s.name.toLowerCase().includes(pStudentNameInput.toLowerCase()) ||
      (s.guardian && s.guardian.toLowerCase().includes(pStudentNameInput.toLowerCase()))
    );
  };

  const selectPaymentStudents = (students) => {
    const selected = students.filter(Boolean);
    const ids = [...new Set(selected.map(s => s._id))];
    if (!ids.length) return;
    const guardian = selected[0].guardian || 'No Guardian';
    const label = ids.length === 1
      ? `${selected[0].name} (${guardian})`
      : `${guardian} family (${ids.length} students)`;
    setPStudentSelectedId(ids[0]);
    setPStudentSelectedIds(ids);
    setPStudentSelectedText(label);
    setPStudentNameInput(label);
    setPStudentDropdownOpen(false);
    setPAmount(selected[0].fee || '');
    setPSession(selected[0].session || 'Weekends');
    // Seed each child's own fee/session — siblings under the same guardian
    // often pay different amounts or attend different sessions.
    const amounts = {};
    const sessions = {};
    selected.forEach(s => {
      amounts[s._id] = String(s.fee || '');
      sessions[s._id] = s.session || 'Weekends';
    });
    setPStudentAmounts(amounts);
    setPStudentSessions(sessions);
    // Default split: full amount in cash, nothing online, per child.
    const cashAmts = {};
    const onlineAmts = {};
    selected.forEach(s => {
      cashAmts[s._id] = String(s.fee || '');
      onlineAmts[s._id] = '0';
    });
    setPStudentCashAmounts(cashAmts);
    setPStudentOnlineAmounts(onlineAmts);
    setPCashAmount(selected[0].fee || '');
    setPOnlineAmount('0');
    // If it's a single student and their most recent payment was split
    // (part cash, part online), auto-check "Split this payment" so the
    // admin doesn't have to re-tick it every time — but leave the amount
    // boxes empty; those are for the NEW money coming in now, not a copy
    // of the old split.
    if (ids.length === 1) {
      const payments = selected[0].payments || [];
      const relevantPayment = payments.find(p => p.month === pMonths[0]) || payments[payments.length - 1];
      // The reliable signal that a past payment was made through the split
      // toggle is method === 'Split (Cash+Online)' — NOT "both cash and
      // online > 0". If the admin split-entered Rs 3,000 cash and left
      // Online blank, that's still a split-flow entry (online just happens
      // to be 0), and method already records that correctly.
      const wasSplit = relevantPayment && relevantPayment.method === 'Split (Cash+Online)';
      // A partial/PENDING payment already sitting against this exact month
      // means these boxes are for the NEW top-up amount only — auto-filling
      // the full fee here double-counts on top of what's already received
      // (e.g. Rs 2,000 already in, fee Rs 5,000 auto-filled again → shows
      // Rs 7,000 total). Only auto-fill when the month is genuinely fresh.
      const existingIncomplete = relevantPayment && relevantPayment.month === pMonths[0] && relevantPayment.status !== 'PAID';
      setPSplitPayment(!!wasSplit);
      // Default the fee into Cash (mirroring the non-split default above)
      // instead of leaving both boxes blank. A blank split with Status
      // already defaulted to PAID showed a contradictory "Remaining: Rs X"
      // note the moment this modal opened, with no action from the admin.
      // The admin can still move some of it into Online as needed.
      setPCashAmount(wasSplit && !existingIncomplete ? String(selected[0].fee || '') : '');
      setPOnlineAmount(wasSplit && !existingIncomplete ? '0' : '');
    } else {
      setPSplitPayment(false);
    }
  };

  const updatePStudentAmount = (studentId, value) => {
    setPStudentAmounts(prev => ({ ...prev, [studentId]: value }));
  };
  const updatePStudentSession = (studentId, value) => {
    setPStudentSessions(prev => ({ ...prev, [studentId]: value }));
  };
  const updatePStudentCash = (studentId, value) => {
    setPStudentCashAmounts(prev => ({ ...prev, [studentId]: value }));
  };
  const updatePStudentOnline = (studentId, value) => {
    setPStudentOnlineAmounts(prev => ({ ...prev, [studentId]: value }));
  };
  // Resolve how one student's fee was actually received — split (cash +
  // online) when the toggle is on, otherwise the single Method dropdown.
  const cashPortionForStudent = (studentId) =>
    pStudentSelectedIds.length > 1
      ? (Number(pStudentCashAmounts[studentId]) || 0)
      : (Number(pCashAmount) || 0);
  const onlinePortionForStudent = (studentId) =>
    pStudentSelectedIds.length > 1
      ? (Number(pStudentOnlineAmounts[studentId]) || 0)
      : (Number(pOnlineAmount) || 0);
  // Resolve the fee actually being charged for one student in this payment —
  // per-child amount when a family is selected, otherwise the single Amount field.
  const feeForPaymentStudent = (studentId) =>
    pStudentSelectedIds.length > 1
      ? (Number(pStudentAmounts[studentId]) || 0)
      : (Number(pAmount) || 0);
  const sessionForPaymentStudent = (studentId, fallback) =>
    pStudentSelectedIds.length > 1
      ? (pStudentSessions[studentId] || fallback || 'Weekends')
      : (pSession || fallback || 'Weekends');

  // Half/partial payment support — only wired up for the simple single
  // student + single month case (family payments and multi-month batches
  // keep the old PAID/UNPAID-only behaviour untouched).
  const isSinglePaymentCase = pStudentSelectedIds.length === 1 && pMonths.length === 1;
  const singlePaymentStudent = isSinglePaymentCase ? db.students.find(s => s._id === pStudentSelectedIds[0]) : null;
  // Excludes an already-PAID record for this month: a PAID payment is
  // locked, so a new "Record Payment" for that month is always a brand new,
  // independent entry — never a top-up added on top of the locked amount.
  // Excludes the payment currently being edited itself, so re-opening it in
  // Edit mode doesn't count its own already-received amount as "already
  // received on top of" — the form should show what's really there, not
  // double it.
  const singlePaymentExisting = singlePaymentStudent && singlePaymentStudent.payments
    ? singlePaymentStudent.payments.find(p => p.month === pMonths[0] && p.status !== 'PAID' && !(editPaymentTarget && String(p._id) === String(editPaymentTarget.paymentId)))
    : null;
  // Legacy payments (saved before amountPaid existed) count as fully paid if
  // their status is PAID, so old records don't suddenly look "half paid".
  const alreadyReceivedForSingle = singlePaymentExisting
    ? (singlePaymentExisting.amountPaid !== undefined && singlePaymentExisting.amountPaid !== null && singlePaymentExisting.amountPaid > 0
        ? Number(singlePaymentExisting.amountPaid) || 0
        : (singlePaymentExisting.status === 'PAID' ? (Number(singlePaymentExisting.fee) || 0) : 0))
    : 0;
  // When split (Cash + Online) is on for a single student/month, the two
  // split inputs ARE the "amount received now" — no separate field needed.
  // Otherwise the plain "Amount Received Now" field is used.
  const splitReceivedNowForSingle = (Number(pCashAmount) || 0) + (Number(pOnlineAmount) || 0);
  const receivedNowForSingle = pSplitPayment ? splitReceivedNowForSingle : (Number(pAmountReceived) || 0);
  const totalReceivedForSingle = alreadyReceivedForSingle + receivedNowForSingle;

  // Status used to be hardcoded to PAID whenever the modal opened, even when
  // this student/month already had a partial payment sitting at e.g. 3000 of
  // 5000. That showed "Status: PAID" right next to a note saying "Remaining:
  // Rs 2,000", which is exactly backwards. Recompute the default the moment
  // we know which student+month is selected and how much they already paid
  // — but only while the admin hasn't started typing a new amount, so we
  // never fight their manual choice.
  useEffect(() => {
    if (!paymentModalOpen || !isSinglePaymentCase) return;
    const untouched = pAmountReceived === '' && !pSplitPayment;
    if (!untouched) return;
    if (!['PAID', 'UNPAID', 'PENDING'].includes(pStatus) && pStatus !== 'PAID') return;
    const fee = Number(pAmount) || 0;
    setPStatus(computedSinglePaymentStatus(fee, alreadyReceivedForSingle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentModalOpen, isSinglePaymentCase, alreadyReceivedForSingle, pAmount]);
  const remainingForSingle = Math.max(0, (Number(pAmount) || 0) - totalReceivedForSingle);
  const computedSinglePaymentStatus = (fee, received) => {
    const f = Number(fee) || 0;
    const r = Number(received) || 0;
    if (r <= 0) return 'UNPAID';
    if (f > 0 && r >= f) return 'PAID';
    return 'PENDING';
  };

  // Let the admin drop one child out of a family payment — e.g. they picked
  // "Pay all children of X" but this time only want to pay for some of them.
  const removeStudentFromPayment = (studentId) => {
    const remainingIds = pStudentSelectedIds.filter(id => id !== studentId);
    setPStudentAmounts(prev => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setPStudentSessions(prev => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setPStudentCashAmounts(prev => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setPStudentOnlineAmounts(prev => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    const remainingStudents = db.students.filter(s => remainingIds.includes(s._id));
    if (remainingStudents.length <= 1) {
      // Back down to the simple single-student flow.
      const only = remainingStudents[0];
      setPStudentSelectedId(only ? only._id : '');
      setPStudentSelectedIds(only ? [only._id] : []);
      setPStudentSelectedText(only ? `${only.name} (${only.guardian || 'No Guardian'})` : '');
      setPStudentNameInput(only ? `${only.name} (${only.guardian || 'No Guardian'})` : '');
      setPAmount(only ? (pStudentAmounts[only._id] ?? only.fee ?? '') : '');
      setPSession(only ? (pStudentSessions[only._id] || only.session || 'Weekends') : 'Weekends');
    } else {
      const guardian = remainingStudents[0].guardian || 'No Guardian';
      setPStudentSelectedIds(remainingIds);
      setPStudentSelectedText(`${guardian} family (${remainingIds.length} students)`);
      setPStudentNameInput(`${guardian} family (${remainingIds.length} students)`);
    }
  };

  // Multi-month selection for Record Payment: lets an admin log 2-3
  // months' fee in one go (same date, same amount per month).
  const togglePMonthPick = (ym) => {
    setPMonthPickerChecked(prev => prev.includes(ym) ? prev.filter(x => x !== ym) : [...prev, ym].sort());
  };
  const removePaymentMonth = (m) => {
    setPMonths(prev => prev.filter(x => x !== m));
  };

  const savePayment = async (e) => {
    e.preventDefault();
    if (savingPayment) return;

    // Edit mode: this modal was opened from Payment History to correct an
    // existing record. Send one direct PUT to that exact payment instead of
    // the create flow below (no student/month loop, no duplicate-month
    // check — we're editing the record that already exists, not adding a
    // new one).
    if (editPaymentTarget) {
      if (!pAmount || pMonths.length === 0 || !pDate) {
        triggerToast('Amount, Month and Date are required', '#ff3b5c');
        return;
      }
      const cashAmt = pSplitPayment ? (Number(pCashAmount) || 0) : 0;
      const onlineAmt = pSplitPayment ? (Number(pOnlineAmount) || 0) : 0;
      const amountPaidValue = pStatus === 'UNPAID' ? 0 : (pStatus === 'PENDING' ? (Number(pAmountReceived) || 0) : (Number(pAmount) || 0));
      const payload = {
        fee: Number(pAmount) || 0,
        feeDate: pDate,
        month: pMonths[0],
        status: pStatus,
        method: pSplitPayment ? 'Split (Cash+Online)' : pMethod,
        cashAmount: cashAmt,
        onlineAmount: onlineAmt,
        amountPaid: amountPaidValue,
        notes: pNotes,
        readmissionFee: Number(pReadmissionFee) || 0,
        readmissionDate: pReadmissionDate,
        readmissionStatus: pReadmissionStatus,
        readmissionMethod: pReadmissionMethod
      };
      setSavingPayment(true);
      try {
        const res = await fetch(`/api/students/${editPaymentTarget.studentId}/payments/${editPaymentTarget.paymentId}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          triggerToast('Payment updated!', '#00a876');
          setPaymentModalOpen(false);
          setEditPaymentTarget(null);
          loadData();
        } else {
          triggerToast(data.error || 'Failed to update payment', '#ff3b5c');
        }
      } catch (err) {
        triggerToast('Error updating payment', '#ff3b5c');
      } finally {
        setSavingPayment(false);
      }
      return;
    }

    if (!pStudentSelectedIds.length) {
      triggerToast('Please select a student or guardian family', '#ff3b5c');
      return;
    }
    if (pMonths.length === 0 || !pDate) {
      triggerToast('Month and Date are required', '#ff3b5c');
      return;
    }
    const isFamilyPayment = pStudentSelectedIds.length > 1;
    if (!isFamilyPayment && !pAmount) {
      triggerToast('Amount, Month and Date are required', '#ff3b5c');
      return;
    }
    if (isFamilyPayment && pStudentSelectedIds.some(id => !pStudentAmounts[id])) {
      triggerToast('Please enter a fee for every child', '#ff3b5c');
      return;
    }
    // PENDING (partial payment) tracking only knows how to record "amount
    // received now" for one student + one month — a family payment or a
    // multi-month batch marked PENDING here would silently save with no
    // amount received at all, showing Rs 0 collected on the dashboard even
    // though money may have actually come in.
    if (pStatus === 'PENDING' && !isSinglePaymentCase) {
      triggerToast('PENDING (partial payment) only works for one student and one month at a time. Select just one, or use PAID/UNPAID instead.', '#ff3b5c');
      return;
    }

    const sortedMonths = [...pMonths].sort();
    const selectedStudents = db.students.filter(s => pStudentSelectedIds.includes(s._id));

    // A month that's already PAID is locked — block the whole save up front
    // (before any request goes out) rather than letting it create a
    // duplicate record for that student/month.
    for (const student of selectedStudents) {
      for (const month of sortedMonths) {
        const paidExisting = student.payments && student.payments.find(p => p.month === month && p.status === 'PAID');
        if (paidExisting) {
          triggerToast(`Payment for ${month} already exists for ${student.name}. Delete it first if you need to redo it.`, '#ff3b5c');
          return;
        }
      }
    }

    setSavingPayment(true);

    // Show the receipt and close the modal right away — every value it
    // needs (fees, sessions, admission flags) is already sitting in local
    // state, so there's no reason to make the admin stare at the modal
    // waiting on the network before they see it. The actual save runs in
    // the background below; if it fails, an error toast still surfaces it.
    setPaymentModalOpen(false);
    triggerToast(`Payment logged${selectedStudents.length > 1 ? ` for ${selectedStudents.length} students` : ''}!`, '#00a876');
    // PENDING only ever applies to the single-student/single-month case, but
    // it's still real money received — the admin should get a slip for it
    // too, not just for a full PAID payment.
    if (pStatus === 'PAID' || pStatus === 'PENDING') {
      // Each child's own fee — siblings can pay different amounts, so this
      // is a per-student total, not one amount multiplied by headcount.
      const perStudentFees = selectedStudents.map(s => feeForPaymentStudent(s._id));
      const totalPerMonth = perStudentFees.reduce((sum, f) => sum + f, 0);
      const feesDiffer = new Set(perStudentFees).size > 1;
      const totalCash = pSplitPayment ? selectedStudents.reduce((sum, s) => sum + cashPortionForStudent(s._id), 0) * sortedMonths.length : 0;
      const totalOnline = pSplitPayment ? selectedStudents.reduce((sum, s) => sum + onlinePortionForStudent(s._id), 0) * sortedMonths.length : 0;
      const receivedNow = pStatus === 'PENDING' ? totalReceivedForSingle : totalPerMonth * sortedMonths.length;
      const fakePayment = {
        fee: totalPerMonth * sortedMonths.length,
        perMonthFee: totalPerMonth,
        feeDate: pDate,
        month: sortedMonths.length > 1 ? sortedMonths.join(', ') : sortedMonths[0],
        months: sortedMonths,
        status: pStatus,
        method: pSplitPayment ? 'Split (Cash+Online)' : pMethod,
        cashAmount: totalCash,
        onlineAmount: totalOnline,
        amountPaid: receivedNow,
        notes: pNotes,
        readmissionFee: (Number(pReadmissionFee) || 0) * selectedStudents.length,
        readmissionDate: pReadmissionDate,
        readmissionStatus: pReadmissionStatus,
        readmissionMethod: pReadmissionMethod
      };
      if (selectedStudents.length) {
        const sessions = [...new Set(selectedStudents.map(s => sessionForPaymentStudent(s._id, s.session)).filter(Boolean))];
        // A Record Payment receipt never shows admission fee as paid/received
        // — marking admission paid happens only from Edit Student, which pops
        // its own dedicated admission receipt. Here, admission only ever
        // appears as an UNPAID reminder when it's genuinely still owed.
        const admissionInfoFor = (s) => {
          const stillOwed = s.admissionFeeStatus !== 'PAID' && (s.admissionFee || 0) > 0;
          return { fee: stillOwed ? (s.admissionFee || 0) : 0, received: 0 };
        };
        const admissionDisplay = isSinglePaymentCase && singlePaymentStudent && singlePaymentStudent.admissionFeeStatus !== 'PAID'
          ? (singlePaymentStudent.admissionFee || 0)
          : 0;
        setSlipData({
          student: { ...selectedStudents[0], session: sessions.length === 1 ? sessions[0] : 'Multiple sessions' },
          // Each child carries their own resolved fee/session so the combined
          // receipt can show a per-child breakdown when they differ.
          students: selectedStudents.map(s => {
            const admissionInfo = admissionInfoFor(s);
            return {
              ...s,
              session: sessionForPaymentStudent(s._id, s.session),
              receiptFee: feeForPaymentStudent(s._id) * sortedMonths.length,
              receiptStatus: pStatus,
              receiptReceived: pStatus === 'PENDING' ? totalReceivedForSingle : feeForPaymentStudent(s._id) * sortedMonths.length,
              receiptMethod: pSplitPayment ? 'Split (Cash+Online)' : pMethod,
              receiptCashAmount: pSplitPayment ? cashPortionForStudent(s._id) * sortedMonths.length : 0,
              receiptOnlineAmount: pSplitPayment ? onlinePortionForStudent(s._id) * sortedMonths.length : 0,
              receiptAdmissionFee: admissionInfo.fee,
              receiptAdmissionReceived: admissionInfo.received,
              receiptAdmissionMethod: s.admissionMethod
            };
          }),
          feesDiffer,
          showPerChildStatus: selectedStudents.length > 1,
          payment: fakePayment,
          admissionFee: admissionDisplay,
          admissionFeeReceived: 0,
          admissionMethod: isSinglePaymentCase && singlePaymentStudent ? singlePaymentStudent.admissionMethod : undefined
        });
        setSlipModalOpen(true);
      }
    }

    try {
      // Log one payment record per selected month, same date/amount/status
      // for each. Process sequentially (not in parallel) since each write
      // pushes into the same student document's payments array.
      for (const student of selectedStudents) {
        let latestStudent = student;
        const studentFee = feeForPaymentStudent(student._id);
        const studentSession = sessionForPaymentStudent(student._id, student.session);
        const studentCash = pSplitPayment ? cashPortionForStudent(student._id) : 0;
        const studentOnline = pSplitPayment ? onlinePortionForStudent(student._id) : 0;
        // Once the split toggle is on, the record IS a split entry — even
        // if the admin puts everything in one box and leaves the other at
        // 0 (e.g. Rs 2,000 cash, Online left blank). Downgrading that to
        // plain 'Cash' loses the fact it came through the split flow, which
        // is exactly what made auto-detecting "was this split before" fail.
        const studentMethod = pSplitPayment ? 'Split (Cash+Online)' : pMethod;
        for (const month of sortedMonths) {
        const payload = {
          fee: studentFee,
          feeDate: pDate,
          month,
          status: pStatus,
          method: studentMethod,
          cashAmount: pSplitPayment ? studentCash : 0,
          onlineAmount: pSplitPayment ? studentOnline : 0,
          notes: pNotes,
          readmissionFee: Number(pReadmissionFee) || 0,
          readmissionDate: pReadmissionDate,
          readmissionStatus: pReadmissionStatus,
          readmissionMethod: pReadmissionMethod
        };
        // Half/partial payment: only applies to the simple single student +
        // single month case. Adds this transaction's amount on top of
        // whatever was already received for this student+month, and lets
        // the amount actually received drive PAID/PENDING/UNPAID.
        if (isSinglePaymentCase && student._id === pStudentSelectedIds[0] && month === pMonths[0]) {
          payload.amountPaid = totalReceivedForSingle;
          if (['PAID', 'UNPAID', 'PENDING'].includes(pStatus)) {
            payload.status = computedSinglePaymentStatus(studentFee, totalReceivedForSingle);
          }
          if (pSplitPayment) {
            // cashAmount/onlineAmount on the payment record are running
            // totals across every installment, not just this transaction —
            // otherwise a 2nd or 3rd top-up would overwrite (not add to)
            // what was already received. newCashAmount/newOnlineAmount are
            // this transaction's own amount, logged as one more entry in
            // the installments history so the receipt can list "Rs 2,000
            // cash, then Rs 1,000 online, then Rs 1,000 online" in full.
            const existingForThis = latestStudent && latestStudent.payments && latestStudent.payments.find(p => p.month === month && p.status !== 'PAID');
            payload.cashAmount = (existingForThis?.cashAmount || 0) + studentCash;
            payload.onlineAmount = (existingForThis?.onlineAmount || 0) + studentOnline;
            payload.newCashAmount = studentCash;
            payload.newOnlineAmount = studentOnline;
          }
        }

        // Only reuse (edit) an existing record for this month while it's
        // still unpaid/partial. Once a payment is PAID it's locked, so a
        // new payment attempt for that same month always creates a brand
        // new record instead of touching the locked one.
        const existingPayment = latestStudent && latestStudent.payments && latestStudent.payments.find(p => p.month === month && p.status !== 'PAID');

        const res = existingPayment
          ? await fetch(`/api/students/${student._id}/payments/${existingPayment._id}`, {
              method: 'PUT',
              headers: getHeaders(),
              body: JSON.stringify(payload)
            })
          : await fetch(`/api/students/${student._id}/payments`, {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify(payload)
            });
        const data = await res.json();
        if (!res.ok) {
          triggerToast(data.error || `Failed to log payment for ${student.name}`, '#ff3b5c');
          return;
        }
        latestStudent = data;
        }

      // Reflect this student's new payment in the list immediately instead
      // of waiting on the full /api/data reload below — that's what made a
      // just-recorded payment take a while to show up for a student who
      // wasn't already showing a payment for the filtered month.
        setDb(prev => ({
          ...prev,
          students: prev.students.map(s => (s._id === latestStudent._id ? latestStudent : s))
        }));

      // Session can be changed right from this form — persist it on the
      // student record if it was actually edited. Fire-and-forget: the
      // payment itself already saved successfully either way.
        if (studentSession && studentSession !== student.session) {
        fetch(`/api/students/${student._id}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ session: studentSession })
        }).catch(() => {});
        }
      }

      loadData();
    } catch (err) {
      triggerToast('Error logging payment', '#ff3b5c');
    } finally {
      setSavingPayment(false);
    }
  };

  // Payment History
  const openStudentHistory = (student) => {
    setHistoryStudent(student);
    setHistoryModalOpen(true);
  };

  const confirmStatusChange = async () => {
    if (!statusDateTarget) return;
    const { studentId, paymentId, newStatus } = statusDateTarget;

    const payload = {
      status: newStatus,
      feeDate: statusDateInput || localToday()
    };

    try {
      const res = await fetch(`/api/students/${studentId}/payments/${paymentId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast('Status updated!', '#00a876');
        setStatusDateModalOpen(false);
        loadData();
        // refresh history view
        const updatedStudent = data;
        setHistoryStudent(updatedStudent);
      } else {
        triggerToast(data.error || 'Failed to update status', '#ff3b5c');
      }
    } catch (e) {
      triggerToast('Connection error', '#ff3b5c');
    }
  };

  const triggerStatusUpdate = (studentId, payment, newStatus) => {
    setStatusDateTarget({ studentId, paymentId: payment._id, newStatus });
    setStatusDateInput(localToday());
    setStatusDateModalOpen(true);
  };

  // Method can be corrected straight from the history row, the same way the
  // status dropdown works. The payments API already accepts `method`.
  const updatePaymentMethod = async (studentId, payment, newMethod) => {
    if (newMethod === payment.method) return;
    try {
      const res = await fetch(`/api/students/${studentId}/payments/${payment._id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ method: newMethod })
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast(`Method changed to ${newMethod}`, '#00a876');
        setHistoryStudent(data);
        loadData();
      } else {
        triggerToast(data.error || 'Failed to update method', '#ff3b5c');
      }
    } catch (err) {
      triggerToast(`Error updating method: ${err.message}`, '#ff3b5c');
    }
  };

  // Opens the same Record Payment modal, pre-filled from the payment being
  // corrected, so every field (amount, month, date, status, method, split,
  // session, notes, readmission) can be changed — not just a fixed subset.
  const openEditPayment = (studentId, payment) => {
    const student = db.students.find(s => s._id === studentId);
    const label = student ? `${student.name} (${student.guardian || 'No Guardian'})` : '';
    setEditPaymentTarget({ studentId, paymentId: payment._id });
    setPStudentSelectedId(studentId);
    setPStudentSelectedIds([studentId]);
    setPStudentSelectedText(label);
    setPStudentNameInput(label);
    setPStudentDropdownOpen(false);
    setPAmount(payment.fee ?? '');
    setPAmountReceived(payment.status === 'PENDING' ? String(payment.amountPaid ?? '') : '');
    setPMonths(payment.month ? [payment.month] : [localMonth()]);
    setPDate(payment.feeDate || localToday());
    setPStatus(payment.status || 'PAID');
    const isSplit = payment.method === 'Split (Cash+Online)' || ((payment.cashAmount || 0) > 0 && (payment.onlineAmount || 0) > 0);
    setPSplitPayment(isSplit);
    setPMethod(isSplit ? 'Cash' : (payment.method || 'Cash'));
    setPCashAmount(payment.cashAmount ? String(payment.cashAmount) : '');
    setPOnlineAmount(payment.onlineAmount ? String(payment.onlineAmount) : '');
    setPStudentAmounts({});
    setPStudentSessions({});
    setPStudentCashAmounts({});
    setPStudentOnlineAmounts({});
    // Those three exact strings are auto-written by the server for a
    // student's very first payment record (signup UNPAID/PENDING/PAID) —
    // not something an admin typed. Carrying that boilerplate into the
    // edit form reads as a leftover note even after the fee is paid, so
    // only pre-fill notes the admin actually wrote themselves.
    const autoNotes = ['Pending registration fee', 'Half payment received — balance pending', 'Initial registration fee'];
    setPNotes(autoNotes.includes(payment.notes) ? '' : (payment.notes || ''));
    setPSession(student?.session || 'Weekends');
    setPReadmissionFee(payment.readmissionFee ? String(payment.readmissionFee) : '');
    setPReadmissionDate(payment.readmissionDate || '');
    setPReadmissionStatus(payment.readmissionStatus || 'PAID');
    setPReadmissionMethod(payment.readmissionMethod || 'Cash');
    setPShowReadmission((payment.readmissionFee || 0) > 0);
    setHistoryModalOpen(false);
    setPaymentModalOpen(true);
  };

  const deletePayment = async (studentId, paymentId) => {
    if (!confirm('Delete this payment record permanently?')) return;
    try {
      const res = await fetch(`/api/students/${studentId}/payments/${paymentId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast('Payment deleted.', '#ff6b35');
        setHistoryStudent(data);
        loadData();
      }
    } catch (err) {
      triggerToast('Error deleting payment', '#ff3b5c');
    }
  };

  // ── CARRY FORWARD TO NEXT MONTH ──────────────────────────
  // Bulk-creates an UNPAID payment record for the chosen month for every
  // active student who doesn't already have a record for that month, so
  // admins don't have to manually "Record Payment" one-by-one each month.
  const openCarryForward = () => {
    const allMonths = db.students.flatMap(s => (s.payments || []).map(p => p.month)).filter(Boolean);
    let defaultMonth = localMonth();
    if (allMonths.length > 0) {
      const latest = allMonths.sort().slice(-1)[0];
      const [y, m] = latest.split('-').map(Number);
      const d = new Date(y, m, 1); // m is 1-based here, so this lands on the *next* month
      defaultMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    setCfMonth(defaultMonth);
    setCfFromMonth(prevMonthOf(defaultMonth));
    setCarryForwardModalOpen(true);
  };

  // The month right before 'YYYY-MM'.
  const prevMonthOf = (month) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1); // m-1 = the given month (0-based), so m-2 = the one before
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // Everyone on the FROM month's roster who is still active. Whether they end
  // up carried or skipped is decided below.
  const getCarryForwardRoster = () => {
    if (!cfMonth || !cfFromMonth) return [];
    return db.students.filter(s => {
      const payments = s.payments || [];

      const leftMonth = getLeftMonth(s);
      if (leftMonth === 'ALL') return false;
      if (leftMonth && cfMonth >= leftMonth) return false;

      const fromRecord = payments.find(p => p.month === cfFromMonth);
      if (!fromRecord) return false;               // wasn't on that month's roster
      if (fromRecord.status === 'LEFT') return false;
      return true;
    });
  };

  // Anyone who already has a record for the target month — typically because
  // they paid in advance. These are left completely untouched.
  const getCarryForwardSkipped = () =>
    getCarryForwardRoster().filter(s => (s.payments || []).some(p => p.month === cfMonth));

  const getCarryForwardTargets = () =>
    getCarryForwardRoster().filter(s => !(s.payments || []).some(p => p.month === cfMonth));

  const runCarryForward = async () => {
    if (!cfMonth || !cfFromMonth) {
      triggerToast('Please select both months', '#ff3b5c');
      return;
    }
    if (cfFromMonth >= cfMonth) {
      triggerToast('The "from" month must come before the "to" month', '#ff3b5c');
      return;
    }
    const targets = getCarryForwardTargets();
    if (targets.length === 0) {
      triggerToast('All active students already have a record for this month', '#ff6b35');
      return;
    }
    setCfRunning(true);
    let successCount = 0;
    for (const student of targets) {
      // Carry the fee from the month being carried forward, not whatever
      // happens to sit last in the array.
      const fromRecord = (student.payments || []).find(p => p.month === cfFromMonth);
      const lastFee = (fromRecord && fromRecord.fee) || student.fee || 0;
      const payload = {
        fee: lastFee,
        feeDate: `${cfMonth}-01`,
        month: cfMonth,
        status: 'UNPAID',
        method: 'Cash',
          notes: `Auto-carried forward from ${cfFromMonth}`
      };
      try {
        const res = await fetch(`/api/students/${student._id}/payments`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(payload)
        });
        if (res.ok) successCount++;
      } catch (err) {
        // continue with remaining students even if one fails
      }
    }
    setCfRunning(false);
    setCarryForwardModalOpen(false);
    loadData();
    triggerToast(`${successCount} student(s) carried forward from ${cfFromMonth} to ${cfMonth} as UNPAID`, '#00a876');
  };

  // Printing Slip
  const openSlip = (student, payment) => {
    // Admission fee belongs on this particular receipt if it was charged in
    // the SAME MONTH as this payment — not only on the exact same date.
    // Requiring an exact date match missed cases like admission paid on the
    // 3rd and this month's fee paid on the 5th, both in September, which
    // should still show together on that month's reprint. Show it whenever
    // that's true — even if it's still unpaid — instead of only when PAID,
    // so a reprint doesn't silently hide an unpaid admission fee tied to
    // this record. admissionFeeReceived (not just admissionFee) drives both
    // the PAID/UNPAID label and whether it counts toward Total Received.
    const paymentMonth = (payment.feeDate || (payment.month ? `${payment.month}-01` : '')).slice(0, 7);
    const admissionMonth = (student.admissionDate || '').slice(0, 7);
    const admissionRelevant = (student.admissionFee || 0) > 0 && !!admissionMonth && admissionMonth === paymentMonth;
    const admissionPaidNow = admissionRelevant && student.admissionFeeStatus === 'PAID';
    setSlipData({
      student,
      payment,
      admissionFee: admissionRelevant ? student.admissionFee : 0,
      admissionFeeReceived: admissionPaidNow ? student.admissionFee : 0,
      admissionMethod: student.admissionMethod
    });
    setSlipModalOpen(true);
  };

  const printSlip = () => {
    const printArea = document.getElementById('slip-print-area');
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

  // Share the receipt as an image via the device's native share sheet
  // (WhatsApp, Mail, social apps, etc). Falls back to downloading the
  // image if native sharing isn't available on the browser/device.
  const shareSlip = async () => {
    if (!slipContentRef.current || slipSharing) return;
    setSlipSharing(true);
    try {
      const canvas = await html2canvas(slipContentRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not generate image');

      const fileName = `Receipt-${(slipData?.booking?.teamName || slipData?.student?.name || 'Receipt').replace(/\s+/g, '-')}-${slipData?.booking?.date || slipData?.payment?.month || ''}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      const shareText = slipData?.booking
        ? `Booking receipt for ${slipData.booking.teamName || ''} — ${slipData.booking.date || ''}`
        : `Fee receipt for ${slipData?.student?.name || ''} — ${slipData?.payment?.month || ''}`;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Fee Receipt',
          text: shareText
        });
      } else if (navigator.share) {
        // Some browsers support navigator.share but not file sharing
        await navigator.share({ title: 'Fee Receipt', text: shareText });
      } else {
        // Desktop / unsupported browsers: download the image so the user
        // can attach it manually wherever they'd like.
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        triggerToast('Sharing not supported on this browser — image downloaded instead.', '#0d1b2e');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        triggerToast('Could not share the receipt.', '#ff3b5c');
      }
    } finally {
      setSlipSharing(false);
    }
  };

  // Deletion logic
  const openDeleteStudentModal = () => {
    setDelSearchQuery('');
    setDelSelectedStudents([]);
    setDeleteStudentModalOpen(true);
  };

  const confirmDeleteStudent = async () => {
    if (!delSelectedStudents.length) return;
    const names = delSelectedStudents.map(s => s.name).join(', ');
    const confirmMsg = delSelectedStudents.length === 1
      ? `Delete student "${delSelectedStudents[0].name}" permanently?`
      : `Delete ${delSelectedStudents.length} students permanently?\n\n${names}`;
    if (!confirm(confirmMsg)) return;

    const deletedIds = [];
    let failCount = 0;
    for (const student of delSelectedStudents) {
      try {
        const res = await fetch(`/api/students/${student._id}`, {
          method: 'DELETE',
          headers: getHeaders()
        });
        if (res.ok) deletedIds.push(student._id);
        else failCount++;
      } catch (err) {
        failCount++;
      }
    }

    if (deletedIds.length) {
      // Drop them from the list right away instead of waiting on the next
      // full /api/data reload — same reasoning as the add/edit save above.
      setDb(prev => ({ ...prev, students: prev.students.filter(s => !deletedIds.includes(s._id)) }));
      triggerToast(
        deletedIds.length === 1 ? 'Student deleted.' : `${deletedIds.length} students deleted.`,
        '#ff6b35'
      );
    }
    if (failCount) {
      triggerToast(`Failed to delete ${failCount} student(s).`, '#ff3b5c');
    }
    setDeleteStudentModalOpen(false);
    loadData();
  };

  // ── EXPENSES LOGIC ──────────────────────────────────────
  const getFilteredExpenses = () => {
    return db.expenses.filter(exp => {
      const dateToCheck = exp.date || exp.month || '';
      const matchYearMonthDayVal = matchYearMonthDay(dateToCheck, expYearFilter, expMonthFilter, expDayFilter);
      const matchCat = !expCatFilter || exp.category === expCatFilter;
      return matchYearMonthDayVal && matchCat;
    });
  };

  const filteredExpenses = getFilteredExpenses();

  const openAddExpense = () => {
    setEditingExpenseId(null);
    setETitle('');
    setEAmount('');
    setECategory('Salaries');
    setEDate(localToday());
    setEDescription('');
    setEMethod('Cash');
    setExpenseModalOpen(true);
  };

  const openEditExpense = (expense) => {
    setEditingExpenseId(expense._id);
    setETitle(expense.title || '');
    setEAmount(expense.amount ?? '');
    setECategory(expense.category || 'Salaries');
    setEDate(expense.date || localToday());
    setEDescription(expense.description || '');
    setEMethod(expense.method || 'Cash');
    setExpenseModalOpen(true);
  };

  const saveExpense = async (e) => {
    e.preventDefault();
    if (!eTitle || !eAmount) {
      triggerToast('Title and Amount are required', '#ff3b5c');
      return;
    }
    const payload = {
      title: eTitle,
      amount: Number(eAmount) || 0,
      category: eCategory,
      date: eDate,
      month: eDate.slice(0, 7),
      description: eDescription,
      method: eMethod
    };

    try {
      const res = editingExpenseId
        ? await fetch(`/api/expenses/${editingExpenseId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload)
          })
        : await fetch('/api/expenses', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
          });
      if (res.ok) {
        triggerToast(editingExpenseId ? 'Expense updated!' : 'Expense recorded!', '#00a876');
        setExpenseModalOpen(false);
        setEditingExpenseId(null);
        loadData();
      }
    } catch (err) {
      triggerToast(editingExpenseId ? 'Error updating expense' : 'Error recording expense', '#ff3b5c');
    }
  };

  const deleteExpense = async (id) => {
    if (!confirm('Delete this expense permanent?')) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        triggerToast('Expense deleted', '#ff6b35');
        loadData();
      }
    } catch (err) {
      triggerToast('Error deleting expense', '#ff3b5c');
    }
  };

  // ── STOCK & POS LOGIC ───────────────────────────────────
  const getFilteredStockTransactions = () => {
    return db.stockTransactions.filter(tx => {
      const dateToCheck = tx.date || '';
      const matchYearMonthDayVal = matchYearMonthDay(dateToCheck, stxYearFilter, stxMonthFilter, stxDayFilter);
      const matchType = !stxTypeFilter || tx.type === stxTypeFilter;
      return matchYearMonthDayVal && matchType;
    });
  };

  const filteredStockTransactions = getFilteredStockTransactions().sort((a, b) => {
    const dateCompare = (b.date || '').localeCompare(a.date || '');
    if (dateCompare !== 0) return dateCompare;
    return String(b._id).localeCompare(String(a._id));
  });

  const openAddStock = () => {
    setStName('');
    setStCategory('Bats');
    setStQty('');
    setStCost('');
    setStCondition('New');
    setStockModalOpen(true);
  };

  const saveStock = async (e) => {
    e.preventDefault();
    if (!stName || !stQty || !stCost) {
      triggerToast('Name, Qty and Cost are required', '#ff3b5c');
      return;
    }
    const payload = {
      item: stName,
      category: stCategory,
      qty: Number(stQty) || 0,
      unitCost: Number(stCost) || 0,
      condition: stCondition,
      lastUpdated: localToday()
    };

    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        triggerToast('Stock item added!', '#00a876');
        setStockModalOpen(false);
        loadData();
      }
    } catch (err) {
      triggerToast('Error saving stock item', '#ff3b5c');
    }
  };

  const updateStockQty = async (item, direction) => {
    const delta = direction === 'up' ? 1 : -1;
    const newQty = (item.qty || 0) + delta;
    if (newQty < 0) {
      triggerToast('Quantity cannot be less than 0', '#ff3b5c');
      return;
    }
    try {
      const res = await fetch(`/api/stock/${item._id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ qty: newQty, unitCost: item.unitCost })
      });
      if (res.ok) {
        triggerToast(direction === 'up' ? 'Restocked (+1)' : 'Write-off (-1)', '#00a876');
        loadData();
      } else {
        const data = await res.json();
        triggerToast(data.error || 'Error updating stock', '#ff3b5c');
      }
    } catch (err) {
      triggerToast('Error updating stock', '#ff3b5c');
    }
  };

  const deleteStock = async (id) => {
    if (!confirm('Delete this item from inventory?')) return;
    try {
      const res = await fetch(`/api/stock/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        triggerToast('Item removed', '#ff6b35');
        loadData();
      }
    } catch (err) {
      triggerToast('Error deleting item', '#ff3b5c');
    }
  };

  const openSellPicker = () => {
    if (db.stock.length === 0) {
      triggerToast('No items available in stock to sell', '#ff3b5c');
      return;
    }
    setSpCategory('All');
    setSpSelectedItemId(db.stock[0]._id);
    setSellPickerOpen(true);
  };

  // Only categories that actually hold stock are offered, so the filter can
  // never lead to an empty list by itself.
  const sellPickerCategories = [...new Set(db.stock.map((i) => i.category || 'Other'))].sort();
  const sellPickerItems = spCategory === 'All'
    ? db.stock
    : db.stock.filter((i) => (i.category || 'Other') === spCategory);

  const changeSellPickerCategory = (cat) => {
    setSpCategory(cat);
    const list = cat === 'All' ? db.stock : db.stock.filter((i) => (i.category || 'Other') === cat);
    setSpSelectedItemId(list.length > 0 ? list[0]._id : '');
  };

  const proceedToSell = () => {
    const item = db.stock.find(x => x._id === spSelectedItemId);
    if (!item) return;
    setSlItem(item);
    setSlQty('1');
    setSlPrice(item.unitCost * 1.25); // default markup 25%
    setSlDate(localToday());
    setSlNotes('');
    setSellPickerOpen(false);
    setSellFormOpen(true);
  };

  const confirmSell = async (e) => {
    e.preventDefault();
    if (!slQty || !slPrice) {
      triggerToast('Quantity and Price required', '#ff3b5c');
      return;
    }
    if (Number(slQty) > (slItem.qty || 0)) {
      triggerToast('Not enough stock available', '#ff3b5c');
      return;
    }
    const payload = {
      qty: Number(slQty),
      salePrice: Number(slPrice),
      date: slDate,
      notes: slNotes
    };

    try {
      const res = await fetch(`/api/stock/${slItem._id}/sell`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast('Item sold!', '#00a876');
        setSellFormOpen(false);
        loadData();
      } else {
        triggerToast(data.error || 'Failed to complete sale', '#ff3b5c');
      }
    } catch (err) {
      triggerToast('Error completing sale', '#ff3b5c');
    }
  };

  const deleteStockTransaction = async (id) => {
    if (!confirm('Delete this transaction and reverse its inventory impact?')) return;
    try {
      const res = await fetch(`/api/stock-transactions/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        triggerToast('Transaction deleted & stock reversed', '#00a876');
        loadData();
      }
    } catch (err) {
      triggerToast('Error deleting transaction', '#ff3b5c');
    }
  };

  // ── ATTENDANCE LOGIC ────────────────────────────────────
  // The month a student left, as 'YYYY-MM'. Earliest LEFT record wins; if a
  // student is marked LEFT with no LEFT record to point at, fall back to their
  // latest month. Returns '' for students who never left.
  const getLeftMonth = (s) => {
    const leftRecord = (s.payments || [])
      .filter(p => p.status === 'LEFT' && p.month)
      .sort((a, b) => a.month.localeCompare(b.month))[0];
    if (leftRecord) return leftRecord.month;
    if (s.status === 'LEFT') return s.month || 'ALL';
    return '';
  };

  const getAttendanceStudents = () => {
    return db.students.filter(s => {
      const matchSession = !attSessionFilter || s.session === attSessionFilter;
      const matchAge = !attAgeFilter || s.ageGroup === attAgeFilter;
      // Require an explicit payment record for the selected month. This
      // means a student only shows up for a given month once a record
      // exists for it (via registration or Carry Forward) — they won't
      // silently keep appearing every month afterwards, and a student
      // marked LEFT naturally stops appearing once Carry Forward stops
      // creating records for them.
      let matchMonth = true;
      let monthRecordStatus = s.status;
      if (attMonthFilter) {
        const p = s.payments && s.payments.find(pm => pm.month === attMonthFilter);
        matchMonth = !!p;
        if (p) monthRecordStatus = p.status;
      }
      // A student who left should still appear on the sheets for the months
      // they were training, but not from their leaving month onwards. Comparing
      // 'YYYY-MM' strings works because the format sorts chronologically.
      const leftMonth = getLeftMonth(s);
      if (leftMonth === 'ALL') return false;
      if (leftMonth && attMonthFilter && attMonthFilter >= leftMonth) return false;
      if (monthRecordStatus === 'LEFT') return false;
      const matchStatus = attStatusFilters.includes(monthRecordStatus);
      return matchSession && matchAge && matchMonth && matchStatus;
    }).map(s => {
      let monthStatus = s.status;
      if (attMonthFilter) {
        const p = s.payments && s.payments.find(pm => pm.month === attMonthFilter);
        if (p) monthStatus = p.status;
      }
      return { ...s, monthStatus };
    });
  };

  const attStudents = getAttendanceStudents();

  const printAttendance = () => {
    // Show the hidden print area and trigger print
    const printArea = document.getElementById('att-print-area');
    if (printArea) {
      printArea.style.display = 'block';
      document.body.classList.add('printing-attendance');
      window.print();
      document.body.classList.remove('printing-attendance');
      printArea.style.display = 'none';
    } else {
      window.print();
    }
  };

  // ── BOOKINGS & GROUND HOURS LOGIC ───────────────────────
  const getGroundHours = () => {
    return { open: groundOpen, close: groundClose };
  };

  // The cricket module only ever deals with cricket bookings; football lives in
  // its own page. Legacy rows have no `ground` and count as cricket.
  const cricketBookings = db.bookings.filter(bk => (bk.ground || 'CRICKET') === 'CRICKET');

  const getFilteredBookings = () => {
    return cricketBookings.filter(bk => {
      const matchDate = !bkDateFilter || bk.date === bkDateFilter;
      const matchStatus = !bkStatusFilter || bk.status === bkStatusFilter;
      const matchYearMonthVal = matchYearMonthDay(bk.date, bkYearFilter, bkMonthFilter, '');
      return matchDate && matchStatus && matchYearMonthVal;
    });
  };

  const filteredBookings = getFilteredBookings();

  const toHHMM = (h) => {
    const pad = (v) => String(v).padStart(2, '0');
    return `${pad(h)}:00`;
  };

  const fmtTime = (t) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:${String(m || 0).padStart(2, '0')} ${ampm}`;
  };

  const getDayScheduleSlots = () => {
    const { open, close } = getGroundHours();
    const isOvernight = close <= open;
    const list = [];

    const toMins = t => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + (m || 0);
    };

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

    const prevDate = shiftDateStr(scheduleDate, -1);

    // Bookings that start on this date (covers this evening's slots, and
    // any regular same-day bookings)
    const sameDayBookings = cricketBookings.filter(b => b.date === scheduleDate && b.status !== 'CANCELLED');

    // When ground hours cross midnight (e.g. 8PM-2AM), a booking made for
    // the PREVIOUS date (e.g. 11PM-2AM) spills into this date's early-morning
    // slots (12AM-2AM). Those bookings are stored under the previous date,
    // so they must be checked separately or this date's early slots would
    // wrongly show as available even though they're already booked.
    const spilloverBookings = isOvernight
      ? cricketBookings.filter(b => b.date === prevDate && b.status !== 'CANCELLED')
      : [];

    const isSlotBooked = (h) => {
      const slotStart = h * 60;
      const slotEnd = (h + 1) * 60;

      const sameDayHit = sameDayBookings.find(b => {
        const bStart = toMins(b.startTime);
        let bEnd = toMins(b.endTime);
        // If the booking's end clock-time is <= its start clock-time, it
        // crosses midnight (e.g. 23:00 -> 02:00) — extend it past the
        // 24:00 mark so the overlap math below works correctly instead of
        // wrongly treating it as ending before it starts.
        if (bEnd <= bStart) bEnd += 24 * 60;
        return slotStart < bEnd && slotEnd > bStart;
      });
      if (sameDayHit) return sameDayHit;

      // Only this date's early-morning tail (before ground close) can be
      // occupied by a booking that started the previous evening.
      return spilloverBookings.find(b => {
        const bStart = toMins(b.startTime);
        const bEnd = toMins(b.endTime);
        if (bEnd > bStart) return false; // not an overnight booking, no spillover
        return slotStart < bEnd; // spillover covers [0, bEnd) on this date
      });
    };

    const totalHours = 24;
    for (let i = 0; i < totalHours; i++) {
      let isOutside = false;
      if (close > open) {
        isOutside = i < open || i >= close;
      } else {
        // overnight gap
        isOutside = i >= close && i < open;
      }

      const booked = isOutside ? null : isSlotBooked(i);
      list.push({ hour: i, booked, isOutside });
    }

    return list;
  };

  const scheduleSlots = getDayScheduleSlots();

  const shiftScheduleDate = (days) => {
    if (!scheduleDate) return;
    const parts = scheduleDate.split('-');
    if (parts.length !== 3) return;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const d = new Date(year, month, day);
    d.setDate(d.getDate() + days);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setScheduleDate(`${yyyy}-${mm}-${dd}`);
  };

  const openGroundSettings = () => {
    setGsOpenVal(groundOpen);
    setGsCloseVal(groundClose);
    setGsFbOpenVal(fbOpen);
    setGsFbCloseVal(fbClose);
    setGroundHoursModalOpen(true);
  };

  const saveGroundSettings = async () => {
    setGroundOpen(gsOpenVal);
    setGroundClose(gsCloseVal);
    setFbOpen(gsFbOpenVal);
    setFbClose(gsFbCloseVal);
    setGroundHoursModalOpen(false);

    if (await saveSettingsToServer({
      groundOpen: gsOpenVal,
      groundClose: gsCloseVal,
      fbOpen: gsFbOpenVal,
      fbClose: gsFbCloseVal
    })) {
      triggerToast('Ground hours saved!', '#00a876');
    }
  };

  const populateStartTimes = () => {
    const { open, close } = getGroundHours();
    const list = [];
    const dur = Number(bkDuration) || 1;

    // slot calculation
    const totalHours = 24;
    for (let i = 0; i < totalHours; i++) {
      let exceeds = false;
      if (close > open) {
        exceeds = (i + dur) > close;
      } else {
        const endH = (i + dur) % 24;
        exceeds = endH > close && endH < open;
      }

      let isOutside = false;
      if (close > open) {
        isOutside = i < open || i >= close;
      } else {
        isOutside = i >= close && i < open;
      }

      if (!isOutside && !exceeds) {
        list.push(i);
      }
    }
    return list;
  };

  const startTimesAvailable = populateStartTimes();

  const getEndTimePreview = () => {
    if (!bkStart) return '';
    const startH = parseInt(bkStart.split(':')[0]);
    const dur = Number(bkDuration) || 1;
    const endH = (startH + dur) % 24;
    return toHHMM(endH);
  };

  const openAddBooking = (prefillDate = '', prefillStart = '') => {
    setEditingBookingId(null);
    setBkTeam('');
    setBkContact('');
    setBkDate(prefillDate || localToday());
    setBkStart(prefillStart || '');
    setBkDuration('1');
    setBkAmount('');
    setBkAmountPaid('');
    setBkPaymentDate(localToday());
    setBkMethod('Cash');
    setBkSplitPayment(false);
    setBkCashAmount('');
    setBkOnlineAmount('');
    setBkStatus('PENDING');
    setBkNotes('');
    setBkConflictWarn('');
    setBookingModalOpen(true);
  };

  const bookFromSchedule = () => {
    openAddBooking(scheduleDate);
  };

  const openEditBooking = (b) => {
    setBookingDetailModalOpen(false);
    setEditingBookingId(b._id);
    setBkTeam(b.teamName || '');
    setBkContact(b.contact || '');
    setBkDate(b.date || '');
    setBkStart(b.startTime || '');
    setBkDuration(String(b.duration || 1));
    setBkAmount(b.amount || '');
    setBkAmountPaid(b.amountPaid ?? '');
    setBkPaymentDate(b.paymentDate || b.date || '');
    setBkMethod(b.paymentMethod || 'Cash');
    // Same signal used for students: method === 'Split (Cash+Online)' is
    // what actually means "this was split", not "both amounts happen to be
    // > 0" — a booking split as Rs 3,000 cash / Rs 0 online is still split.
    const bkHasSplit = b.paymentMethod === 'Split (Cash+Online)';
    setBkSplitPayment(bkHasSplit);
    setBkCashAmount(bkHasSplit ? (b.cashAmount || 0) : '');
    setBkOnlineAmount(bkHasSplit ? (b.onlineAmount || 0) : '');
    setBkStatus(b.status || 'CONFIRMED');
    setBkNotes(b.notes || '');
    setBkConflictWarn('');
    setBookingModalOpen(true);
  };

  const saveBooking = async (e) => {
    e.preventDefault();
    if (!bkTeam) {
      triggerToast('Enter team name', '#ff3b5c');
      return;
    }
    if (!bkDate) {
      triggerToast('Select a date', '#ff3b5c');
      return;
    }
    if (!bkStart) {
      triggerToast('Select start time', '#ff3b5c');
      return;
    }
    const bkContactErr = phoneError(bkContact, { label: 'Contact number' });
    if (bkContactErr) {
      triggerToast(bkContactErr, '#ff3b5c');
      return;
    }

    const startH = parseInt(bkStart.split(':')[0]);
    const dur = Number(bkDuration) || 1;
    const endH = (startH + dur) % 24;
    const endTime = toHHMM(endH);

    // Split payment: Cash + Online added together is what was actually
    // received — doesn't have to equal the booking amount, so a half
    // payment split across two methods still works correctly.
    const bkFinalAmountPaid = bkSplitPayment
      ? (Number(bkCashAmount) || 0) + (Number(bkOnlineAmount) || 0)
      : (Number(bkAmountPaid) || 0);
    // Once split is on, the booking IS a split entry — even if the admin
    // put everything in one box and left the other at 0. Same fix as
    // students: don't require BOTH cash and online > 0 to call it split.
    const bkFinalMethod = bkSplitPayment ? 'Split (Cash+Online)' : bkMethod;

    const payload = {
      ground: 'CRICKET',
      teamName: bkTeam,
      contact: bkContact,
      date: bkDate,
      startTime: bkStart,
      endTime,
      duration: dur,
      amount: Number(bkAmount) || 0,
      amountPaid: bkFinalAmountPaid,
      status: bkStatus,
      paymentMethod: bkFinalMethod,
      cashAmount: bkSplitPayment ? (Number(bkCashAmount) || 0) : 0,
      onlineAmount: bkSplitPayment ? (Number(bkOnlineAmount) || 0) : 0,
      paymentDate: bkPaymentDate || bkDate,
      notes: bkNotes
    };

    // If this edit added NEW money on top of what the booking already had
    // (cash or online total went up), log that increase as one more
    // installment — same trail-of-payments idea as student fee history.
    if (editingBookingId) {
      const originalBooking = db.bookings.find(b => b._id === editingBookingId);
      if (originalBooking) {
        const newCash = Math.max(0, payload.cashAmount - (originalBooking.cashAmount || 0));
        const newOnline = Math.max(0, payload.onlineAmount - (originalBooking.onlineAmount || 0));
        if (newCash > 0 || newOnline > 0) {
          payload.newCashAmount = newCash;
          payload.newOnlineAmount = newOnline;
        }
      }
    } else if (payload.cashAmount > 0 || payload.onlineAmount > 0) {
      payload.newCashAmount = payload.cashAmount;
      payload.newOnlineAmount = payload.onlineAmount;
    }

    const method = editingBookingId ? 'PUT' : 'POST';
    const url = editingBookingId ? `/api/bookings/${editingBookingId}` : '/api/bookings';

    try {
      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast(editingBookingId ? 'Booking updated!' : 'Booking confirmed!', '#00a876');
        setBookingModalOpen(false);
        setSlipData({ booking: data });
        setSlipModalOpen(true);
        loadData();
      } else {
        setBkConflictWarn(data.error || 'Booking conflict or error saving');
        triggerToast(data.error || 'Failed to save booking', '#ff3b5c');
      }
    } catch (err) {
      triggerToast('Server communication error', '#ff3b5c');
    }
  };

  const deleteBooking = async (id) => {
    if (!confirm('Delete this booking permanently?')) return;
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        triggerToast('Booking deleted', '#ff6b35');
        setBookingDetailModalOpen(false);
        loadData();
      }
    } catch (err) {
      triggerToast('Error deleting booking', '#ff3b5c');
    }
  };

  // Readmission fee only counts toward a receipt when it was actually
  // marked PAID — legacy records with no status default to PAID.
  // Guarded with !slipData.booking: booking receipts don't have a
  // `.payment` object at all, so this must not touch it for those.
  const slipReadmissionAmt = slipData && !slipData.booking && (slipData.payment.readmissionStatus || 'PAID') === 'PAID'
    ? (slipData.payment.readmissionFee || 0)
    : 0;
  const slipStudents = slipData?.students || (slipData?.student ? [slipData.student] : []);
  const isFamilySlip = slipStudents.length > 1;
  // Actual monthly fee money received — NOT slipData.payment.fee (that's
  // what's owed, not what came in). amountPaid is the source of truth when
  // present; legacy PAID records without it were always full payments, but
  // an UNPAID/PENDING record with no amountPaid received nothing (or only
  // a partial), never the full fee — falling back to the fee there made
  // "Total Received" show money that was never actually collected.
  const slipMonthlyReceived = slipData && !slipData.booking
    ? (slipData.payment.amountPaid !== undefined && slipData.payment.amountPaid !== null && slipData.payment.amountPaid !== ''
        ? Number(slipData.payment.amountPaid) || 0
        : (slipData.payment.status === 'PAID' ? (slipData.payment.fee || 0) : 0))
    : 0;

  // Admission Fee status label — always says PAID/PARTIAL/UNPAID, and the
  // method (Cash/Online/Bank Transfer) whenever any money actually moved.
  const admissionLabel = (fee, received, method) => {
    const r = received || 0;
    if (r <= 0) return 'UNPAID';
    if (r < fee) return `PARTIAL — ${method || 'Cash'}`;
    return `PAID — ${method || 'Cash'}`;
  };

  return (
    <div className="dashboard-body">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="logo-row" style={{ position: 'relative' }}>
          <div className="logo-text" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0 }}>
            {academySettings.logo && (
              <div id="sb-logo-circle" style={{ width: '48px', height: '48px', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--surface2)' }}>
                <img src={academySettings.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <div style={{ minWidth: 0, textAlign: 'center' }}>
              <div className="logo-title">{academySettings.name}</div>
              <div className="logo-sub">{academySettings.tagline}</div>
            </div>
          </div>
          {!sidebarCollapsed && (
            <div className="sidebar-theme-slot" style={{ position: 'absolute', top: '14px', left: '14px' }}>
              <ThemeSwitcher compact mode={darkMode ? 'dark' : 'light'} onModeChange={(m) => toggleDarkMode(m === 'dark')} />
            </div>
          )}
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title="Toggle sidebar" style={{ position: 'absolute', top: '14px', right: '14px' }}>
            <span></span><span></span><span></span>
          </button>
        </div>
        <nav className="nav">
          <div className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`} onClick={() => { goToPage('dashboard'); setStudentPage(1); }}>
            <span className="nav-icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></span>
            <span>Dashboard</span>
          </div>
          <div className={`nav-item ${activePage === 'students' ? 'active' : ''}`} onClick={() => { goToPage('students'); setStudentPage(1); }}>
            <span className="nav-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
            <span>Students</span>
          </div>
          <div
            className={`nav-item ${activePage === 'expenses' ? 'active' : ''}`}
            onClick={() => { goToPage('expenses'); }}
            style={!isEnterprise ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
          >
            <span className="nav-icon"><svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>
            <span style={{ flex: 1 }}>Expenses</span>
            {!isEnterprise && <span className="nav-lock-badge">Enterprise</span>}
          </div>
          <div
            className={`nav-item ${activePage === 'stock' ? 'active' : ''}`}
            onClick={() => { goToPage('stock'); }}
            style={!isEnterprise ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
          >
            <span className="nav-icon"><svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
            <span style={{ flex: 1 }}>Stock / Inventory</span>
            {!isEnterprise && <span className="nav-lock-badge">Enterprise</span>}
          </div>
          <div className={`nav-item ${activePage === 'attendance' ? 'active' : ''}`} onClick={() => { goToPage('attendance'); }}>
            <span className="nav-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/><line x1="9" y1="9" x2="11" y2="9"/></svg></span>
            <span>Attendance</span>
          </div>
          <div
            className="nav-item"
            onClick={() => { if (!isEnterprise) { triggerToast('Ground Bookings requires the Enterprise plan. Contact the Super Admin to upgrade.', '#ff3b5c'); return; } setGroundMenuOpen(!groundMenuOpen); }}
            style={!isEnterprise ? { opacity: 0.45 } : undefined}
          >
            <span className="nav-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
            <span style={{ flex: 1, whiteSpace: 'nowrap' }}>Ground Bookings</span>
            {!isEnterprise
              ? <span className="nav-lock-badge">Enterprise</span>
              : <span style={{ fontSize: '10px', opacity: 0.7, flexShrink: 0 }}>{groundMenuOpen ? '▾' : '▸'}</span>}
          </div>
          {/* The two grounds are fully independent — separate schedules, separate
              bookings, separate totals. */}
          {groundMenuOpen && isEnterprise && (
            <>
              <div
                className={`nav-item ${activePage === 'bookings' ? 'active' : ''}`}
                onClick={() => { goToPage('bookings'); }}
                style={{ paddingLeft: '34px', fontSize: '13px' }}
              >
                <span className="nav-icon"><svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="6"/><line x1="7.5" y1="7.5" x2="7.5" y2="20"/><line x1="12" y1="7.5" x2="12" y2="20"/><line x1="16.5" y1="7.5" x2="16.5" y2="20"/></svg></span>
                <span style={{ whiteSpace: 'nowrap' }}>Cricket</span>
              </div>
              <div
                className={`nav-item ${activePage === 'football' ? 'active' : ''}`}
                onClick={() => { goToPage('football'); }}
                style={{ paddingLeft: '34px', fontSize: '13px' }}
              >
                <span className="nav-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polygon points="12,7.5 15.5,10 14.2,14 9.8,14 8.5,10"/><line x1="12" y1="3" x2="12" y2="7.5"/><line x1="20.5" y1="9.5" x2="15.5" y2="10"/><line x1="17.5" y1="19.5" x2="14.2" y2="14"/><line x1="6.5" y1="19.5" x2="9.8" y2="14"/><line x1="3.5" y1="9.5" x2="8.5" y2="10"/></svg></span>
                <span style={{ whiteSpace: 'nowrap' }}>Football</span>
              </div>
            </>
          )}
          <div style={{ flex: 1 }}></div>
          <div className={`nav-item ${activePage === 'settings' ? 'active' : ''}`} style={{ borderTop: '1px solid var(--border)', marginTop: '6px', borderRadius: '50px' }} onClick={() => { goToPage('settings'); }}>
            <span className="nav-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
            <span>Settings</span>
          </div>
          <div className={`nav-item ${activePage === 'contactinfo' ? 'active' : ''}`} onClick={() => { goToPage('contactinfo'); }}>
            <span className="nav-icon"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
            <span>Contact Info</span>
          </div>
          <div className="nav-item" onClick={() => setLogoutConfirmOpen(true)} style={{ color: '#ff3b5c', marginTop: '4px', flexShrink: 0 }}>
            <span className="nav-icon"><svg viewBox="0 0 24 24" stroke="#ff3b5c" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
            <span>Sign Out</span>
          </div>
        </nav>
      </div>

      {/* Main Workspace */}
      <div className="main" style={{ marginLeft: sidebarCollapsed ? '56px' : '220px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: 'var(--text)' }}>
            Loading dashboard data...
          </div>
        ) : (
          <div>
            {/* ── DASHBOARD PAGE ── */}
            <div className={`page ${activePage === 'dashboard' ? 'active' : ''}`}>
              <div className="page-header">
                <div>
                  <div className="page-title">Dashboard</div>
                  <div className="page-sub">
                    Academy overview {dashYear ? `— ${dashYear}` : ''} {dashMonth ? `— ${getMonthsList.find(m => m.value === dashMonth.split('-')[1])?.label || ''}` : ''} {dashDay.length ? `— Day ${[...dashDay].map(d => parseInt(d)).sort((a, b) => a - b).join(', ')}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={dashYear} onChange={(e) => { setDashYear(e.target.value); setDashMonth(''); }} style={{ width: '110px' }}>
                    <option value="">All Years</option>
                    {getYearsList(db.students.flatMap(s => s.payments), 'feeDate').concat(getYearsList(db.expenses, 'date')).concat(getYearsList(db.bookings, 'date')).filter((v,i,a) => a.indexOf(v) === i).sort().map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                  <select value={dashMonth} onChange={(e) => setDashMonth(e.target.value)} style={{ width: '150px' }}>
                    <option value="">All Months</option>
                    {getMonthsList.map(m => (
                      <option key={m.value} value={`${dashYear || new Date().getFullYear()}-${m.value}`}>{m.label}</option>
                    ))}
                  </select>
                  <div style={{ position: 'relative' }}>
                    <div
                      onClick={() => setDashDayPickerOpen(o => !o)}
                      style={{ cursor: 'pointer', width: '150px', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text)', fontSize: '13px' }}
                    >
                      <span>{dashDay.length ? `Day ${[...dashDay].map(d => parseInt(d)).sort((a, b) => a - b).join(', ')}` : 'All Days'}</span>
                      <span style={{ opacity: 0.6 }}>▾</span>
                    </div>
                    {dashDayPickerOpen && (
                      <div style={{ position: 'absolute', top: '100%', right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', zIndex: 999, marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '12px', width: '240px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>Pick one or more days</span>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDashDay([])}>Clear</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '10px' }}>
                          {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => {
                            const checked = dashDay.includes(d);
                            return (
                              <label
                                key={d}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                  fontSize: '12px', padding: '6px 0', borderRadius: '6px',
                                  background: checked ? 'var(--accent)' : 'var(--surface2)',
                                  color: checked ? 'var(--accent-ink)' : 'var(--text)', fontWeight: checked ? 700 : 400
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setDashDay(prev => checked ? prev.filter(x => x !== d) : [...prev, d])}
                                  style={{ display: 'none' }}
                                />
                                {parseInt(d)}
                              </label>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => setDashDayPickerOpen(false)}>Done</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Top Row of Small Cards */}
              <div className="stats-grid">
                <div className="stat-card blue" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('students', 'ALL', 'Total Students')}>
                  <div className="stat-num">{dashStats.totalStudents}</div>
                  <div className="stat-label">TOTAL STUDENTS</div>
                </div>
                <div className="stat-card green" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('students', 'PAID', 'Paid Students')}>
                  <div className="stat-num">{dashStats.paymentStatusBreakdown.PAID || 0}</div>
                  <div className="stat-label">PAID</div>
                </div>
                <div className="stat-card blue" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('students', 'FREEZE', 'Freeze Students')}>
                  <div className="stat-num">{dashStats.paymentStatusBreakdown.FREEZE || 0}</div>
                  <div className="stat-label">FREEZE</div>
                </div>
                <div className="stat-card orange" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('students', 'UNPAID', 'Unpaid Students')}>
                  <div className="stat-num">{dashStats.paymentStatusBreakdown.UNPAID || 0}</div>
                  <div className="stat-label">UNPAID</div>
                </div>
                <div className="stat-card teal" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('students', 'PENDING', 'Pending Students')}>
                  <div className="stat-num">{dashStats.paymentStatusBreakdown.PENDING || 0}</div>
                  <div className="stat-label">PENDING</div>
                </div>
                <div className="stat-card gray" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('students', 'LEFT', 'Left Students')}>
                  <div className="stat-num">{dashStats.paymentStatusBreakdown.LEFT || 0}</div>
                  <div className="stat-label">LEFT</div>
                </div>
              </div>

              {/* Second Row of Large Cards */}
              <div className="summary-row">
                <div className="summary-card" data-accent="green" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('txn', 'fees', 'Total Fees Collected')}>
                  <h4>TOTAL FEES COLLECTED</h4>
                  <div className="big" style={{ color: 'var(--paid)' }}>RS {dashStats.filteredFees.toLocaleString()}</div>
                  <div className="card-meta">{dashStats.paymentStatusBreakdown.PAID || 0} students paid</div>
                </div>
                <div className="summary-card" data-accent="blue" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('txn', 'admission', 'Admission Fees')}>
                  <h4>ADMISSION FEES</h4>
                  <div className="big" style={{ color: 'var(--freeze)' }}>RS {dashStats.filteredAdmissionFees.toLocaleString()}</div>
                  <div className="card-meta">{dashStats.admissionCount} new admission{dashStats.admissionCount === 1 ? '' : 's'}</div>
                </div>
                <div className="summary-card" data-accent="blue" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('txn', 'readmission', 'Readmission Fees')}>
                  <h4>READMISSION FEES</h4>
                  <div className="big" style={{ color: 'var(--freeze)' }}>RS {dashStats.filteredReadmissionFees.toLocaleString()}</div>
                  <div className="card-meta">{dashStats.readmissionCount} readmission{dashStats.readmissionCount === 1 ? '' : 's'}</div>
                </div>
                <div className="summary-card" data-accent="teal" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('txn', 'cricket', 'Cricket Bookings')}>
                  <h4>CRICKET BOOKINGS</h4>
                  <div className="big" style={{ color: '#00b8a9' }}>RS {dashStats.filteredCricketBookings.toLocaleString()}</div>
                  <div className="card-meta">{dashStats.cricketBookingsCount} finished booking{dashStats.cricketBookingsCount === 1 ? '' : 's'}</div>
                </div>
                <div className="summary-card" data-accent="purple" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('txn', 'football', 'Football Bookings')}>
                  <h4>FOOTBALL BOOKINGS</h4>
                  <div className="big" style={{ color: '#7c3aed' }}>RS {dashStats.filteredFootballBookings.toLocaleString()}</div>
                  <div className="card-meta">{dashStats.footballBookingsCount} finished booking{dashStats.footballBookingsCount === 1 ? '' : 's'}</div>
                </div>
                <div className="summary-card" data-accent="navy" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('txn', 'stock', 'Stock Items')}>
                  <h4>STOCK ITEMS</h4>
                  <div className="big" style={{ color: 'var(--freeze)' }}>{dashStats.totalStockQty} ITEMS</div>
                  <div className="card-meta">Rs {dashStats.totalStockVal.toLocaleString()} value - Sales Rs {dashStats.totalStockSales.toLocaleString()} - Buys Rs {dashStats.totalStockBuys.toLocaleString()}</div>
                </div>
                <div className="summary-card" data-accent="orange" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('txn', 'expenses', 'Total Expenses')}>
                  <h4>TOTAL EXPENSES</h4>
                  <div className="big" style={{ color: 'var(--unpaid)' }}>RS {dashStats.filteredExpenses.toLocaleString()}</div>
                  <div className="card-meta">{dashStats.expenseCount} expense entries</div>
                </div>
                <div className="summary-card" data-accent="green" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('txn', 'cash', 'Cash Payments')}>
                  <h4>CASH PAYMENTS</h4>
                  <div className="big" style={{ color: 'var(--paid)' }}>RS {dashStats.filteredCashFees.toLocaleString()}</div>
                  <div className="card-meta">{dashStats.cashTxCount} cash payment{dashStats.cashTxCount === 1 ? '' : 's'} — fees, admissions & bookings</div>
                </div>
                <div className="summary-card" data-accent="teal" style={{ cursor: 'pointer' }} onClick={() => openStatDetail('txn', 'online', 'Online Payments')}>
                  <h4>ONLINE PAYMENTS</h4>
                  <div className="big" style={{ color: '#00b8a9' }}>RS {dashStats.filteredOnlineFees.toLocaleString()}</div>
                  <div className="card-meta">{dashStats.onlineTxCount} online / bank — fees, admissions & bookings</div>
                </div>
                <div className="summary-card hero" data-accent={dashStats.netBalance >= 0 ? 'green' : 'red'}>
                  <div className="hero-inner">
                    <div>
                      <div className="hero-label">NET BALANCE</div>
                      <div className="hero-num">
                        RS {dashStats.netBalance.toLocaleString()}
                        <span
                          className="hero-tag"
                          style={{
                            background: dashStats.netBalance >= 0 ? '#00a87626' : '#ff3b5c26',
                            color: dashStats.netBalance >= 0 ? '#3ddc9a' : '#ff8098'
                          }}
                        >
                          {dashStats.netBalance >= 0 ? 'PROFIT' : 'LOSS'}
                        </span>
                      </div>
                    </div>
                    {/* Every rupee in, every rupee out — the number above, shown its working. */}
                    <div className="hero-eq">
                      {[
                        ['Fees', dashStats.filteredFees],
                        ['Admission', dashStats.filteredAdmissionFees],
                        ['Readmission', dashStats.filteredReadmissionFees],
                        ['Cricket', dashStats.filteredCricketBookings],
                        ['Football', dashStats.filteredFootballBookings]
                      ].map(([label, value], i) => (
                        <React.Fragment key={label}>
                          {i > 0 && <span className="eq-op">+</span>}
                          <span className="eq-item">
                            <em>{label}</em>
                            <b>{value.toLocaleString()}</b>
                          </span>
                        </React.Fragment>
                      ))}
                      <span className="eq-op">−</span>
                      <span className="eq-item out">
                        <em>Expenses</em>
                        <b>{dashStats.filteredExpenses.toLocaleString()}</b>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Third Row Columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className="dash-bottom">
                <div className="table-wrap" style={{ padding: '20px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '18px', fontSize: '15px', color: 'var(--text)' }}>Payment Status Breakdown</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', width: '150px', height: '150px', flexShrink: 0 }}>
                      <svg width="150" height="150" viewBox="0 0 150 150">
                        <g transform="rotate(-90 75 75)">
                          <circle cx="75" cy="75" r="58" fill="none" stroke="var(--border)" strokeWidth="20" />
                          {buildDonutSegments([
                            { label: 'PAID', value: dashStats.paymentStatusBreakdown.PAID || 0, color: 'var(--paid)' },
                            { label: 'FREEZE', value: dashStats.paymentStatusBreakdown.FREEZE || 0, color: 'var(--freeze)' },
                            { label: 'UNPAID', value: dashStats.paymentStatusBreakdown.UNPAID || 0, color: 'var(--unpaid)' },
                            { label: 'PENDING', value: dashStats.paymentStatusBreakdown.PENDING || 0, color: '#00b8a9' },
                            { label: 'DEFAULTER', value: dashStats.paymentStatusBreakdown.DEFAULTER || 0, color: 'var(--defaulter)' },
                            { label: 'LEFT', value: dashStats.paymentStatusBreakdown.LEFT || 0, color: 'var(--left)' },
                            { label: 'SPONSORED', value: dashStats.paymentStatusBreakdown.SPONSORED || 0, color: 'var(--sponsored)' }
                          ], 2 * Math.PI * 58).map((seg, i) => (
                            <circle key={i} cx="75" cy="75" r="58" fill="none" stroke={seg.color} strokeWidth="20"
                              strokeDasharray={`${seg.dash} ${2 * Math.PI * 58 - seg.dash}`}
                              strokeDashoffset={-seg.offset} strokeLinecap="butt" />
                          ))}
                        </g>
                      </svg>
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.5px' }}>TOTAL</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>{dashStats.totalStudents}</div>
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: '160px' }}>
                      {Object.entries({
                        PAID: 'var(--paid)',
                        FREEZE: 'var(--freeze)',
                        UNPAID: 'var(--unpaid)',
                        PENDING: '#00b8a9',
                        DEFAULTER: 'var(--defaulter)',
                        LEFT: 'var(--left)',
                        SPONSORED: 'var(--sponsored)'
                      }).map(([status, color]) => {
                        const count = dashStats.paymentStatusBreakdown[status] || 0;
                        const pct = dashStats.totalStudents ? Math.round((count / dashStats.totalStudents) * 100) : 0;
                        return (
                          <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', fontSize: '12.5px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', fontWeight: 600 }}>
                              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: color, flexShrink: 0 }}></span>
                              {status}
                            </div>
                            <span style={{ color: 'var(--muted)' }}>{count} ({pct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="table-wrap" style={{ padding: '20px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '18px', fontSize: '15px', color: 'var(--text)' }}>Age Group Distribution</div>
                  <div>
                    {Object.entries(dashStats.ageBreakdown).map(([age, count]) => {
                      const pct = dashStats.totalStudents ? Math.round((count / dashStats.totalStudents) * 100) : 0;
                      return (
                        <div key={age} style={{ marginBottom: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                            <span>{age}</span>
                            <span>{count}</span>
                          </div>
                          <div className="prog-bar">
                            <div className="prog-fill" style={{ width: `${pct}%`, background: '#1a56db' }}></div>
                          </div>
                        </div>
                      );
                    })}
                    {Object.keys(dashStats.ageBreakdown).length === 0 && <div style={{ color: 'var(--muted)', textAlign: 'center' }}>No student records found</div>}
                  </div>
                </div>
              </div>

              {/* Fees vs Expenses Trend */}
              <div className="table-wrap" style={{ padding: '20px', marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>Fees vs Expenses — Last 6 Months</div>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--muted)', fontWeight: 600 }}>
                      <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--paid)' }}></span>Fees Collected
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--muted)', fontWeight: 600 }}>
                      <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--unpaid)' }}></span>Expenses
                    </div>
                  </div>
                </div>
                {(() => {
                  const chartW = 680, chartH = 200, padL = 8, padR = 8, padT = 14, padB = 26;
                  const maxVal = Math.max(1, ...trendData.map(d => Math.max(d.fees, d.expenses))) * 1.15;
                  const stepX = (chartW - padL - padR) / Math.max(1, trendData.length - 1);
                  const scaleY = v => chartH - padB - (v / maxVal) * (chartH - padB - padT);
                  const feesPts = trendData.map((d, i) => [padL + i * stepX, scaleY(d.fees)]);
                  const expPts = trendData.map((d, i) => [padL + i * stepX, scaleY(d.expenses)]);
                  const toPath = pts => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
                  const feesLine = toPath(feesPts);
                  const feesArea = `${feesLine} L ${feesPts[feesPts.length - 1][0].toFixed(1)} ${chartH - padB} L ${feesPts[0][0].toFixed(1)} ${chartH - padB} Z`;
                  const expLine = toPath(expPts);
                  return (
                    <svg width="100%" height="220" viewBox={`0 0 ${chartW} ${chartH + 20}`} preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="feesTrendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--paid)" stopOpacity="0.30" />
                          <stop offset="100%" stopColor="var(--paid)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {[0, 0.25, 0.5, 0.75, 1].map(f => (
                        <line key={f} x1={padL} x2={chartW - padR} y1={padT + f * (chartH - padB - padT)} y2={padT + f * (chartH - padB - padT)} stroke="var(--border)" strokeWidth="1" />
                      ))}
                      <path d={feesArea} fill="url(#feesTrendGrad)" stroke="none" />
                      <path d={feesLine} fill="none" stroke="var(--paid)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d={expLine} fill="none" stroke="var(--unpaid)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      {feesPts.map((p, i) => <circle key={`f${i}`} cx={p[0]} cy={p[1]} r="3.5" fill="var(--surface)" stroke="var(--paid)" strokeWidth="2" />)}
                      {expPts.map((p, i) => <circle key={`e${i}`} cx={p[0]} cy={p[1]} r="3.5" fill="var(--surface)" stroke="var(--unpaid)" strokeWidth="2" />)}
                      {trendData.map((d, i) => (
                        <text key={i} x={padL + i * stepX} y={chartH + 12} textAnchor="middle" style={{ fontSize: '11px', fill: 'var(--muted)' }}>{d.label}</text>
                      ))}
                    </svg>
                  );
                })()}
              </div>
            </div>

            {/* ── STUDENTS PAGE ── */}
            <div className={`page ${activePage === 'students' ? 'active' : ''}`}>
              <div className="page-header">
                <div>
                  <div className="page-title">Students</div>
                  <div className="page-sub">{filteredStudents.length} student(s) registered</div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" onClick={openCarryForward} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    Carry Forward
                  </button>
                  <button className="btn btn-secondary" onClick={() => openAddPayment()} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    Record Payment
                  </button>
                  <button className="btn btn-danger" onClick={openDeleteStudentModal} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    Delete Student
                  </button>
                  <button className="btn btn-secondary" onClick={() => setImportModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    Import Excel
                  </button>
                  <button className="btn btn-primary" onClick={openAddStudent}>+ Add Student</button>
                </div>
              </div>

              <div className="controls">
                <div className="search-box" style={{ maxWidth: '300px' }}>
                  <input type="text" placeholder="Search by name, guardian..." value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                </div>
                <select value={studentStatusFilter} onChange={(e) => setStudentStatusFilter(e.target.value)}>
                  <option value="">All Status</option>
                  <option>PAID</option>
                  <option>FREEZE</option>
                  <option>UNPAID</option>
                  <option>DEFAULTER</option>
                  <option>LEFT</option>
                  <option>SPONSORED</option>
                </select>
                <select value={studentAgeFilter} onChange={(e) => setStudentAgeFilter(e.target.value)}>
                  <option value="">All Ages</option>
                  <option>Kids</option>
                  <option>U-8</option>
                  <option>U-10</option>
                  <option>U-12</option>
                  <option>U-14</option>
                  <option>U-16</option>
                  <option>U-18</option>
                  <option>U-20</option>
                  <option>Girls</option>
                </select>
                <select value={studentSessionFilter} onChange={(e) => setStudentSessionFilter(e.target.value)}>
                  <option value="">All Sessions</option>
                  <option>Weekends</option>
                  <option>Weekdays</option>
                  <option>Both</option>
                </select>
                <select value={studentYearFilter} onChange={(e) => { setStudentYearFilter(e.target.value); setStudentMonthFilter(''); }}>
                  <option value="">All Years</option>
                  {getYearsList(db.students, 'month').map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
                <select value={studentMonthFilter} onChange={(e) => setStudentMonthFilter(e.target.value)}>
                  <option value="">All Months</option>
                  {getMonthsList.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select value={studentDayFilter} onChange={(e) => setStudentDayFilter(e.target.value)}>
                  <option value="">All Days</option>
                  {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => (
                    <option key={d} value={d}>{parseInt(d)}</option>
                  ))}
                </select>
              </div>

              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '900px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '36px' }}>#</th>
                      <th>Student Name</th>
                      <th>Guardian</th>
                      <th style={{ width: '65px' }}>Age</th>
                      <th style={{ width: '95px' }}>Session</th>
                      <th style={{ width: '90px' }}>Monthly Fee</th>
                      <th style={{ width: '90px' }}>Date</th>
                      <th style={{ width: '90px' }}>Monthly Status</th>
                      <th>Contact</th>
                      <th style={{ width: '100px' }}>Admission Fee</th>
                      <th style={{ width: '100px' }}>Admission Status</th>
                      <th style={{ width: '110px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedStudents.length > 0 ? (
                      paginatedStudents.map((s, idx) => (
                        <tr key={s._id}>
                          <td>{((studentPage - 1) * studentsPerPage) + idx + 1}</td>
                          <td><strong>{s.name}</strong></td>
                          <td>{s.guardian || '—'}</td>
                          <td>{s.ageGroup}</td>
                          <td>{s.session}</td>
                          <td>Rs {(s.displayFee || 0).toLocaleString()}</td>
                          <td>{s.displayDate || '—'}</td>
                          <td><span className={`badge badge-${s.displayStatus}`}>{s.displayStatus}</span></td>
                          <td>
                            {s.contact || '—'}
                            {s.contact2 ? <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{s.contact2}</div> : null}
                          </td>
                          <td>Rs {(s.admissionFee || 0).toLocaleString()}</td>
                          <td><span className={`badge badge-${s.admissionFeeStatus || 'UNPAID'}`}>{s.admissionFeeStatus || 'UNPAID'}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: '5px' }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => openEditStudent(s)}>Edit</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => openStudentHistory(s)}>History</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="12" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No students found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalStudentPages > 1 && (
                <div className="pagination">
                  <button className="page-btn" disabled={studentPage === 1} onClick={() => setStudentPage(prev => prev - 1)}>◀</button>
                  <span className="page-info">Page {studentPage} of {totalStudentPages}</span>
                  <button className="page-btn" disabled={studentPage === totalStudentPages} onClick={() => setStudentPage(prev => prev + 1)}>▶</button>
                </div>
              )}
            </div>

            {/* ── EXPENSES PAGE ── */}
            <div className={`page ${activePage === 'expenses' ? 'active' : ''}`}>
              <div className="page-header">
                <div>
                  <div className="page-title">Expenses</div>
                  <div className="page-sub">Monthly expense tracker</div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" onClick={() => setImportModalOpen(true)}>Import Excel</button>
                  <button className="btn btn-primary" onClick={openAddExpense}>+ Add Expense</button>
                </div>
              </div>

              {/* Expenses Summary Cards */}
              <div className="summary-row" style={{ marginBottom: '20px' }}>
                <div className="summary-card" style={{ borderTop: '4px solid #ff6b35', minHeight: '100px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div className="big" style={{ fontSize: '36px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                    RS {filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                    TOTAL EXPENSES
                  </div>
                </div>
                <div className="summary-card" style={{ borderTop: '4px solid #1a56db', minHeight: '100px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div className="big" style={{ fontSize: '36px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                    {filteredExpenses.length}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                    ENTRIES
                  </div>
                </div>
              </div>

              <div className="controls" style={{ marginBottom: '20px' }}>
                <select value={expYearFilter} onChange={(e) => { setExpYearFilter(e.target.value); setExpMonthFilter(''); }}>
                  <option value="">All Years</option>
                  {getYearsList(db.expenses, 'date').map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
                <select value={expMonthFilter} onChange={(e) => setExpMonthFilter(e.target.value)}>
                  <option value="">All Months</option>
                  {getMonthsList.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select value={expDayFilter} onChange={(e) => setExpDayFilter(e.target.value)}>
                  <option value="">All Days</option>
                  {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => (
                    <option key={d} value={d}>{parseInt(d)}</option>
                  ))}
                </select>
                <select value={expCatFilter} onChange={(e) => setExpCatFilter(e.target.value)}>
                  <option value="">All Categories</option>
                  <option>Salaries</option>
                  <option>Equipment</option>
                  <option>Maintenance</option>
                  <option>Transport</option>
                  <option>Utilities</option>
                  <option>Marketing</option>
                  <option>Other</option>
                </select>
                {(expYearFilter || expMonthFilter || expDayFilter || expCatFilter) && (
                  <button className="btn btn-secondary btn-sm" onClick={() => { setExpYearFilter(''); setExpMonthFilter(''); setExpDayFilter(''); setExpCatFilter(''); }}>Clear</button>
                )}
              </div>

              <div className="cards-grid">
                {filteredExpenses.length > 0 ? (
                  filteredExpenses.map(e => (
                    <div className="card" key={e._id}>
                      <div className="card-header">
                        <div>
                          <div className="card-title">{e.title}</div>
                          <div className="card-meta">
                            <span>📅 {e.date}</span>
                            <span className="tag">{e.category}</span>
                            <span className="tag">{e.method || 'Cash'}</span>
                          </div>
                        </div>
                        <div className="card-amount">Rs {e.amount.toLocaleString()}</div>
                      </div>
                      {e.description && <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{e.description}</div>}
                      <div className="card-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditExpense(e)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteExpense(e._id)}>Delete</button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty" style={{ gridColumn: '1/-1' }}>
                    <div className="empty-icon">⬜</div>
                    <div>No expenses logged</div>
                  </div>
                )}
              </div>
            </div>

            {/* ── STOCK / INVENTORY PAGE ── */}
            <div className={`page ${activePage === 'stock' ? 'active' : ''}`}>
              <div className="page-header">
                <div>
                  <div className="page-title">Stock & Inventory POS</div>
                  <div className="page-sub">Bats, balls, kits, equipment — purchases, sales & live balance</div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" onClick={openSellPicker}>🛒 Sell Item</button>
                  <button className="btn btn-primary" onClick={openAddStock}>+ Add Item</button>
                </div>
              </div>

              {/* Inventory Summary Cards */}
              {(() => {
                const getStockCreationDate = (item) => {
                  try {
                    const timestamp = parseInt(item._id.toString().substring(0, 8), 16) * 1000;
                    return isNaN(timestamp) ? '' : new Date(timestamp).toISOString().slice(0, 10);
                  } catch (e) {
                    return item.lastUpdated || '';
                  }
                };

                const filteredStockList = db.stock.filter(item => {
                  if (stxYearFilter) {
                    const cDate = getStockCreationDate(item);
                    const cMonth = cDate ? cDate.slice(0, 7) : '';
                    if (stxMonthFilter) {
                      const filterMonthStr = `${stxYearFilter}-${stxMonthFilter}`;
                      if (cMonth && cMonth > filterMonthStr) return false;
                      if (stxDayFilter) {
                        const filterDateStr = `${stxYearFilter}-${stxMonthFilter}-${stxDayFilter}`;
                        if (cDate && cDate > filterDateStr) return false;
                      }
                    } else {
                      const regYear = cMonth ? cMonth.slice(0, 4) : '';
                      if (regYear && regYear > stxYearFilter) return false;
                    }
                  }
                  return true;
                });

                const totalStockValue = filteredStockList.reduce((sum, item) => sum + ((item.qty || 0) * (item.unitCost || 0)), 0);
                const itemsInStock = filteredStockList.length;
                const totalUnits = filteredStockList.reduce((sum, item) => sum + (item.qty || 0), 0);
                
                const filteredSales = db.stockTransactions.filter(tx => {
                  return matchYearMonthDay(tx.date || '', stxYearFilter, stxMonthFilter, stxDayFilter) && tx.type === 'SALE';
                });
                const totalSalesVal = filteredSales.reduce((sum, tx) => sum + (tx.amount || 0), 0);

                const filteredPurchases = db.stockTransactions.filter(tx => {
                  return matchYearMonthDay(tx.date || '', stxYearFilter, stxMonthFilter, stxDayFilter) && tx.type === 'PURCHASE';
                });
                const totalPurchasesVal = filteredPurchases.reduce((sum, tx) => sum + (tx.amount || 0), 0);

                const netCash = totalSalesVal - totalPurchasesVal;

                return (
                  <div className="summary-row" style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                    <div className="summary-card" style={{ borderTop: '4px solid #1a56db', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        RS {totalStockValue.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        TOTAL STOCK VALUE
                      </div>
                    </div>
                    <div className="summary-card" style={{ borderTop: '4px solid #00a876', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        {itemsInStock}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        ITEMS IN STOCK
                      </div>
                    </div>
                    <div className="summary-card" style={{ borderTop: '4px solid #34495e', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        {totalUnits}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        TOTAL UNITS
                      </div>
                    </div>
                    <div className="summary-card" style={{ borderTop: '4px solid #00a876', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        RS {totalSalesVal.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        SALES REVENUE
                      </div>
                    </div>
                    <div className="summary-card" style={{ borderTop: '4px solid #ff6b35', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        RS {totalPurchasesVal.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        PURCHASES
                      </div>
                    </div>
                    <div className="summary-card" style={{ borderTop: '4px solid #00a876', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        RS {netCash.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        NET STOCK CASH ({netCash >= 0 ? '+' : '-'})
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="table-wrap" style={{ marginBottom: '24px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th>Qty</th>
                      <th>Unit Cost (PKR)</th>
                      <th>Total Value</th>
                      <th>Condition</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const getStockCreationDate = (item) => {
                        try {
                          const timestamp = parseInt(item._id.toString().substring(0, 8), 16) * 1000;
                          return isNaN(timestamp) ? '' : new Date(timestamp).toISOString().slice(0, 10);
                        } catch (e) {
                          return item.lastUpdated || '';
                        }
                      };

                      const filteredStockList = db.stock.filter(item => {
                        if (stxYearFilter) {
                          const cDate = getStockCreationDate(item);
                          const cMonth = cDate ? cDate.slice(0, 7) : '';
                          if (stxMonthFilter) {
                            const filterMonthStr = `${stxYearFilter}-${stxMonthFilter}`;
                            if (cMonth && cMonth > filterMonthStr) return false;
                            if (stxDayFilter) {
                              const filterDateStr = `${stxYearFilter}-${stxMonthFilter}-${stxDayFilter}`;
                              if (cDate && cDate > filterDateStr) return false;
                            }
                          } else {
                            const regYear = cMonth ? cMonth.slice(0, 4) : '';
                            if (regYear && regYear > stxYearFilter) return false;
                          }
                        }
                        return true;
                      });

                      return filteredStockList.length > 0 ? (
                        filteredStockList.map(item => (
                        <tr key={item._id}>
                          <td><strong>{item.item}</strong></td>
                          <td>{item.category}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '2px 8px' }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateStockQty(item, 'down'); }}>-</button>
                              <strong>{item.qty || 0}</strong>
                              <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '2px 8px' }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateStockQty(item, 'up'); }}>+</button>
                            </div>
                          </td>
                          <td>Rs {(item.unitCost || 0).toLocaleString()}</td>
                          <td>Rs {((item.qty || 0) * (item.unitCost || 0)).toLocaleString()}</td>
                          <td>{item.condition}</td>
                          <td>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteStock(item._id)}>Delete</button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No stock items in inventory</td>
                      </tr>
                    );
                  })()}
                  </tbody>
                </table>
              </div>

              <div className="page-header" style={{ marginBottom: '16px' }}>
                <div>
                  <div className="page-title" style={{ fontSize: '26px' }}>Sales & Purchase History</div>
                  <div className="page-sub">Every stock movement — filter by date, month or type</div>
                </div>
              </div>

              <div className="controls">
                <select value={stxYearFilter} onChange={(e) => { setStxYearFilter(e.target.value); setStxMonthFilter(''); }}>
                  <option value="">All Years</option>
                  {getYearsList(db.stockTransactions, 'date').map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
                <select value={stxMonthFilter} onChange={(e) => setStxMonthFilter(e.target.value)}>
                  <option value="">All Months</option>
                  {getMonthsList.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select value={stxDayFilter} onChange={(e) => setStxDayFilter(e.target.value)}>
                  <option value="">All Days</option>
                  {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => (
                    <option key={d} value={d}>{parseInt(d)}</option>
                  ))}
                </select>
                <select value={stxTypeFilter} onChange={(e) => setStxTypeFilter(e.target.value)}>
                  <option value="">All Types</option>
                  <option value="SALE">Sales</option>
                  <option value="PURCHASE">Purchases</option>
                  <option value="ADJUST">Adjustments</option>
                  <option value="REMOVE">Removals</option>
                </select>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Item</th>
                      <th>Type</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Amount</th>
                      <th>Cash Impact</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStockTransactions.length > 0 ? (
                      filteredStockTransactions.map(tx => (
                        <tr key={tx._id}>
                          <td>{tx.date}</td>
                          <td>{tx.item}</td>
                          <td><span className={`badge badge-${tx.type}`}>{tx.type}</span></td>
                          <td>{tx.qty}</td>
                          <td>Rs {tx.unitPrice.toLocaleString()}</td>
                          <td>Rs {tx.amount.toLocaleString()}</td>
                          <td style={{ color: tx.cash > 0 ? 'var(--paid)' : tx.cash < 0 ? 'var(--defaulter)' : 'var(--muted)', fontWeight: 700 }}>
                            {tx.cash > 0 ? `+Rs ${tx.cash.toLocaleString()}` : tx.cash < 0 ? `-Rs ${Math.abs(tx.cash).toLocaleString()}` : '0'}
                          </td>
                          <td>{tx.notes}</td>
                          <td>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteStockTransaction(tx._id)}>Delete</button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No transaction history found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── ATTENDANCE PAGE ── */}
            <div className={`page ${activePage === 'attendance' ? 'active' : ''}`}>
              <div className="page-header">
                <div>
                  <div className="page-title">Attendance Sheet</div>
                  <div className="page-sub">Generate printable attendance grids</div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="month" value={attMonthFilter} onChange={(e) => setAttMonthFilter(e.target.value)} />
                  <select value={attSessionFilter} onChange={(e) => setAttSessionFilter(e.target.value)}>
                    <option value="">All Sessions</option>
                    <option>Weekends</option>
                    <option>Weekdays</option>
                    <option>Both</option>
                  </select>
                  <div style={{ position: 'relative' }}>
                    <div
                      onClick={() => setAttStatusPickerOpen(o => !o)}
                      style={{ cursor: 'pointer', padding: '11px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', color: 'var(--text)', minWidth: '140px' }}
                    >
                      <span>{attStatusFilters.length === 0 || attStatusFilters.length === ALL_ATTENDANCE_STATUSES.length ? 'All Status' : attStatusFilters.join(', ')}</span>
                      <span style={{ opacity: 0.6 }}>▾</span>
                    </div>
                    {attStatusPickerOpen && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setAttStatusPickerOpen(false)} />
                        <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', zIndex: 999, marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '10px 14px', width: '180px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', padding: '6px 0' }}>
                            <input
                              type="checkbox"
                              checked={attStatusFilters.length === ALL_ATTENDANCE_STATUSES.length}
                              ref={(el) => { if (el) el.indeterminate = attStatusFilters.length > 0 && attStatusFilters.length < ALL_ATTENDANCE_STATUSES.length; }}
                              onChange={() => setAttStatusFilters(prev => prev.length === ALL_ATTENDANCE_STATUSES.length ? [] : [...ALL_ATTENDANCE_STATUSES])}
                              style={{ width: '15px', height: '15px', accentColor: 'var(--primary)', flexShrink: 0 }}
                            />
                            Select All
                          </label>
                          <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0 6px' }} />
                          {ALL_ATTENDANCE_STATUSES.map(st => (
                            <label key={st} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', padding: '6px 0' }}>
                              <input
                                type="checkbox"
                                checked={attStatusFilters.includes(st)}
                                onChange={() => setAttStatusFilters(prev => prev.includes(st) ? prev.filter(x => x !== st) : [...prev, st])}
                                style={{ width: '15px', height: '15px', accentColor: 'var(--primary)', flexShrink: 0 }}
                              />
                              {st}
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <select value={attAgeFilter} onChange={(e) => setAttAgeFilter(e.target.value)}>
                    <option value="">All Ages</option>
                    <option>Kids</option>
                    <option>U-8</option>
                    <option>U-10</option>
                    <option>U-12</option>
                    <option>U-14</option>
                    <option>U-16</option>
                    <option>U-18</option>
                    <option>U-20</option>
                    <option>Girls</option>
                  </select>
                  <button className="btn btn-primary no-print" onClick={printAttendance}>Print / Save PDF</button>
                </div>
              </div>

              <div className="table-wrap" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase' }}>Preview Grid</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                      {attMonthFilter ? new Date(attMonthFilter + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '—'} 
                      {attSessionFilter ? ` (${attSessionFilter})` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                    Total active: {attStudents.length} student(s)
                  </div>
                </div>

                <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '50px' }}>S.No</th>
                        <th>Student Name</th>
                        <th>Guardian</th>
                        <th>Age Group</th>
                        <th>Session</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attStudents.length > 0 ? (
                        attStudents.map((s, i) => (
                          <tr key={s._id}>
                            <td>{i + 1}</td>
                            <td><strong>{s.name}</strong></td>
                            <td>{s.guardian || '—'}</td>
                            <td>{s.ageGroup}</td>
                            <td>{s.session}</td>
                            <td><span className={`badge badge-${s.monthStatus}`}>{s.monthStatus}</span></td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No students match this query</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── FOOTBALL GROUND PAGE ── */}
            <FootballBookings
              db={db}
              active={activePage === 'football'}
              getHeaders={getHeaders}
              onToast={triggerToast}
              onReload={loadData}
              openHour={fbOpen}
              closeHour={fbClose}
              onEditHours={openGroundSettings}
              academySettings={academySettings}
            />

            {/* ── GROUND BOOKINGS PAGE ── */}
            <div className={`page ${activePage === 'bookings' ? 'active' : ''}`}>
              <div className="page-header">
                <div>
                  <div className="page-title">Cricket Ground</div>
                  <div className="page-sub">Team slot reservations & ground schedule</div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" onClick={openGroundSettings}>Ground Hours</button>
                  <button className="btn btn-primary" onClick={() => openAddBooking()}>+ New Booking</button>
                </div>
              </div>

              <div id="ground-hours-banner">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span>🕒</span>
                  <div>
                    <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '18px', letterSpacing: '1px' }}>
                      Ground Hours: {fmtTime(toHHMM(groundOpen))} to {fmtTime(toHHMM(groundClose))}
                    </div>
                    <div style={{ fontSize: '12px', color: '#7a9ab8', marginTop: '2px' }}>
                      Open slots are green. Tap any slot to book directly.
                    </div>
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={openGroundSettings} style={{ borderColor: '#ffffff40', color: '#fff', background: 'transparent' }}>Edit Hours</button>
              </div>

              {/* Booking History Summary Cards */}
              {/* These now reflect whatever Date / Year / Month / Status filters
                  are currently selected below, instead of always showing fixed
                  "today" / "this month" / "this year" figures regardless of
                  what the user has filtered for. */}
              {(() => {
                const today = localToday();
                const hasActiveFilter = !!(bkDateFilter || bkYearFilter || bkMonthFilter || bkStatusFilter);

                // When no filter is chosen, the cards are labelled "Today's" —
                // so they must actually be scoped to today's bookings only,
                // not the full unfiltered list. When a filter IS active, use
                // exactly what the user filtered for.
                const scopeBookings = hasActiveFilter ? filteredBookings : filteredBookings.filter(b => b.date === today);

                const activeBookings = scopeBookings.filter(b => b.status !== 'CANCELLED');
                const totalCount = activeBookings.length;
                const confirmedCount = scopeBookings.filter(b => b.status === 'CONFIRMED').length;
                const finishedCount = scopeBookings.filter(b => b.status === 'FINISHED').length;
                const pendingCount = scopeBookings.filter(b => b.status === 'PENDING').length;
                const cancelledCount = scopeBookings.filter(b => b.status === 'CANCELLED').length;
                const revenue = scopeBookings.filter(b => b.status === 'CONFIRMED' || b.status === 'FINISHED').reduce((sum, b) => sum + getBookingPaid(b), 0);
                const upcomingCount = filteredBookings.filter(b => b.date >= today && b.status !== 'CANCELLED').length;


                return (
                  <div className="summary-row" style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                    <div className="summary-card" style={{ borderTop: '4px solid #1a56db', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        {totalCount}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        BOOKINGS
                      </div>
                    </div>
                    <div className="summary-card" style={{ borderTop: '4px solid #00a876', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        {upcomingCount}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        UPCOMING
                      </div>
                    </div>
                    <div className="summary-card" style={{ borderTop: '4px solid #ff6b35', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        RS {revenue.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        REVENUE
                      </div>
                    </div>
                    <div className="summary-card" style={{ borderTop: '4px solid #00b8a9', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        {confirmedCount}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        CONFIRMED
                      </div>
                    </div>
                    <div className="summary-card" style={{ borderTop: '4px solid #0084ff', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        {finishedCount}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        FINISHED
                      </div>
                    </div>
                    <div className="summary-card" style={{ borderTop: '4px solid #7c3aed', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        {cancelledCount}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        CANCELLED
                      </div>
                    </div>
                    <div className="summary-card" style={{ borderTop: '4px solid #ff3b5c', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="big" style={{ fontSize: '28px', fontFamily: 'Bebas Neue, sans-serif', color: 'var(--text)' }}>
                        {pendingCount}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontWeight: 600, letterSpacing: '0.5px' }}>
                        PENDING
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => shiftScheduleDate(-1)}>◀ Prev</button>
                <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} style={{ fontWeight: 600 }} />
                <button className="btn btn-secondary btn-sm" onClick={() => shiftScheduleDate(1)}>Next ▶</button>
                {scheduleDate !== localToday() && <button className="btn btn-secondary btn-sm" onClick={() => setScheduleDate(localToday())}>↩ Today</button>}
                <button className="btn btn-primary btn-sm" onClick={bookFromSchedule}>+ Book This Day</button>
              </div>

              {/* Day Schedule Visual Timeline */}
              <div className="table-wrap" style={{ padding: '20px', marginBottom: '28px' }}>
                <div style={{ fontWeight: 700, marginBottom: '14px', fontSize: '15px' }}>Timeline for {new Date(scheduleDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
                <div className="time-slot-grid">
                  {scheduleSlots.map((slot) => {
                    const timeStr = toHHMM(slot.hour);
                    if (slot.isOutside) {
                      return (
                        <div className="time-slot outside-hours" key={slot.hour} title="Outside operational hours">
                          <div className="slot-time">{fmtTime(timeStr)}</div>
                          <div className="slot-dur">Closed</div>
                        </div>
                      );
                    } else if (slot.booked) {
                      const b = slot.booked;
                      const durClass = `booked-${Math.min(b.duration || 1, 4)}hr`;
                      return (
                        <div className={`time-slot ${durClass}`} key={slot.hour} onClick={() => { setBkDetail(b); setBookingDetailModalOpen(true); }} style={{ cursor: 'pointer' }}>
                          <div className="slot-time">{fmtTime(timeStr)}</div>
                          <div className="slot-team">{b.teamName}</div>
                          <div className="slot-dur">{b.duration}hr ({b.status})</div>
                        </div>
                      );
                    } else {
                      return (
                        <div className="time-slot available" key={slot.hour} onClick={() => openAddBooking(scheduleDate, timeStr)}>
                          <div className="slot-time">{fmtTime(timeStr)}</div>
                          <div className="slot-dur">Available</div>
                        </div>
                      );
                    }
                  })}
                </div>
              </div>

              {/* History list */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                <div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '22px', letterSpacing: '1px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📄 BOOKING HISTORY
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Browse, filter and review all ground bookings</div>
                </div>
              </div>

              <div className="controls">
                <input type="date" value={bkDateFilter} onChange={(e) => setBkDateFilter(e.target.value)} />
                <select value={bkYearFilter} onChange={(e) => { setBkYearFilter(e.target.value); setBkMonthFilter(''); }}>
                  <option value="">All Years</option>
                  {getYearsList(db.bookings, 'date').map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
                <select value={bkMonthFilter} onChange={(e) => setBkMonthFilter(e.target.value)}>
                  <option value="">All Months</option>
                  {getMonthsList.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select value={bkStatusFilter} onChange={(e) => setBkStatusFilter(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="FINISHED">Finished</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                {(bkDateFilter || bkYearFilter || bkMonthFilter || bkStatusFilter) && (
                  <button className="btn btn-secondary btn-sm" onClick={() => { setBkDateFilter(''); setBkYearFilter(''); setBkMonthFilter(''); setBkStatusFilter(''); }}>Clear Filters</button>
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
                    {filteredBookings.length > 0 ? (
                      [...filteredBookings]
                        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.startTime || '').localeCompare(a.startTime || ''))
                        .map((b, i) => (
                          <tr key={b._id} style={{ opacity: b.status === 'CANCELLED' ? 0.55 : 1 }}>
                            <td>{i + 1}</td>
                            <td>
                              <strong>{b.teamName}</strong>
                              {b.contact ? <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{b.contact}</div> : null}
                            </td>
                            <td>{b.date}{b.date === localToday() && <div style={{ fontSize: '10px', color: '#00a876', fontWeight: 700 }}>TODAY</div>}</td>
                            <td>{fmtTime(b.startTime)} – {fmtTime(b.endTime)}</td>
                            <td>{b.duration}hr</td>
                            <td>
                              Rs {(b.amount || 0).toLocaleString()}
                              {b.status !== 'CANCELLED' && Math.max(0, (Number(b.amount) || 0) - getBookingPaid(b)) > 0 ? (
                                <div style={{ fontSize: '11px', color: '#ff6b35' }}>Remaining: Rs {Math.max(0, (Number(b.amount) || 0) - getBookingPaid(b)).toLocaleString()}</div>
                              ) : null}
                            </td>
                            <td>{b.paymentMethod || 'Cash'}</td>
                            <td><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                            <td style={{ display: 'flex', gap: '6px' }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => { setBkDetail(b); setBookingDetailModalOpen(true); }}>View</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => openEditBooking(b)}>Edit</button>
                            </td>
                          </tr>
                        ))
                    ) : (
                      <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No cricket bookings match this query</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── SETTINGS PAGE ── */}
            <div className={`page ${activePage === 'settings' ? 'active' : ''}`}>
              <div className="page-header">
                <div className="page-title">Settings</div>
                <div className="page-sub">Manage your academy profile and preferences</div>
              </div>

              <div className="settings-section">
                <h3>Academy Profile</h3>
                <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div className="settings-logo-circle" title="Click to upload logo" onClick={() => document.getElementById('logo-upload').click()}>
                      {academySettings.logo ? (
                        <img src={academySettings.logo} alt="Logo" />
                      ) : (
                        <span>⚽</span>
                      )}
                    </div>
                    <input type="file" id="logo-upload" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
                    <button className="btn btn-secondary btn-sm" onClick={() => document.getElementById('logo-upload').click()}>Upload Logo</button>
                    {academySettings.logo && <button className="btn btn-secondary btn-sm" style={{ color: '#ff3b5c' }} onClick={removeLogo}>Remove</button>}
                  </div>

                  <form onSubmit={handleSaveProfile} style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group">
                      <label>Academy Name</label>
                      <input type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label>Tagline</label>
                      <input type="text" value={profileTagline} onChange={(e) => setProfileTagline(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Phone / Contact</label>
                      <input type="text" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Email Address</label>
                      <input type="email" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Website</label>
                      <input type="url" value={profileWebsite} onChange={(e) => setProfileWebsite(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Address</label>
                      <textarea value={profileAddress} onChange={(e) => setProfileAddress(e.target.value)} rows="2"></textarea>
                    </div>
                    <div>
                      <button type="submit" className="btn btn-primary">Save Profile</button>
                    </div>
                  </form>
                </div>
              </div>

              <div className="settings-section">
                <h3>Backup & Restore</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>Export All Data</div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '3px' }}>
                      Download every student, payment, expense, stock item, stock transaction and ground booking into one Excel file. Keep this safe — if data is ever lost, this exact file can be re-imported to restore everything.
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={exportAllData} disabled={exportingData}>
                    {exportingData ? 'Exporting…' : '⬇ Export to Excel'}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0 6px', borderTop: '1px solid var(--border)', marginTop: '10px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>Restore From Backup</div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '3px' }}>
                      Re-import a previously exported backup (or any Students/Expenses/Stock/Bookings Excel file) to bring that data back.
                    </div>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setImportModalOpen(true)}>Import Excel</button>
                </div>
              </div>

              <div className="settings-section">
                <h3>Appearance & Theme</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>Dark Mode</div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '3px' }}>Switch the application to dark mode</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={darkMode} onChange={(e) => toggleDarkMode(e.target.checked)} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>

            {/* ── PUBLIC CONTACT INFO PAGE ── */}
            <div className={`page ${activePage === 'contactinfo' ? 'active' : ''}`}>
              <div className="page-header">
                <div className="page-title">Contact Info</div>
                <div className="page-sub">Public branding details</div>
              </div>
              <div className="settings-section">
                <div className="about-card">
                  <div className="about-logo-circle">
                    {academySettings.logo ? (
                      <img src={academySettings.logo} alt="Logo" />
                    ) : (
                      <span>⚽</span>
                    )}
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '2px' }}>{academySettings.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '18px' }}>{academySettings.tagline}</div>
                  
                  <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {academySettings.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface)', borderRadius: '8px', padding: '12px 14px' }}>
                        <span>📞</span>
                        <div>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)' }}>Phone</div>
                          <div style={{ fontSize: '14px', fontWeight: 600 }}>{academySettings.phone}</div>
                        </div>
                      </div>
                    )}
                    {academySettings.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface)', borderRadius: '8px', padding: '12px 14px' }}>
                        <span>✉️</span>
                        <div>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)' }}>Email</div>
                          <div style={{ fontSize: '14px', fontWeight: 600 }}>{academySettings.email}</div>
                        </div>
                      </div>
                    )}
                    {academySettings.website && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface)', borderRadius: '8px', padding: '12px 14px' }}>
                        <span>🌐</span>
                        <div>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)' }}>Website</div>
                          <a href={academySettings.website.startsWith('http') ? academySettings.website : `https://${academySettings.website}`} target="_blank" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent2)', textDecoration: 'none' }}>
                            {academySettings.website}
                          </a>
                        </div>
                      </div>
                    )}
                    {academySettings.address && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface)', borderRadius: '8px', padding: '12px 14px' }}>
                        <span>📍</span>
                        <div>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)' }}>Address</div>
                          <div style={{ fontSize: '14px', fontWeight: 600 }}>{academySettings.address}</div>
                        </div>
                      </div>
                    )}
                  </div>
                  {!academySettings.phone && !academySettings.email && !academySettings.website && !academySettings.address && (
                    <div style={{ color: 'var(--muted)', padding: '10px 0' }}>Fill in Academy settings to display contact card details</div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── HIDDEN PRINT AREA FOR ATTENDANCE SHEET ── */}
      <div id="att-print-area" className="receipt-doc" style={{ display: 'none', background: '#fff', color: '#000', padding: '20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          {academySettings.logo && <img src={academySettings.logo} alt="Logo" style={{ width: '58px', height: '58px', borderRadius: '50%', objectFit: 'cover', marginBottom: '6px' }} />}
          <div className="ph-academy">{academySettings.name}</div>
          <div className="ph-tagline">{academySettings.tagline}</div>
          {academySettings.address && <div style={{ fontSize: '8pt', color: '#666', marginTop: '2px' }}>{academySettings.address}</div>}
        </div>
        <hr className="ph-divider" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
          <div>
            <div className="ph-sheet-title">
              Attendance Sheet — {attMonthFilter ? new Date(attMonthFilter + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '—'}
            </div>
            <div className="ph-meta">
              Session: {attSessionFilter || 'All Sessions'} | Age Group: {attAgeFilter || 'All Ages'} | Status: {attStatusFilters.length === 0 || attStatusFilters.length === ALL_ATTENDANCE_STATUSES.length ? 'All Status' : attStatusFilters.join(', ')}
            </div>
            <div className="ph-meta" style={{ marginTop: '4px' }}>
              Week of: ________________________
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '8pt', color: '#555' }}>Total Students</div>
            <div style={{ fontSize: '14pt', fontWeight: 700, color: '#0d1b2e' }}>{attStudents.length}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: '32px' }}>S.No</th>
              <th>Student Name</th>
              <th>Guardian</th>
              <th style={{ width: '48px' }}>Age</th>
              <th style={{ width: '68px' }}>Session</th>
              <th style={{ width: '52px' }}>Status</th>
              {WEEK_DAYS.map((d) => (
                <th key={d} style={{ width: '26px', textAlign: 'center' }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attStudents.map((s, idx) => (
              <tr key={s._id}>
                <td>{idx + 1}</td>
                <td><strong>{s.name}</strong></td>
                <td>{s.guardian || '—'}</td>
                <td>{s.ageGroup}</td>
                <td>{s.session}</td>
                {/* Same value the on-screen preview shows: the selected
                    month's record, not the student's latest month. */}
                <td><span className={`badge badge-${s.monthStatus}`}>{s.monthStatus}</span></td>
                {WEEK_DAYS.map((d) => (
                  <td key={d} className="mark-cell"></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sign-section">
          <div className="sign-row">
            <div className="sign-box">
              <div className="sign-label">Coach Signature</div>
              <div className="sign-line"></div>
            </div>
            <div className="sign-box" style={{ maxWidth: '200px' }}>
              <div className="sign-label">Date: {printDateLabel}</div>
              <div className="sign-line"></div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '30px', fontSize: '9pt', color: '#666', borderTop: '1px solid #ddd', paddingTop: '10px' }}>
          Powered by <strong>Softezm</strong> | Email: info@softezm.com | Phone: 03060250202 | Website: www.softezm.com
        </div>
      </div>

      {/* ── HIDDEN PRINT AREA FOR FEE RECEIPT SLIP ── */}
      {slipData && (
        <div id="slip-print-area" className="receipt-doc" style={{ display: 'none', background: '#fff', color: '#000', padding: '20px' }}>
          <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '14px', marginBottom: '18px' }}>
            {academySettings.logo && <img src={academySettings.logo} alt="Logo" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', marginBottom: '6px' }} />}
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '26px', letterSpacing: '2px', color: '#000' }}>{academySettings.name}</div>
            <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '1px' }}>{academySettings.tagline}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '8px' }}>{slipData.booking ? 'Booking Receipt' : (slipData.admissionOnly ? 'Admission Fee Receipt' : 'Fee Receipt')}</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>{slipData.booking ? (slipData.booking.paymentDate || slipData.booking.date) : slipData.payment.feeDate}</div>
          </div>
          {slipData.booking ? (
          <table style={{ width: '100%', fontSize: '11pt' }}>
            <tbody>
              <tr><td style={{ color: '#666', width: '40%', border: 'none', padding: '6px 0' }}>Team</td><td style={{ fontWeight: 600, border: 'none', padding: '6px 0' }}>{slipData.booking.teamName}</td></tr>
              {slipData.booking.contact && (
                <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Contact</td><td style={{ border: 'none', padding: '6px 0' }}>{slipData.booking.contact}</td></tr>
              )}
              <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Ground</td><td style={{ border: 'none', padding: '6px 0' }}>{slipData.booking.ground === 'FOOTBALL' ? 'Football' : 'Cricket'}</td></tr>
              <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Date</td><td style={{ border: 'none', padding: '6px 0' }}>{slipData.booking.date}</td></tr>
              <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Time</td><td style={{ border: 'none', padding: '6px 0' }}>{slipData.booking.startTime}{slipData.booking.endTime ? ` – ${slipData.booking.endTime}` : ''}</td></tr>
              <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Payment Type</td><td style={{ border: 'none', padding: '6px 0' }}>{slipData.booking.paymentMethod}{((slipData.booking.cashAmount || 0) > 0 || (slipData.booking.onlineAmount || 0) > 0) ? ` (Cash Rs ${(slipData.booking.cashAmount || 0).toLocaleString()} + Online Rs ${(slipData.booking.onlineAmount || 0).toLocaleString()})` : ''}</td></tr>
              {slipData.booking.installments && slipData.booking.installments.length > 1 && (
                <tr>
                  <td style={{ color: '#666', border: 'none', padding: '6px 0', verticalAlign: 'top' }}>Received In</td>
                  <td style={{ border: 'none', padding: '6px 0' }}>
                    <table style={{ width: '100%', fontSize: '10.5pt', borderCollapse: 'collapse' }}>
                      <tbody>
                        {slipData.booking.installments.map((inst, i) => (
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
                <td style={{ fontWeight: 700, fontSize: '13pt', color: '#00a876', paddingTop: '10px', border: 'none' }}>Rs {(slipData.booking.amount || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, fontSize: '12pt', border: 'none', padding: '6px 0' }}>Total Received</td>
                <td style={{ fontWeight: 700, fontSize: '13pt', color: '#00a876', border: 'none', padding: '6px 0' }}>Rs {(slipData.booking.amountPaid || 0).toLocaleString()}</td>
              </tr>
              <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Status</td><td style={{ fontWeight: 600, border: 'none', padding: '6px 0' }}>{slipData.booking.status}</td></tr>
            </tbody>
          </table>
          ) : (
          <table style={{ width: '100%', fontSize: '11pt' }}>
            <tbody>
              <tr><td style={{ color: '#666', width: '40%', border: 'none', padding: '6px 0' }}>{isFamilySlip ? 'Students' : 'Student'}</td><td style={{ fontWeight: 600, border: 'none', padding: '6px 0' }}>{slipStudents.map(s => s.name).join(', ')}</td></tr>
              <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Guardian</td><td style={{ border: 'none', padding: '6px 0' }}>{slipData.student.guardian || '—'}</td></tr>
              {!isFamilySlip && (
                <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Session</td><td style={{ border: 'none', padding: '6px 0' }}>{slipData.student.session}</td></tr>
              )}
              {!slipData.admissionOnly && (
                <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>{slipData.payment.months && slipData.payment.months.length > 1 ? 'Billing Months' : 'Billing Month'}</td><td style={{ border: 'none', padding: '6px 0' }}>{formatBillingMonth(slipData.payment.month)}</td></tr>
              )}
              {!slipData.admissionOnly && (isFamilySlip && slipData.showPerChildStatus ? (
                <>
                  <tr>
                    <td colSpan={2} style={{ border: 'none', padding: '12px 0 4px' }}>
                      <div style={{ fontSize: '9pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#666', marginBottom: '8px' }}>Students</div>
                      {slipStudents.map((s, i) => (
                        <div key={s._id} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid #eee' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontWeight: 600, fontSize: '11pt' }}>{s.name}</div>
                            <div style={{ fontSize: '9pt', color: '#666' }}>{s.receiptStatus}</div>
                          </div>
                          <div style={{ fontSize: '8pt', color: '#999', marginTop: '2px' }}>
                            {s.receiptMethod || 'Cash'}
                            {((s.receiptCashAmount || 0) > 0 && (s.receiptOnlineAmount || 0) > 0) && ` — Cash ${s.receiptCashAmount.toLocaleString()} + Online ${s.receiptOnlineAmount.toLocaleString()}`}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5pt', marginTop: '4px' }}>
                            <span style={{ color: '#666' }}>Received / Fee</span>
                            <span style={{ fontWeight: 600 }}>Rs {(s.receiptReceived ?? 0).toLocaleString()} / {(s.receiptFee ?? 0).toLocaleString()}</span>
                          </div>
                          {(s.receiptAdmissionFee || 0) > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5pt', marginTop: '3px' }}>
                              <span style={{ color: '#666' }}>Admission ({admissionLabel(s.receiptAdmissionFee, s.receiptAdmissionReceived, s.receiptAdmissionMethod)})</span>
                              <span style={{ fontWeight: 600 }}>Rs {s.receiptAdmissionFee.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </td>
                  </tr>
                  <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Status</td><td style={{ fontWeight: 600, border: 'none', padding: '6px 0' }}>{slipData.payment.status === 'MIXED' ? 'See breakdown above' : slipData.payment.status}</td></tr>
                </>
              ) : (
                <>
                  {!isFamilySlip && slipData.payment.months && slipData.payment.months.length > 1 && (
                    <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Fee / Month</td><td style={{ border: 'none', padding: '6px 0' }}>Rs {slipData.payment.perMonthFee.toLocaleString()} × {slipData.payment.months.length}</td></tr>
                  )}
                  <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Payment Type</td><td style={{ border: 'none', padding: '6px 0' }}>{slipData.payment.method}{((slipData.payment.cashAmount || 0) > 0 || (slipData.payment.onlineAmount || 0) > 0) ? ` (Cash Rs ${(slipData.payment.cashAmount || 0).toLocaleString()} + Online Rs ${(slipData.payment.onlineAmount || 0).toLocaleString()})` : ''}</td></tr>
                </>
              ))}
              {slipData.payment.installments && slipData.payment.installments.length > 1 && (
                <tr>
                  <td style={{ color: '#666', border: 'none', padding: '6px 0', verticalAlign: 'top' }}>Received In</td>
                  <td style={{ border: 'none', padding: '6px 0' }}>
                    <table style={{ width: '100%', fontSize: '10.5pt', borderCollapse: 'collapse' }}>
                      <tbody>
                        {slipData.payment.installments.map((inst, i) => (
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
              {slipData.admissionFee > 0 && !(isFamilySlip && slipData.showPerChildStatus) && (
                <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Admission Fee <span style={{ fontSize: '9pt', color: '#888' }}>({admissionLabel(slipData.admissionFee, slipData.admissionFeeReceived, slipData.admissionMethod)})</span></td><td style={{ fontWeight: 600, border: 'none', padding: '6px 0' }}>Rs {slipData.admissionFee.toLocaleString()}</td></tr>
              )}
              {slipReadmissionAmt > 0 && (
                <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Readmission Fee</td><td style={{ fontWeight: 600, border: 'none', padding: '6px 0' }}>Rs {slipReadmissionAmt.toLocaleString()}</td></tr>
              )}
              {!slipData.admissionOnly && (
                <tr style={{ borderTop: '2px solid #000' }}>
                  <td style={{ fontWeight: 700, fontSize: '12pt', paddingTop: '10px', border: 'none' }}>{(slipData.admissionFee > 0 || slipReadmissionAmt > 0 || slipData.showPerChildStatus) ? 'Monthly Fee' : 'Amount'}</td>
                  <td style={{ fontWeight: 700, fontSize: '13pt', color: '#00a876', paddingTop: '10px', border: 'none' }}>Rs {slipData.payment.fee.toLocaleString()}</td>
                </tr>
              )}
              {(slipData.admissionOnly || slipData.admissionFee > 0 || slipReadmissionAmt > 0 || slipData.showPerChildStatus) && (
                <tr style={slipData.admissionOnly ? { borderTop: '2px solid #000' } : {}}>
                  <td style={{ fontWeight: 700, fontSize: '12pt', border: 'none', padding: '6px 0' }}>Total Received</td>
                  <td style={{ fontWeight: 700, fontSize: '13pt', color: '#00a876', border: 'none', padding: '6px 0' }}>Rs {(slipMonthlyReceived + (slipData.admissionFeeReceived ?? slipData.admissionFee ?? 0) + slipReadmissionAmt).toLocaleString()}</td>
                </tr>
              )}
              {!(isFamilySlip && slipData.showPerChildStatus) && !slipData.admissionOnly && (
                <tr><td style={{ color: '#666', border: 'none', padding: '6px 0' }}>Status</td><td style={{ fontWeight: 600, border: 'none', padding: '6px 0' }}>{slipData.payment.status === 'MIXED' ? 'See breakdown above' : slipData.payment.status}</td></tr>
              )}
            </tbody>
          </table>
          )}
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

      {/* ── MODALS LAYER ── */}

      {/* Dashboard stat-box breakdown — click any stat/summary card to see it */}
      {statDetailOpen && statDetail && (
        <div className="modal-overlay" onClick={() => setStatDetailOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <h3>{statDetail.title}</h3>
            {statDetail.type === 'students' ? (
              (() => {
                const list = getStudentsByStatus(statDetail.key);
                return list.length === 0 ? (
                  <div className="empty"><div className="empty-icon">📭</div>No students in this filter.</div>
                ) : (
                  <>
                    <div style={{ maxHeight: '440px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                            <th style={{ padding: '6px 4px' }}>Name</th>
                            <th style={{ padding: '6px 4px' }}>Guardian</th>
                            <th style={{ padding: '6px 4px' }}>Session</th>
                            <th style={{ padding: '6px 4px' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((s, i) => (
                            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 4px', fontWeight: 600 }}>{s.name}</td>
                              <td style={{ padding: '6px 4px', color: 'var(--muted)' }}>{s.guardian || '—'}</td>
                              <td style={{ padding: '6px 4px' }}>{s.session || '—'}</td>
                              <td style={{ padding: '6px 4px' }}><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop: '12px', fontWeight: 700, textAlign: 'right', fontSize: '14px' }}>{list.length} student{list.length === 1 ? '' : 's'}</div>
                  </>
                );
              })()
            ) : (
              (() => {
                const items = getStatDetailItems(statDetail.key);
                if (items.length === 0) {
                  return <div className="empty"><div className="empty-icon">📭</div>Nothing in this filter yet.</div>;
                }
                const total = items.reduce((sum, it) => sum + (it.amount || 0), 0);
                const groups = {};
                items.forEach(it => {
                  const g = it.source || 'Other';
                  if (!groups[g]) groups[g] = [];
                  groups[g].push(it);
                });
                return (
                  <>
                    <div style={{ maxHeight: '440px', overflowY: 'auto' }}>
                      {Object.entries(groups).map(([groupName, groupItems]) => {
                        const subtotal = groupItems.reduce((sum, it) => sum + (it.amount || 0), 0);
                        return (
                          <div key={groupName} style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--accent)', marginBottom: '6px' }}>
                              <span>{groupName}</span>
                              <span>Rs {subtotal.toLocaleString()}</span>
                            </div>
                            {groupItems.map((it, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                <div>
                                  <div style={{ fontWeight: 600 }}>{it.name}</div>
                                  {it.detail && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{it.detail}</div>}
                                </div>
                                <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Rs {(it.amount || 0).toLocaleString()}</div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '2px solid var(--text)', fontWeight: 700, fontSize: '15px' }}>
                      <span>Total</span>
                      <span>Rs {total.toLocaleString()}</span>
                    </div>
                  </>
                );
              })()
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStatDetailOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel / CSV Modal */}
      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        getHeaders={getHeaders}
        onToast={triggerToast}
        onImported={() => loadData(true)}
      />

      {/* Student Form Modal */}
      {studentModalOpen && (
        <div className="modal-overlay" onClick={closeStudentModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingStudentId ? 'Edit Student' : 'Add Student'}</h3>
            <form onSubmit={saveStudent}>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Full Name</label>
                  <input type="text" value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Muhammad Ali" required />
                </div>
                {!editingStudentId && (
                  <div className="form-group full" style={{ margin: '-6px 0 2px' }}>
                    <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={sAddAnotherSibling} onChange={(e) => setSAddAnotherSibling(e.target.checked)} disabled={sPendingSiblings.length > 0} />
                      This guardian has more than one child to add
                    </label>
                    {sAddAnotherSibling && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>How many children in total?</span>
                        <input
                          type="number"
                          min="2"
                          max="10"
                          value={sTotalChildren}
                          onChange={(e) => setSTotalChildren(e.target.value)}
                          onBlur={(e) => setSTotalChildren(Math.min(10, Math.max(2, Number(e.target.value) || 2)))}
                          disabled={sPendingSiblings.length > 0}
                          style={{ width: '64px' }}
                        />
                        {sPendingSiblings.length > 0 && (
                          <span style={{ fontSize: '12px', color: 'var(--lime)', fontWeight: 600 }}>
                            Child {sPendingSiblings.length + 1} of {sTotalChildren}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="form-group">
                  <label>Guardian</label>
                  <input type="text" list="existing-guardians" value={sGuardian} onChange={(e) => {
                    const guardian = e.target.value;
                    setSGuardian(guardian);
                    const existing = db.students.find(s => s.guardian?.trim().toLowerCase() === guardian.trim().toLowerCase());
                    if (existing) {
                      setSContact(existing.contact || '');
                      setSContact2(existing.contact2 || '');
                    }
                  }} placeholder="Guardian name" />
                  <datalist id="existing-guardians">
                    {Array.from(new Set(db.students.map(s => s.guardian?.trim()).filter(Boolean))).map(guardian => <option key={guardian} value={guardian} />)}
                  </datalist>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>Select an existing guardian to reuse their contact details and link siblings.</div>
                </div>
                <div className="form-group">
                  <label>Contact Number *</label>
                  <input type="tel" value={sContact} onChange={(e) => setSContact(e.target.value)} placeholder="03139832544" required />
                  {sContact && phoneError(sContact) ? (
                    <div style={{ color: '#ff3b5c', fontSize: '11px', marginTop: '4px' }}>Number is not valid — 11 digits starting with 03</div>
                  ) : null}
                </div>
                <div className="form-group">
                  <label>Contact Number 2 <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span></label>
                  <input type="tel" value={sContact2} onChange={(e) => setSContact2(e.target.value)} placeholder="03001234567" />
                  {sContact2 && phoneError(sContact2) ? (
                    <div style={{ color: '#ff3b5c', fontSize: '11px', marginTop: '4px' }}>Number is not valid — 11 digits starting with 03</div>
                  ) : null}
                </div>
                <div className="form-group">
                  <label>Age Group</label>
                  <select value={sAge} onChange={(e) => setSAge(e.target.value)}>
                    <option>Kids</option>
                    <option>U-8</option>
                    <option>U-10</option>
                    <option>U-12</option>
                    <option>U-14</option>
                    <option>U-16</option>
                    <option>U-18</option>
                    <option>U-20</option>
                    <option>Girls</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Session</label>
                  <select value={sSession} onChange={(e) => setSSession(e.target.value)}>
                    <option>Weekends</option>
                    <option>Weekdays</option>
                    <option>Both</option>
                  </select>
                </div>
                <div className="form-group full" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginBottom: '-4px' }}>
                  <label style={{ color: 'var(--freeze)' }}>
                    Admission / Registration Fee <span style={{ opacity: 0.6, fontWeight: 400 }}>— one time, charged when joining</span>
                  </label>
                </div>
                <div className="form-group">
                  <label>Admission Fee (PKR)</label>
                  <input type="number" min="0" value={sAdmissionFee} onChange={(e) => setSAdmissionFee(e.target.value)} placeholder="2000" />
                </div>
                <div className="form-group">
                  <label>Admission Date</label>
                  <input type="date" value={sAdmissionDate} onChange={(e) => setSAdmissionDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Admission Fee Status</label>
                  <select value={sAdmissionStatus} onChange={(e) => setSAdmissionStatus(e.target.value)}>
                    <option>PAID</option>
                    <option>UNPAID</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Admission Fee Method</label>
                  <select value={sAdmissionMethod} onChange={(e) => setSAdmissionMethod(e.target.value)}>
                    <option>Cash</option>
                    <option>Online</option>
                    <option>Bank Transfer</option>
                  </select>
                </div>
                {!editingStudentId && (
                  <>
                    <div className="form-group full">
                      <label>Month</label>
                      <input type="month" value={sMonth} onChange={(e) => setSMonth(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Fee (PKR)</label>
                      <input type="number" value={sFee} onChange={(e) => {
                        const v = e.target.value;
                        setSFee(v);
                        setSStatus(prev => ['PAID', 'UNPAID', 'PENDING'].includes(prev) ? computedSinglePaymentStatus(v, sAmountPaid) : prev);
                      }} placeholder="5500" />
                    </div>
                    <div className="form-group">
                      <label>Fee Date</label>
                      <input type="date" value={sFeeDate} onChange={(e) => setSFeeDate(e.target.value)} />
                    </div>
                    {!sSplitPayment && (
                      <div className="form-group">
                        <label>Amount Received Now (PKR)</label>
                        <input type="number" min="0" value={sAmountPaid} onChange={(e) => {
                          const v = e.target.value;
                          setSAmountPaid(v);
                          setSStatus(prev => ['PAID', 'UNPAID', 'PENDING'].includes(prev) ? computedSinglePaymentStatus(sFee, v) : prev);
                        }} placeholder={String(sFee || '')} />
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                          Leave blank / equal to fee for a full payment. A lower amount is a half payment — status auto-switches to <strong>PENDING</strong> until the rest is added later via Record Payment.
                        </div>
                      </div>
                    )}
                    {!sSplitPayment && (
                      <div className="form-group">
                        <label>Fee Method</label>
                        <select value={sMethod} onChange={(e) => setSMethod(e.target.value)}>
                          <option>Cash</option>
                          <option>Online</option>
                          <option>Bank Transfer</option>
                        </select>
                      </div>
                    )}
                    <div className="form-group full" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '2px 0' }}>
                      <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={sSplitPayment} onChange={(e) => setSSplitPayment(e.target.checked)} />
                        Split this fee — part Cash, part Online
                      </label>
                    </div>
                    {sSplitPayment && (
                      <div className="form-group full">
                        <label>Cash / Online Split — amount received now</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <input
                            type="number"
                            placeholder="Cash amount"
                            value={sCashAmount}
                            onChange={(e) => {
                              const cash = e.target.value;
                              setSCashAmount(cash);
                              const total = (Number(cash) || 0) + (Number(sOnlineAmount) || 0);
                              setSAmountPaid(String(total));
                              setSStatus(prev => ['PAID', 'UNPAID', 'PENDING'].includes(prev) ? computedSinglePaymentStatus(sFee, total) : prev);
                            }}
                          />
                          <input
                            type="number"
                            placeholder="Online amount"
                            value={sOnlineAmount}
                            onChange={(e) => {
                              const online = e.target.value;
                              setSOnlineAmount(online);
                              const total = (Number(sCashAmount) || 0) + (Number(online) || 0);
                              setSAmountPaid(String(total));
                              setSStatus(prev => ['PAID', 'UNPAID', 'PENDING'].includes(prev) ? computedSinglePaymentStatus(sFee, total) : prev);
                            }}
                          />
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                          Received now: <strong>Rs {((Number(sCashAmount) || 0) + (Number(sOnlineAmount) || 0)).toLocaleString()}</strong> of Rs {(Number(sFee) || 0).toLocaleString()}. Less than the fee is a half payment — status auto-switches to <strong>PENDING</strong>.
                        </div>
                      </div>
                    )}
                    <div className="form-group full">
                      <label>Status</label>
                      <select value={sStatus} onChange={(e) => setSStatus(e.target.value)}>
                        <option value="UNPAID">UNPAID</option>
                        <option value="PENDING">PENDING</option>
                        <option value="PAID">PAID</option>
                        <option value="FREEZE">FREEZE</option>
                        <option value="DEFAULTER">DEFAULTER</option>
                        <option value="LEFT">LEFT</option>
                        <option value="SPONSORED">SPONSORED</option>
                      </select>
                    </div>
                  </>
                )}
                {editingStudentId && (
                  <div style={{ gridColumn: '1/-1', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#7a6000' }}>
                    💡 To log payments or update status, use the **History** button on the student row.
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeStudentModal} disabled={savingStudent}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingStudent}>
                  {savingStudent
                    ? 'Saving…'
                    : (!editingStudentId && sAddAnotherSibling
                        ? (sPendingSiblings.length + 1 < (Number(sTotalChildren) || 2) ? `Save Child ${sPendingSiblings.length + 1} of ${sTotalChildren}` : `Save Last Child & Show Receipt`)
                        : 'Save Student')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal — also doubles as Edit Payment when editPaymentTarget is set */}
      {paymentModalOpen && (
        <div className="modal-overlay" onClick={() => { setPaymentModalOpen(false); setEditPaymentTarget(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editPaymentTarget ? 'Edit Payment' : 'Record Payment'}</h3>
            <form onSubmit={savePayment}>
              <div className="form-grid">
                {editPaymentTarget ? (
                  <div className="form-group full">
                    <label>Student Name</label>
                    <input type="text" value={pStudentNameInput} disabled />
                  </div>
                ) : (
                <div className="form-group full" style={{ position: 'relative' }}>
                  <label>Student Name</label>
                  <input
                    type="text"
                    value={pStudentNameInput}
                    onChange={(e) => {
                      setPStudentNameInput(e.target.value);
                      setPStudentSelectedId('');
                      setPStudentSelectedIds([]);
                      setPStudentDropdownOpen(true);
                    }}
                    placeholder="Search name or guardian..."
                  />
                  {pStudentDropdownOpen && pStudentNameInput && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', zIndex: 999, maxHeight: '150px', overflowY: 'auto', marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                      {Array.from(new Set(filterStudentDropdown().map(s => s.guardian?.trim()).filter(Boolean))).map(guardian => {
                        const family = db.students.filter(s => s.guardian?.trim().toLowerCase() === guardian.toLowerCase());
                        return family.length > 1 ? (
                          <div key={`family-${guardian}`} style={{ padding: '9px 10px', cursor: 'pointer', color: 'var(--primary)', fontWeight: 700, fontSize: '12px', borderBottom: '1px solid var(--surface2)' }} onClick={() => selectPaymentStudents(family)}>
                            Pay all children of {guardian} ({family.length})
                          </div>
                        ) : null;
                      })}
                      {filterStudentDropdown().map(s => (
                        <div
                          key={s._id}
                          style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid var(--surface2)', color: 'var(--text)' }}
                          onClick={() => selectPaymentStudents([s])}
                        >
                          {s.name} ({s.guardian || 'No Guardian'})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )}
                {pStudentSelectedIds.length <= 1 && (
                  <div className="form-group">
                    <label>Amount (PKR) <span style={{ opacity: 0.6, fontWeight: 400 }}>— per month</span></label>
                    <input type="number" value={pAmount} onChange={(e) => {
                      const v = e.target.value;
                      setPAmount(v);
                      if (isSinglePaymentCase) {
                        setPStatus(prev => ['PAID', 'UNPAID', 'PENDING'].includes(prev) ? computedSinglePaymentStatus(v, totalReceivedForSingle) : prev);
                      }
                    }} placeholder="5500" required />
                  </div>
                )}
                {isSinglePaymentCase && !pSplitPayment && (
                  <div className="form-group">
                    <label>Amount Received Now (PKR)</label>
                    <input type="number" min="0" value={pAmountReceived} onChange={(e) => {
                      const v = e.target.value;
                      setPAmountReceived(v);
                      const newTotal = alreadyReceivedForSingle + (Number(v) || 0);
                      setPStatus(prev => ['PAID', 'UNPAID', 'PENDING'].includes(prev) ? computedSinglePaymentStatus(pAmount, newTotal) : prev);
                    }} placeholder={String(Math.max(0, (Number(pAmount) || 0) - alreadyReceivedForSingle))} />
                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                      {alreadyReceivedForSingle > 0 ? <>Already received: Rs {alreadyReceivedForSingle.toLocaleString()} · </> : null}
                      Total after this: <strong>Rs {totalReceivedForSingle.toLocaleString()}</strong> of Rs {(Number(pAmount) || 0).toLocaleString()}
                      {remainingForSingle > 0 ? <> · Remaining: <strong style={{ color: '#ff6b35' }}>Rs {remainingForSingle.toLocaleString()}</strong></> : null}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                      Leave blank to pay in full — half payments automatically go to <strong>PENDING</strong> until the balance is added here later.
                    </div>
                  </div>
                )}
                {pStudentSelectedIds.length > 1 && (
                  <div className="form-group full" style={{ marginTop: '0', fontSize: '12px', color: 'var(--muted)' }}>
                    Combined receipt for <strong>{db.students.filter(s => pStudentSelectedIds.includes(s._id)).map(s => s.name).join(', ')}</strong> — remove a child below if you only want to pay for some of them.
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                      {db.students.filter(s => pStudentSelectedIds.includes(s._id)).map(s => (
                        <div key={s._id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '12px' }}>{s.name}</div>
                            <input
                              type="number"
                              value={pStudentAmounts[s._id] ?? ''}
                              onChange={(e) => updatePStudentAmount(s._id, e.target.value)}
                              placeholder="Fee"
                              required
                              style={{ padding: '7px 8px', fontSize: '12px' }}
                            />
                            <select
                              value={pStudentSessions[s._id] || s.session || 'Weekends'}
                              onChange={(e) => updatePStudentSession(s._id, e.target.value)}
                              style={{ padding: '7px 8px', fontSize: '12px' }}
                            >
                              <option>Weekends</option>
                              <option>Weekdays</option>
                              <option>Both</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => removeStudentFromPayment(s._id)}
                              title="Don't pay for this child right now"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontWeight: 700, fontSize: '16px', padding: '0 4px' }}
                            >
                              ×
                            </button>
                          </div>
                          {pSplitPayment && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingLeft: '2px' }}>
                              <input
                                type="number"
                                placeholder="Cash"
                                value={pStudentCashAmounts[s._id] ?? ''}
                                onChange={(e) => {
                                  const cash = e.target.value;
                                  updatePStudentCash(s._id, cash);
                                  const fee = Number(pStudentAmounts[s._id]) || 0;
                                  updatePStudentOnline(s._id, String(Math.max(0, fee - (Number(cash) || 0))));
                                }}
                                style={{ padding: '7px 8px', fontSize: '12px' }}
                              />
                              <input
                                type="number"
                                placeholder="Online"
                                value={pStudentOnlineAmounts[s._id] ?? ''}
                                onChange={(e) => {
                                  const online = e.target.value;
                                  updatePStudentOnline(s._id, online);
                                  const fee = Number(pStudentAmounts[s._id]) || 0;
                                  updatePStudentCash(s._id, String(Math.max(0, fee - (Number(online) || 0))));
                                }}
                                style={{ padding: '7px 8px', fontSize: '12px' }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      Total: Rs {(
                        db.students.filter(s => pStudentSelectedIds.includes(s._id))
                          .reduce((sum, s) => sum + (Number(pStudentAmounts[s._id]) || 0), 0) * Math.max(pMonths.length, 1)
                      ).toLocaleString()}
                      {' '}({Math.max(pMonths.length, 1)} month{pMonths.length > 1 ? 's' : ''} × {pStudentSelectedIds.length} student{pStudentSelectedIds.length > 1 ? 's' : ''})
                    </div>
                  </div>
                )}
                <div className="form-group" style={{ position: 'relative' }}>
                  <label>Month{editPaymentTarget ? '' : '(s)'}</label>
                  {editPaymentTarget ? (
                    <input type="month" value={pMonths[0] || ''} onChange={(e) => setPMonths([e.target.value])} required />
                  ) : (
                  <div
                    onClick={() => {
                      setPMonthPickerChecked(pMonths.length ? pMonths : [localMonth()]);
                      setPMonthPickerYear(Number((pMonths[0] || localMonth()).slice(0, 4)));
                      setPMonthPickerOpen(o => !o);
                    }}
                    style={{ cursor: 'pointer', padding: '11px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text)' }}
                  >
                    <span>{pMonths.length ? [...pMonths].sort().join(', ') : 'Select month(s)'}</span>
                    <span style={{ opacity: 0.6 }}>▾</span>
                  </div>
                  )}

                  {!editPaymentTarget && pMonthPickerOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', zIndex: 999, marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '12px', width: '260px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPMonthPickerYear(y => y - 1)}>‹</button>
                        <strong>{pMonthPickerYear}</strong>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPMonthPickerYear(y => y + 1)}>›</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
                        {monthDisplayOptions.map(m => {
                          const ym = `${pMonthPickerYear}-${m.value}`;
                          const checked = pMonthPickerChecked.includes(ym);
                          return (
                            <label key={ym} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', cursor: 'pointer', padding: '5px 6px', borderRadius: '6px', background: checked ? 'var(--surface2)' : 'transparent' }}>
                              <input type="checkbox" checked={checked} onChange={() => togglePMonthPick(ym)} />
                              {m.label.slice(0, 3)}
                            </label>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPMonthPickerOpen(false)}>Cancel</button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setPMonths(pMonthPickerChecked.length ? [...pMonthPickerChecked].sort() : pMonths);
                            setPMonthPickerOpen(false);
                          }}
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {!editPaymentTarget && pMonths.length > 0 && (
                  <div className="form-group full" style={{ marginTop: '-8px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {pMonths.map(m => (
                        <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 8px', fontSize: '12px' }}>
                          {m}
                          <button
                            type="button"
                            onClick={() => removePaymentMonth(m)}
                            disabled={pMonths.length === 1}
                            style={{ background: 'none', border: 'none', cursor: pMonths.length === 1 ? 'not-allowed' : 'pointer', color: 'var(--muted)', fontWeight: 700, opacity: pMonths.length === 1 ? 0.4 : 1 }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    {pMonths.length > 1 && (
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>
                        Paying for {pMonths.length} months — Rs {(Number(pAmount) || 0).toLocaleString()} × {pMonths.length} = <strong>Rs {((Number(pAmount) || 0) * pMonths.length).toLocaleString()}</strong>
                      </div>
                    )}
                  </div>
                )}
                <div className="form-group">
                  <label>Payment Date</label>
                  <input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={pStatus} onChange={(e) => {
                    const val = e.target.value;
                    setPStatus(val);
                    if (val === 'PAID' && isSinglePaymentCase && pSplitPayment && !pCashAmount && !pOnlineAmount) {
                      const remaining = Math.max(0, (Number(pAmount) || 0) - alreadyReceivedForSingle);
                      setPCashAmount(String(remaining));
                      setPOnlineAmount('0');
                    }
                  }}>
                    <option value="PAID">PAID</option>
                    <option value="PENDING" disabled={!isSinglePaymentCase}>PENDING{!isSinglePaymentCase ? ' (one student & month only)' : ''}</option>
                    <option value="UNPAID">UNPAID</option>
                    <option value="FREEZE">FREEZE</option>
                    <option value="DEFAULTER">DEFAULTER</option>
                    <option value="LEFT">LEFT</option>
                    <option value="SPONSORED">SPONSORED</option>
                  </select>
                </div>
                <div className="form-group full" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '2px 0' }}>
                  <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={pSplitPayment} onChange={(e) => {
                      const checked = e.target.checked;
                      setPSplitPayment(checked);
                      // Turning split on for a single PAID payment with both
                      // boxes still empty used to show "Remaining: Rs 5,000"
                      // right under a Status that already says PAID — and if
                      // saved like that, the amount would silently save as 0
                      // received, downgrading the record to UNPAID behind
                      // the admin's back. Default the full fee into Cash so
                      // the numbers agree with the status the admin picked;
                      // they can still move some of it into Online after.
                      if (checked && isSinglePaymentCase && pStatus === 'PAID' && !pCashAmount && !pOnlineAmount) {
                        const remaining = Math.max(0, (Number(pAmount) || 0) - alreadyReceivedForSingle);
                        setPCashAmount(String(remaining));
                        setPOnlineAmount('0');
                      }
                    }} />
                    Split this payment — part Cash, part Online
                  </label>
                </div>
                {!pSplitPayment && (
                  <div className="form-group">
                    <label>Method</label>
                    <select value={pMethod} onChange={(e) => setPMethod(e.target.value)}>
                      <option>Cash</option>
                      <option>Online</option>
                      <option>Bank Transfer</option>
                    </select>
                  </div>
                )}
                {pSplitPayment && pStudentSelectedIds.length <= 1 && (
                  <div className="form-group full">
                    <label>Cash / Online Split {isSinglePaymentCase ? '— amount received now' : ''}</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <input
                        type="number"
                        placeholder="Cash amount"
                        value={pCashAmount}
                        onChange={(e) => {
                          const cash = e.target.value;
                          setPCashAmount(cash);
                          if (isSinglePaymentCase) {
                            // Half payment split across two methods: cash + online is
                            // simply added together as "received now", not force-balanced
                            // to the full fee, so e.g. Rs 2000 cash + Rs 1000 online on a
                            // Rs 6000 fee correctly leaves it PENDING with Rs 3000 left.
                            const newTotal = alreadyReceivedForSingle + (Number(cash) || 0) + (Number(pOnlineAmount) || 0);
                            setPStatus(prev => ['PAID', 'UNPAID', 'PENDING'].includes(prev) ? computedSinglePaymentStatus(pAmount, newTotal) : prev);
                          } else {
                            setPOnlineAmount(String(Math.max(0, (Number(pAmount) || 0) - (Number(cash) || 0))));
                          }
                        }}
                      />
                      <input
                        type="number"
                        placeholder="Online amount"
                        value={pOnlineAmount}
                        onChange={(e) => {
                          const online = e.target.value;
                          setPOnlineAmount(online);
                          if (isSinglePaymentCase) {
                            const newTotal = alreadyReceivedForSingle + (Number(pCashAmount) || 0) + (Number(online) || 0);
                            setPStatus(prev => ['PAID', 'UNPAID', 'PENDING'].includes(prev) ? computedSinglePaymentStatus(pAmount, newTotal) : prev);
                          } else {
                            setPCashAmount(String(Math.max(0, (Number(pAmount) || 0) - (Number(online) || 0))));
                          }
                        }}
                      />
                    </div>
                    {isSinglePaymentCase ? (
                      <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                        {alreadyReceivedForSingle > 0 ? <>Already received: Rs {alreadyReceivedForSingle.toLocaleString()} · </> : null}
                        Total after this: <strong>Rs {totalReceivedForSingle.toLocaleString()}</strong> of Rs {(Number(pAmount) || 0).toLocaleString()}
                        {remainingForSingle > 0 ? <> · Remaining: <strong style={{ color: '#ff6b35' }}>Rs {remainingForSingle.toLocaleString()}</strong></> : null}
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', marginTop: '4px', color: ((Number(pCashAmount) || 0) + (Number(pOnlineAmount) || 0)) === (Number(pAmount) || 0) ? 'var(--muted)' : '#ff3b5c' }}>
                        Rs {((Number(pCashAmount) || 0) + (Number(pOnlineAmount) || 0)).toLocaleString()} of Rs {(Number(pAmount) || 0).toLocaleString()} allocated
                      </div>
                    )}
                  </div>
                )}
                {pStudentSelectedIds.length <= 1 && (
                  <div className="form-group">
                    <label>Session</label>
                    <select value={pSession} onChange={(e) => setPSession(e.target.value)}>
                      <option>Weekends</option>
                      <option>Weekdays</option>
                      <option>Both</option>
                    </select>
                  </div>
                )}
                <div className="form-group full" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--freeze)' }}>
                    <input
                      type="checkbox"
                      checked={pShowReadmission}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setPShowReadmission(checked);
                        if (!checked) {
                          setPReadmissionFee('');
                          setPReadmissionDate('');
                          setPReadmissionStatus('PAID');
                          setPReadmissionMethod('Cash');
                        }
                      }}
                    />
                    Readmission Fee <span style={{ opacity: 0.6, fontWeight: 400, color: 'var(--text)' }}>— check if this student is rejoining</span>
                  </label>
                </div>
                {pShowReadmission && (
                  <>
                    <div className="form-group">
                      <label>Readmission Fee (PKR)</label>
                      <input type="number" min="0" value={pReadmissionFee} onChange={(e) => setPReadmissionFee(e.target.value)} placeholder="0" />
                    </div>
                    <div className="form-group">
                      <label>Readmission Fee Date</label>
                      <input type="date" value={pReadmissionDate} onChange={(e) => setPReadmissionDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Readmission Status</label>
                      <select value={pReadmissionStatus} onChange={(e) => setPReadmissionStatus(e.target.value)}>
                        <option value="PAID">PAID</option>
                        <option value="UNPAID">UNPAID</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Readmission Method</label>
                      <select value={pReadmissionMethod} onChange={(e) => setPReadmissionMethod(e.target.value)}>
                        <option>Cash</option>
                        <option>Online</option>
                        <option>Bank Transfer</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setPaymentModalOpen(false); setEditPaymentTarget(null); }} disabled={savingPayment}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingPayment}>{savingPayment ? 'Saving…' : (editPaymentTarget ? 'Save Changes' : 'Save Payment')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student History Modal */}
      {historyModalOpen && historyStudent && (
        <div className="modal-overlay" onClick={() => setHistoryModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '820px', width: '95vw' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0 }}>Payment History - {historyStudent.name}</h3>
                <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
                  Age: {historyStudent.ageGroup} | Guardian: {historyStudent.guardian || '—'}
                  {(historyStudent.admissionFee || 0) > 0 && (
                    <> | Admission Fee: Rs {historyStudent.admissionFee.toLocaleString()} ({historyStudent.admissionFeeStatus}{historyStudent.admissionDate ? ` on ${historyStudent.admissionDate}` : ''})</>
                  )}
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setHistoryModalOpen(false)}>✕ Close</button>
            </div>

            <div className="table-wrap" style={{ maxHeight: '380px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Month</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {historyStudent.payments && historyStudent.payments.length > 0 ? (
                    [...historyStudent.payments]
                      .sort((a, b) => {
                        const monthCompare = (b.month || '').localeCompare(a.month || '');
                        if (monthCompare !== 0) return monthCompare;
                        return String(b._id).localeCompare(String(a._id));
                      })
                      .map((p, idx) => (
                        <tr key={p._id}>
                          <td>{idx + 1}</td>
                          <td>{p.month}</td>
                          <td>
                            Rs {p.fee.toLocaleString()}
                            {p.status === 'PENDING' && (
                              <div style={{ fontSize: '11px', color: '#ff6b35', marginTop: '2px' }}>
                                Paid Rs {(Number(p.amountPaid) || 0).toLocaleString()} · Remaining Rs {Math.max(0, (Number(p.fee) || 0) - (Number(p.amountPaid) || 0)).toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td>{p.feeDate || '—'}</td>
                          <td>
                            <span style={{ fontSize: '12px' }}>{p.method || 'Cash'}</span>
                            {((p.cashAmount || 0) > 0 || (p.onlineAmount || 0) > 0) && (
                              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                                Cash Rs {(p.cashAmount || 0).toLocaleString()} + Online Rs {(p.onlineAmount || 0).toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td>
                            <span
                              className={`badge badge-${p.status}`}
                              style={{
                                fontSize: '11px',
                                fontWeight: '600',
                                padding: '4px 10px',
                                borderRadius: '12px'
                              }}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '3px' }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => openSlip(historyStudent, p)}>📄 Slip</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => openEditPayment(historyStudent._id, p)}>✎ Edit Monthly Fee</button>
                              <button className="btn btn-danger btn-sm" onClick={() => deletePayment(historyStudent._id, p._id)}>✕</button>
                            </div>
                          </td>
                        </tr>
                      ))
                  ) : (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>No payments logged yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '14px', textAlign: 'right' }}>
              <button className="btn btn-primary" onClick={openAddPaymentForStudent}>+ Record New Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* Status Date Modal */}
      {statusDateModalOpen && (
        <div className="modal-overlay" onClick={() => setStatusDateModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '360px' }} onClick={(e) => e.stopPropagation()}>
            <h3>Update Payment Status</h3>
            <div className="form-group full">
              <label>Submission / Status Date</label>
              <input type="date" value={statusDateInput} onChange={(e) => setStatusDateInput(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setStatusDateModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmStatusChange}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {logoutConfirmOpen && (
        <div className="modal-overlay" onClick={() => setLogoutConfirmOpen(false)}>
          <div className="modal" style={{ maxWidth: '360px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <h3>Sign Out</h3>
            <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '4px' }}>Are you sure you want to logout?</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setLogoutConfirmOpen(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={logout}>Yes, Logout</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Student Selection Modal */}
      {deleteStudentModalOpen && (
        <div className="modal-overlay" onClick={() => setDeleteStudentModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--defaulter)' }}>Delete Student Record</h3>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '16px' }}>Search and add one or more students, then delete them all together. Permanently removes each student and all their history.</p>
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="Search student..."
                value={delSearchQuery}
                onChange={(e) => {
                  setDelSearchQuery(e.target.value);
                  setDelStudentDropdownOpen(true);
                }}
                onFocus={() => setDelStudentDropdownOpen(true)}
              />
              {delStudentDropdownOpen && delSearchQuery && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto', marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', position: 'absolute', zIndex: 10, width: '100%' }}>
                  {db.students
                    .filter(s => s.name.toLowerCase().includes(delSearchQuery.toLowerCase()) && !delSelectedStudents.some(sel => sel._id === s._id))
                    .map(s => (
                      <div
                        key={s._id}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--surface2)' }}
                        onClick={() => {
                          setDelSelectedStudents(prev => [...prev, s]);
                          setDelSearchQuery('');
                          setDelStudentDropdownOpen(false);
                        }}
                      >
                        {s.name} ({s.guardian || 'No Guardian'})
                      </div>
                    ))}
                </div>
              )}
            </div>
            {delSelectedStudents.length > 0 && (
              <div style={{ background: '#fff0f0', border: '1px solid #ffcdd2', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', maxHeight: '220px', overflowY: 'auto' }}>
                <div style={{ fontSize: '13px', color: 'var(--defaulter)', fontWeight: 600, marginBottom: '8px' }}>
                  ⚠️ {delSelectedStudents.length} student{delSelectedStudents.length === 1 ? '' : 's'} queued for deletion:
                </div>
                {delSelectedStudents.map(s => (
                  <div key={s._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'var(--surface)', borderRadius: '6px', marginBottom: '6px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700 }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Guardian: {s.guardian || '—'} | Age: {s.ageGroup}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setDelSelectedStudents(prev => prev.filter(sel => sel._id !== s._id))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteStudentModalOpen(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeleteStudent} disabled={!delSelectedStudents.length} style={{ opacity: delSelectedStudents.length ? 1 : 0.4, cursor: delSelectedStudents.length ? 'pointer' : 'not-allowed' }}>
                Delete {delSelectedStudents.length > 1 ? `${delSelectedStudents.length} Students` : 'Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Carry Forward to Next Month Modal */}
      {carryForwardModalOpen && (
        <div className="modal-overlay" onClick={() => !cfRunning && setCarryForwardModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <h3>Carry Forward Students</h3>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '16px' }}>
              Takes one month's roster and creates an UNPAID fee record for another month, so you don't have to record payments one-by-one. Students who left, or who have no record for the "from" month, are not carried.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>From Month (roster)</label>
                <input type="month" value={cfFromMonth} onChange={(e) => setCfFromMonth(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div style={{ paddingBottom: '10px', color: 'var(--muted)', fontWeight: 700 }}>→</div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>To Month (new records)</label>
                <input type="month" value={cfMonth} onChange={(e) => setCfMonth(e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>
            {cfMonth && cfFromMonth && cfFromMonth >= cfMonth && (
              <div style={{ background: '#ff3b5c18', border: '1px solid #ff3b5c', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', fontSize: '12px', color: '#ff3b5c' }}>
                The "from" month must come before the "to" month.
              </div>
            )}
            {cfMonth && cfFromMonth && cfFromMonth < cfMonth && (
              <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px' }}>
                <div>
                  <strong>{getCarryForwardTargets().length}</strong> student(s) from {cfFromMonth} will get a new UNPAID record for {cfMonth}.
                </div>
                {/* Anyone who already paid ahead keeps their record exactly as it is. */}
                {getCarryForwardSkipped().length > 0 && (
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', color: 'var(--muted)', fontSize: '12px' }}>
                    <strong>{getCarryForwardSkipped().length}</strong> already have a {cfMonth} record (paid in advance) — left untouched:
                    <div style={{ marginTop: '4px' }}>{getCarryForwardSkipped().map(s => s.name).join(', ')}</div>
                  </div>
                )}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setCarryForwardModalOpen(false)} disabled={cfRunning}>Cancel</button>
              <button className="btn btn-primary" onClick={runCarryForward} disabled={cfRunning || !cfFromMonth || !cfMonth || cfFromMonth >= cfMonth || getCarryForwardTargets().length === 0}>
                {cfRunning ? 'Processing...' : 'Carry Forward'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {slipModalOpen && slipData && (
        <div className="modal-overlay" onClick={() => setSlipModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '420px', padding: 0, display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div ref={slipContentRef} className="receipt-doc" style={{ padding: '28px 28px 20px', background: '#fff', color: '#0d1b2e' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #0d1b2e', paddingBottom: '14px', marginBottom: '18px' }}>
                {academySettings.logo && <img src={academySettings.logo} alt="Logo" style={{ width: '54px', height: '54px', borderRadius: '50%', objectFit: 'cover', marginBottom: '8px' }} />}
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '32px', letterSpacing: '3px', color: '#0d1b2e' }}>{academySettings.name}</div>
                <div style={{ fontSize: '11px', color: '#4a6080', textTransform: 'uppercase', letterSpacing: '2px' }}>{academySettings.tagline}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '8px' }}>{slipData.booking ? 'Booking Receipt' : (slipData.admissionOnly ? 'Admission Fee Receipt' : 'Fee Receipt')}</div>
                <div style={{ fontSize: '12px', color: '#4a6080', marginTop: '4px' }}>{slipData.booking ? (slipData.booking.paymentDate || slipData.booking.date) : slipData.payment.feeDate}</div>
              </div>
              {slipData.booking ? (
              <table style={{ width: '100%', fontSize: '13px' }}>
                <tbody>
                  <tr><td style={{ color: '#4a6080', width: '40%' }}>Team</td><td style={{ fontWeight: 600 }}>{slipData.booking.teamName}</td></tr>
                  {slipData.booking.contact && (
                    <tr><td style={{ color: '#4a6080' }}>Contact</td><td>{slipData.booking.contact}</td></tr>
                  )}
                  <tr><td style={{ color: '#4a6080' }}>Ground</td><td>{slipData.booking.ground === 'FOOTBALL' ? 'Football' : 'Cricket'}</td></tr>
                  <tr><td style={{ color: '#4a6080' }}>Date</td><td>{slipData.booking.date}</td></tr>
                  <tr><td style={{ color: '#4a6080' }}>Time</td><td>{slipData.booking.startTime}{slipData.booking.endTime ? ` – ${slipData.booking.endTime}` : ''}</td></tr>
                  <tr><td style={{ color: '#4a6080' }}>Payment Type</td><td>{slipData.booking.paymentMethod}{((slipData.booking.cashAmount || 0) > 0 || (slipData.booking.onlineAmount || 0) > 0) ? ` (Cash Rs ${(slipData.booking.cashAmount || 0).toLocaleString()} + Online Rs ${(slipData.booking.onlineAmount || 0).toLocaleString()})` : ''}</td></tr>
                  {slipData.booking.installments && slipData.booking.installments.length > 1 && (
                    <tr>
                      <td style={{ color: '#4a6080', verticalAlign: 'top' }}>Received In</td>
                      <td>
                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                          <tbody>
                            {slipData.booking.installments.map((inst, i) => (
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
                    <td style={{ fontWeight: 700, fontSize: '16px', color: '#00a876', paddingTop: '10px' }}>Rs {(slipData.booking.amount || 0).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700, fontSize: '14px' }}>Total Received</td>
                    <td style={{ fontWeight: 700, fontSize: '16px', color: '#00a876' }}>Rs {(slipData.booking.amountPaid || 0).toLocaleString()}</td>
                  </tr>
                  <tr><td style={{ color: '#4a6080' }}>Status</td><td style={{ fontWeight: 600 }}>{slipData.booking.status}</td></tr>
                </tbody>
              </table>
              ) : (
              <table style={{ width: '100%', fontSize: '13px' }}>
                <tbody>
                  <tr><td style={{ color: '#4a6080', width: '40%' }}>{isFamilySlip ? 'Students' : 'Student'}</td><td style={{ fontWeight: 600 }}>{slipStudents.map(s => s.name).join(', ')}</td></tr>
                  <tr><td style={{ color: '#4a6080' }}>Guardian</td><td>{slipData.student.guardian || '—'}</td></tr>
                  {!isFamilySlip && (
                    <tr><td style={{ color: '#4a6080' }}>Session</td><td>{slipData.student.session}</td></tr>
                  )}
                  {!slipData.admissionOnly && (
                    <tr><td style={{ color: '#4a6080' }}>{slipData.payment.months && slipData.payment.months.length > 1 ? 'Billing Months' : 'Billing Month'}</td><td>{formatBillingMonth(slipData.payment.month)}</td></tr>
                  )}
                  {!slipData.admissionOnly && (isFamilySlip && slipData.showPerChildStatus ? (
                    <>
                      <tr>
                        <td colSpan={2} style={{ padding: '12px 0 4px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#4a6080', marginBottom: '8px' }}>Students</div>
                          {slipStudents.map((s, i) => (
                            <div key={s._id} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid #f2f2f2' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <div style={{ fontWeight: 700, fontSize: '14px' }}>{s.name}</div>
                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap', background: s.receiptStatus === 'PAID' ? '#e6f7ee' : '#fff1ec', color: s.receiptStatus === 'PAID' ? '#00a876' : '#ff6b35' }}>{s.receiptStatus}</span>
                              </div>
                              <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                                {s.receiptMethod || 'Cash'}
                                {((s.receiptCashAmount || 0) > 0 && (s.receiptOnlineAmount || 0) > 0) && ` — Cash ${s.receiptCashAmount.toLocaleString()} + Online ${s.receiptOnlineAmount.toLocaleString()}`}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '6px' }}>
                                <span style={{ color: '#4a6080' }}>Received / Fee</span>
                                <span style={{ fontWeight: 600 }}>Rs {(s.receiptReceived ?? 0).toLocaleString()} / {(s.receiptFee ?? 0).toLocaleString()}</span>
                              </div>
                              {(s.receiptAdmissionFee || 0) > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
                                  <span style={{ color: '#4a6080' }}>Admission <span style={{ color: '#999' }}>({admissionLabel(s.receiptAdmissionFee, s.receiptAdmissionReceived, s.receiptAdmissionMethod)})</span></span>
                                  <span style={{ fontWeight: 600 }}>Rs {s.receiptAdmissionFee.toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </td>
                      </tr>
                      <tr><td style={{ color: '#4a6080' }}>Status</td><td style={{ fontWeight: 600 }}>{slipData.payment.status === 'MIXED' ? 'See breakdown above' : slipData.payment.status}</td></tr>
                    </>
                  ) : (
                    <>
                      {!isFamilySlip && slipData.payment.months && slipData.payment.months.length > 1 && (
                        <tr><td style={{ color: '#4a6080' }}>Fee / Month</td><td>Rs {slipData.payment.perMonthFee.toLocaleString()} × {slipData.payment.months.length}</td></tr>
                      )}
                      <tr><td style={{ color: '#4a6080' }}>Payment Type</td><td>{slipData.payment.method}{((slipData.payment.cashAmount || 0) > 0 || (slipData.payment.onlineAmount || 0) > 0) ? ` (Cash Rs ${(slipData.payment.cashAmount || 0).toLocaleString()} + Online Rs ${(slipData.payment.onlineAmount || 0).toLocaleString()})` : ''}</td></tr>
                    </>
                  ))}
                  {slipData.payment.installments && slipData.payment.installments.length > 1 && (
                    <tr>
                      <td style={{ color: '#4a6080', verticalAlign: 'top' }}>Received In</td>
                      <td>
                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                          <tbody>
                            {slipData.payment.installments.map((inst, i) => (
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
                  {slipData.admissionFee > 0 && !(isFamilySlip && slipData.showPerChildStatus) && (
                    <tr><td style={{ color: '#4a6080' }}>Admission Fee <span style={{ fontSize: '11px', color: '#999' }}>({admissionLabel(slipData.admissionFee, slipData.admissionFeeReceived, slipData.admissionMethod)})</span></td><td style={{ fontWeight: 600 }}>Rs {slipData.admissionFee.toLocaleString()}</td></tr>
                  )}
                  {slipReadmissionAmt > 0 && (
                    <tr><td style={{ color: '#4a6080' }}>Readmission Fee</td><td style={{ fontWeight: 600 }}>Rs {slipReadmissionAmt.toLocaleString()}</td></tr>
                  )}
                  {!slipData.admissionOnly && (
                    <tr style={{ borderTop: '2px solid #0d1b2e' }}>
                      <td style={{ fontWeight: 700, fontSize: '14px', paddingTop: '10px' }}>{(slipData.admissionFee > 0 || slipReadmissionAmt > 0 || slipData.showPerChildStatus) ? 'Monthly Fee' : 'Amount'}</td>
                      <td style={{ fontWeight: 700, fontSize: '16px', color: '#00a876', paddingTop: '10px' }}>Rs {slipData.payment.fee.toLocaleString()}</td>
                    </tr>
                  )}
                  {(slipData.admissionOnly || slipData.admissionFee > 0 || slipReadmissionAmt > 0 || slipData.showPerChildStatus) && (
                    <tr style={slipData.admissionOnly ? { borderTop: '2px solid #0d1b2e' } : {}}>
                      <td style={{ fontWeight: 700, fontSize: '14px', paddingTop: slipData.admissionOnly ? '10px' : 0 }}>Total Received</td>
                      <td style={{ fontWeight: 700, fontSize: '16px', color: '#00a876', paddingTop: slipData.admissionOnly ? '10px' : 0 }}>Rs {(slipMonthlyReceived + (slipData.admissionFeeReceived ?? slipData.admissionFee ?? 0) + slipReadmissionAmt).toLocaleString()}</td>
                    </tr>
                  )}
                  {/* Single-student receipts show Status here at the bottom;
                      family/sibling receipts already showed it right after
                      the Students table above, so it isn't repeated. */}
                  {!(isFamilySlip && slipData.showPerChildStatus) && !slipData.admissionOnly && (
                    <tr><td style={{ color: '#4a6080' }}>Status</td><td style={{ fontWeight: 600 }}>{slipData.payment.status === 'MIXED' ? 'See breakdown above' : slipData.payment.status}</td></tr>
                  )}
                </tbody>
              </table>
              )}
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
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={printSlip}>🖨️ Print</button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={shareSlip} disabled={slipSharing}>
                {slipSharing ? 'Preparing…' : '📤 Share'}
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSlipModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {expenseModalOpen && (
        <div className="modal-overlay" onClick={() => { setExpenseModalOpen(false); setEditingExpenseId(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingExpenseId ? 'Edit Expense' : 'Record Expense'}</h3>
            <form onSubmit={saveExpense}>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Title</label>
                  <input type="text" value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="Staff salaries, pitches..." required />
                </div>
                <div className="form-group">
                  <label>Amount (PKR)</label>
                  <input type="number" value={eAmount} onChange={(e) => setEAmount(e.target.value)} placeholder="5000" required />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select value={eCategory} onChange={(e) => setECategory(e.target.value)}>
                    <option>Salaries</option>
                    <option>Equipment</option>
                    <option>Maintenance</option>
                    <option>Transport</option>
                    <option>Utilities</option>
                    <option>Marketing</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Payment Method</label>
                  <select value={eMethod} onChange={(e) => setEMethod(e.target.value)}>
                    <option>Cash</option>
                    <option>Online</option>
                    <option>Bank Transfer</option>
                  </select>
                </div>
                <div className="form-group full">
                  <label>Description</label>
                  <input type="text" value={eDescription} onChange={(e) => setEDescription(e.target.value)} placeholder="Details..." />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setExpenseModalOpen(false); setEditingExpenseId(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingExpenseId ? 'Update Expense' : 'Save Expense'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Modal */}
      {stockModalOpen && (
        <div className="modal-overlay" onClick={() => setStockModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Stock Item</h3>
            <form onSubmit={saveStock}>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Item Name</label>
                  <input type="text" value={stName} onChange={(e) => setStName(e.target.value)} placeholder="Cricket Ball" required />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select value={stCategory} onChange={(e) => setStCategory(e.target.value)}>
                    {STOCK_CATEGORIES.map((cat) => (
                      <option key={cat}>{cat}</option>
                    ))}
                    {/* Keeps an older category (e.g. plain "Kits") selectable on
                        existing items instead of silently blanking the field. */}
                    {stCategory && !STOCK_CATEGORIES.includes(stCategory) && (
                      <option>{stCategory}</option>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" value={stQty} onChange={(e) => setStQty(e.target.value)} placeholder="10" required />
                </div>
                <div className="form-group">
                  <label>Unit Cost (PKR)</label>
                  <input type="number" value={stCost} onChange={(e) => setStCost(e.target.value)} placeholder="3000" required />
                </div>
                <div className="form-group full">
                  <label>Condition</label>
                  <select value={stCondition} onChange={(e) => setStCondition(e.target.value)}>
                    <option>New</option>
                    <option>Good</option>
                    <option>Fair</option>
                    <option>Poor</option>
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setStockModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POS Sell Picker Modal */}
      {sellPickerOpen && (
        <div className="modal-overlay" onClick={() => setSellPickerOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Choose Item to Sell</h3>
            <div className="form-group full">
              <label>Category</label>
              <select value={spCategory} onChange={(e) => changeSellPickerCategory(e.target.value)}>
                <option value="All">All Categories ({db.stock.length})</option>
                {sellPickerCategories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat} ({db.stock.filter(i => (i.category || 'Other') === cat).length})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group full">
              <label>Item</label>
              <select value={spSelectedItemId} onChange={(e) => setSpSelectedItemId(e.target.value)}>
                {sellPickerItems.length === 0 ? (
                  <option value="">No items in this category</option>
                ) : (
                  sellPickerItems.map(item => (
                    <option key={item._id} value={item._id}>
                      {item.item} — {item.category || 'Other'} (Avail: {item.qty})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setSellPickerOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={proceedToSell} disabled={!spSelectedItemId}>Next</button>
            </div>
          </div>
        </div>
      )}

      {/* POS Sell Form Modal */}
      {sellFormOpen && slItem && (
        <div className="modal-overlay" onClick={() => setSellFormOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Sell {slItem.item}</h3>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
              Available in inventory: <strong>{slItem.qty}</strong> units @ cost Rs {slItem.unitCost.toLocaleString()}
            </div>
            <form onSubmit={confirmSell}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" value={slQty} onChange={(e) => setSlQty(e.target.value)} min="1" max={slItem.qty} placeholder="1" required />
                </div>
                <div className="form-group">
                  <label>Sale Price / Unit (PKR)</label>
                  <input type="number" value={slPrice} onChange={(e) => setSlPrice(e.target.value)} placeholder="100" required />
                </div>
                <div className="form-group">
                  <label>Sale Date</label>
                  <input type="date" value={slDate} onChange={(e) => setSlDate(e.target.value)} required />
                </div>
                <div className="form-group full">
                  <label>Notes</label>
                  <input type="text" value={slNotes} onChange={(e) => setSlNotes(e.target.value)} placeholder="Buyer details..." />
                </div>
                <div className="form-group full" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--paid)' }}>
                  Total Invoice: Rs {((Number(slQty) || 0) * (Number(slPrice) || 0)).toLocaleString()}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setSellFormOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Confirm Sale</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ground Hours settings */}
      {groundHoursModalOpen && (
        <div className="modal-overlay" onClick={() => setGroundHoursModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Ground Hours Settings</h3>
            <div className="form-grid">
              <div className="form-group full">
                <label style={{ color: 'var(--freeze)' }}>Cricket Ground</label>
              </div>
              <div className="form-group">
                <label>Opening Time</label>
                <select value={gsOpenVal} onChange={(e) => setGsOpenVal(Number(e.target.value))}>
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{fmtTime(toHHMM(i))}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Closing Time</label>
                <select value={gsCloseVal} onChange={(e) => setGsCloseVal(Number(e.target.value))}>
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{fmtTime(toHHMM(i))}</option>
                  ))}
                </select>
              </div>
              <div className="form-group full" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <label style={{ color: 'var(--freeze)' }}>Football Ground</label>
              </div>
              <div className="form-group">
                <label>Opening Time</label>
                <select value={gsFbOpenVal} onChange={(e) => setGsFbOpenVal(Number(e.target.value))}>
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{fmtTime(toHHMM(i))}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Closing Time</label>
                <select value={gsFbCloseVal} onChange={(e) => setGsFbCloseVal(Number(e.target.value))}>
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>{fmtTime(toHHMM(i))}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setGroundHoursModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveGroundSettings}>Save Settings</button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Form Modal */}
      {bookingModalOpen && (
        <div className="modal-overlay" onClick={() => setBookingModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingBookingId ? 'Edit Booking' : 'New Ground Booking'}</h3>
            <form onSubmit={saveBooking}>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Team / Club Name</label>
                  <input type="text" value={bkTeam} onChange={(e) => setBkTeam(e.target.value)} placeholder="e.g. Islamabad Kings" required />
                </div>
                <div className="form-group">
                  <label>Contact Number</label>
                  <input type="text" value={bkContact} onChange={(e) => setBkContact(e.target.value)} placeholder="0300-1234567" />
                  {bkContact && phoneError(bkContact) ? (
                    <div style={{ color: '#ff3b5c', fontSize: '11px', marginTop: '4px' }}>Number is not valid — 11 digits starting with 03</div>
                  ) : null}
                </div>
                <div className="form-group">
                  <label>Booking Date</label>
                  <input type="date" value={bkDate} onChange={(e) => setBkDate(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Start Time</label>
                  <select value={bkStart} onChange={(e) => setBkStart(e.target.value)} required>
                    <option value="">-- Select --</option>
                    {startTimesAvailable.map(h => (
                      <option key={h} value={toHHMM(h)}>{fmtTime(toHHMM(h))}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Duration</label>
                  <select value={bkDuration} onChange={(e) => setBkDuration(e.target.value)}>
                    <option value="1">1 Hour</option>
                    <option value="2">2 Hours</option>
                    <option value="3">3 Hours</option>
                    <option value="4">4 Hours</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>End Time (Auto)</label>
                  <input type="text" value={getEndTimePreview()} readOnly style={{ background: 'var(--surface2)', fontWeight: 700 }} placeholder="Auto-calculated" />
                </div>
                <div className="form-group">
                  <label>Amount (PKR)</label>
                  <input type="number" value={bkAmount} onChange={(e) => {
                    const v = e.target.value;
                    setBkAmount(v);
                    setBkStatus((prev) => prev === 'CANCELLED' ? prev : computeBookingStatus(v, bkAmountPaid));
                  }} placeholder="3000" />
                </div>
                <div className="form-group full" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '2px 0' }}>
                  <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={bkSplitPayment} onChange={(e) => {
                      const checked = e.target.checked;
                      setBkSplitPayment(checked);
                      if (checked) {
                        setBkCashAmount(bkAmountPaid || '');
                        setBkOnlineAmount('');
                      }
                    }} />
                    Split this payment — part Cash, part Online
                  </label>
                </div>
                {!bkSplitPayment && (
                  <div className="form-group">
                    <label>Payment Received</label>
                    <input type="number" value={bkAmountPaid} onChange={(e) => {
                      const v = e.target.value;
                      setBkAmountPaid(v);
                      setBkStatus((prev) => prev === 'CANCELLED' ? prev : computeBookingStatus(bkAmount, v));
                    }} placeholder="0" />
                    {bkAmount ? (
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                        Remaining: <strong>Rs {Math.max(0, (Number(bkAmount) || 0) - (Number(bkAmountPaid) || 0)).toLocaleString()}</strong>
                      </div>
                    ) : null}
                  </div>
                )}
                {!bkSplitPayment && (
                  <div className="form-group">
                    <label>Payment Method</label>
                    <select value={bkMethod} onChange={(e) => setBkMethod(e.target.value)}>
                      <option>Cash</option>
                      <option>Online</option>
                      <option>Bank Transfer</option>
                    </select>
                  </div>
                )}
                {bkSplitPayment && (
                  <div className="form-group full">
                    <label>Cash / Online Split — total received so far</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <input
                        type="number"
                        min="0"
                        placeholder="Cash amount"
                        value={bkCashAmount}
                        onChange={(e) => {
                          const cash = e.target.value;
                          setBkCashAmount(cash);
                          const total = (Number(cash) || 0) + (Number(bkOnlineAmount) || 0);
                          setBkStatus((prev) => prev === 'CANCELLED' ? prev : computeBookingStatus(bkAmount, total));
                        }}
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Online amount"
                        value={bkOnlineAmount}
                        onChange={(e) => {
                          const online = e.target.value;
                          setBkOnlineAmount(online);
                          const total = (Number(bkCashAmount) || 0) + (Number(online) || 0);
                          setBkStatus((prev) => prev === 'CANCELLED' ? prev : computeBookingStatus(bkAmount, total));
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                      Total received: <strong>Rs {((Number(bkCashAmount) || 0) + (Number(bkOnlineAmount) || 0)).toLocaleString()}</strong> of Rs {(Number(bkAmount) || 0).toLocaleString()}
                      {bkAmount ? <> · Remaining: <strong style={{ color: '#ff6b35' }}>Rs {Math.max(0, (Number(bkAmount) || 0) - (Number(bkCashAmount) || 0) - (Number(bkOnlineAmount) || 0)).toLocaleString()}</strong></> : null}
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label>Payment Date</label>
                  <input type="date" value={bkPaymentDate} onChange={(e) => setBkPaymentDate(e.target.value)} />
                </div>
                <div className="form-group full">
                  <label>Status</label>
                  <select value={bkStatus} onChange={(e) => setBkStatus(e.target.value)}>
                    <option value="PENDING">PENDING</option>
                    <option value="CONFIRMED">CONFIRMED</option>
                    <option value="FINISHED">FINISHED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
                <div className="form-group full">
                  <label>Notes</label>
                  <input type="text" value={bkNotes} onChange={(e) => setBkNotes(e.target.value)} placeholder="Match details..." />
                </div>
              </div>
              {bkConflictWarn && (
                <div style={{ marginTop: '12px', background: '#fff0f0', border: '1px solid #ffcdd2', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#c0392b' }}>
                  {bkConflictWarn}
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setBookingModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Booking</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Booking Detail Modal */}
      {bookingDetailModalOpen && bkDetail && (
        <div className="modal-overlay" onClick={() => setBookingDetailModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>{bkDetail.teamName} Booking Details</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setBookingDetailModalOpen(false)}>✕</button>
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text)' }}>
              <p style={{ padding: '6px 0' }}>Date: <strong>{bkDetail.date}</strong></p>
              <p style={{ padding: '6px 0' }}>Time Slot: <strong>{fmtTime(bkDetail.startTime)} to {fmtTime(bkDetail.endTime)}</strong> ({bkDetail.duration} Hour(s))</p>
              <p style={{ padding: '6px 0' }}>Amount: <strong>Rs {bkDetail.amount.toLocaleString()}</strong> ({bkDetail.paymentMethod})</p>
              {((bkDetail.cashAmount || 0) > 0 || (bkDetail.onlineAmount || 0) > 0) && (
                <p style={{ padding: '6px 0', fontSize: '12px', color: 'var(--muted)' }}>Cash Rs {(bkDetail.cashAmount || 0).toLocaleString()} + Online Rs {(bkDetail.onlineAmount || 0).toLocaleString()}</p>
              )}
              {bkDetail.installments && bkDetail.installments.length > 1 && (
                <div style={{ padding: '6px 0', fontSize: '12px', color: 'var(--muted)' }}>
                  Received in:
                  <table style={{ width: '100%', fontSize: '12px', marginTop: '2px' }}>
                    <tbody>
                      {bkDetail.installments.map((inst, i) => (
                        <tr key={i}>
                          <td style={{ padding: '1px 4px 1px 0', color: '#7a8ba0' }}>{inst.date || '—'}</td>
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
                </div>
              )}
              <p style={{ padding: '6px 0' }}>Amount Paid: <strong>Rs {getBookingPaid(bkDetail).toLocaleString()}</strong></p>
              <p style={{ padding: '6px 0' }}>Remaining: <strong>Rs {Math.max(0, (Number(bkDetail.amount) || 0) - getBookingPaid(bkDetail)).toLocaleString()}</strong></p>
              {bkDetail.paymentDate && <p style={{ padding: '6px 0' }}>Payment Date: <strong>{bkDetail.paymentDate}</strong></p>}
              <p style={{ padding: '6px 0' }}>Contact: <strong>{bkDetail.contact || '—'}</strong></p>
              <p style={{ padding: '6px 0' }}>Status: <span className={`badge badge-${bkDetail.status}`}>{bkDetail.status}</span></p>
              {bkDetail.notes && <p style={{ padding: '6px 0', borderTop: '1px solid var(--border)', marginTop: '8px', paddingTop: '8px' }}>Notes: {bkDetail.notes}</p>}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setBookingDetailModalOpen(false)}>Close</button>
              <button className="btn btn-primary" onClick={() => openEditBooking(bkDetail)}>✏️ Edit</button>
              <button className="btn btn-danger" onClick={() => deleteBooking(bkDetail._id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert */}
      <div className={`toast ${toastShow ? 'show' : ''}`} style={{ background: toastBg }}>
        {toastMsg}
      </div>
    </div>
  );
}
