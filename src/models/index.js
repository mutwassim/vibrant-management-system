import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Academy branding + ground hours. Stored on the account so they follow the
// admin to any device, and so two admins sharing a browser can't overwrite
// each other. Device-only preferences (dark mode) stay in localStorage.
const SettingsSchema = new mongoose.Schema({
  name:        { type: String, default: '' },
  tagline:     { type: String, default: '' },
  phone:       { type: String, default: '' },
  email:       { type: String, default: '' },
  website:     { type: String, default: '' },
  address:     { type: String, default: '' },
  logo:        { type: String, default: '' },   // base64 data URL, capped at 2MB by the UI
  groundOpen:  { type: Number, default: 20 },
  groundClose: { type: Number, default: 2 },
  fbOpen:      { type: Number, default: 20 },
  fbClose:     { type: Number, default: 2 }
}, { _id: false });

// User Schema
const UserSchema = new mongoose.Schema({
  name:               { type: String, required: true, trim: true },
  email:              { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:           { type: String, required: true },
  role:               { type: String, enum: ['SUPER_ADMIN', 'ADMIN'], default: 'ADMIN' },
  academyName:        { type: String, default: '' },
  subscriptionStatus: { type: String, enum: ['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'], default: 'TRIAL' },
  subscriptionPlan:   { type: String, enum: ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'], default: 'FREE' },
  isActive:           { type: Boolean, default: true },
  // Optional: stores the SUPER_ADMIN's _id who created this account
  createdBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  settings:           { type: SettingsSchema, default: () => ({}) },
  lastLogin:          { type: Date, default: null },
  createdAt:          { type: Date, default: Date.now }
});

// Hash password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Instance method: verify plain password
UserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// Never expose password in JSON responses
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Payment Schema
const PaymentSchema = new mongoose.Schema({
  fee:        { type: Number,  default: 0 },
  feeDate:    { type: String,  default: '' },
  month:      { type: String,  default: '' },
  status:     { type: String,  default: 'PAID' },
  method:     { type: String,  default: 'Cash' },
  // Split payment — e.g. a student pays half the fee in cash and half
  // online in the same transaction. When both are 0, this payment is a
  // plain single-method payment and `method` above is what to trust.
  cashAmount:   { type: Number, default: 0 },
  onlineAmount: { type: Number, default: 0 },
  // Partial/half payments — how much of `fee` has actually been received so
  // far for this month. When 0 < amountPaid < fee the status is PENDING;
  // once amountPaid >= fee the status becomes PAID. Left at 0 for records
  // saved before this existed (treated as fully paid if status is PAID, see
  // getPaidAmount-style fallback on the frontend).
  amountPaid: { type: Number, default: 0 },
  // Every individual transaction that went into this month's payment — e.g.
  // Rs 2,000 cash on the 5th, then Rs 1,000 online on the 12th, then Rs
  // 2,000 cash on the 20th. cashAmount/onlineAmount/amountPaid above stay
  // as the running totals (existing code reads those directly); this array
  // is purely additive so the receipt can show the full history.
  installments: [{
    date:         { type: String, default: '' },
    cashAmount:   { type: Number, default: 0 },
    onlineAmount: { type: Number, default: 0 },
    amount:       { type: Number, default: 0 },
    method:       { type: String, default: 'Cash' }
  }],
  notes:      { type: String,  default: '' },
  // Optional readmission fee, charged if a student rejoins after leaving.
  readmissionFee:   { type: Number, default: 0 },
  readmissionDate:  { type: String, default: '' },
  readmissionStatus: { type: String, default: 'PAID' },
  readmissionMethod: { type: String, default: 'Cash' },
  recordedAt: { type: Date,    default: Date.now }
});

// Student Schema
const StudentSchema = new mongoose.Schema({
  ownerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  name:     String,
  guardian: String,
  ageGroup: String,
  session:  String,
  contact:  String,
  contact2: String,
  // One-time admission / registration fee, charged when the student joins.
  admissionFee:       { type: Number, default: 0 },
  admissionDate:      { type: String, default: '' },
  admissionFeeStatus: { type: String, default: 'UNPAID' },
  admissionMethod:    { type: String, default: 'Cash' },
  // Set true the moment the admission fee has actually appeared on a
  // printed/shared receipt. Payments are matched to the admission fee by
  // this flag instead of by comparing dates, because date-matching breaks
  // whenever a payment happens to be dated the same as the admission date
  // (e.g. backfilled records) and wrongly re-shows an already-paid fee.
  admissionFeeCharged: { type: Boolean, default: false },
  status:   { type: String, default: 'UNPAID' },
  fee:      { type: Number, default: 0 },
  feeDate:  { type: String, default: '' },
  month:    { type: String, default: '' },
  payments: [PaymentSchema]
});
export const Student = mongoose.models.Student || mongoose.model('Student', StudentSchema);

// Expense Schema
const ExpenseSchema = new mongoose.Schema({
  ownerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  title:       String,
  amount:      Number,
  category:    String,
  date:        String,
  month:       String,
  description: String,
  method:      { type: String, default: 'Cash' }
});
export const Expense = mongoose.models.Expense || mongoose.model('Expense', ExpenseSchema);

// Stock Schema
const StockSchema = new mongoose.Schema({
  ownerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  item:        String,
  category:    String,
  qty:         { type: Number, default: 0 },
  unitCost:    { type: Number, default: 0 },
  condition:   String,
  lastUpdated: String
});
export const Stock = mongoose.models.Stock || mongoose.model('Stock', StockSchema);

// StockTransaction Schema
const StockTransactionSchema = new mongoose.Schema({
  ownerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  item:      String,
  stockId:   String,
  category:  { type: String, default: '' },
  type:      { type: String, default: 'PURCHASE' },
  qty:       { type: Number, default: 0 },
  unitPrice: { type: Number, default: 0 },
  amount:    { type: Number, default: 0 },
  cash:      { type: Number, default: 0 },
  date:      { type: String, default: '' },
  notes:     { type: String, default: '' },
  createdAt: { type: Date,   default: Date.now }
});
export const StockTransaction = mongoose.models.StockTransaction || mongoose.model('StockTransaction', StockTransactionSchema);

// Booking Schema
const BookingSchema = new mongoose.Schema({
  ownerId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  teamName:      { type: String, default: '' },
  contact:       { type: String, default: '' },
  date:          { type: String, default: '' },
  paymentDate:   { type: String, default: '' },
  startTime:     { type: String, default: '' },
  endTime:       { type: String, default: '' },
  // Which ground this booking is for. Older bookings have no value and are
  // treated as CRICKET everywhere.
  ground:        { type: String, default: 'CRICKET' },   // 'CRICKET' | 'FOOTBALL'
  duration:      { type: Number, default: 1 },           // cricket: whole hours
  durationMins:  { type: Number, default: 0 },           // football: minutes (90 etc.)
  amount:        { type: Number, default: 0 },
  amountPaid:    { type: Number, default: 0 },
  status:        { type: String, default: 'CONFIRMED' },
  paymentMethod: { type: String, default: 'Cash' },
  // Split payment — e.g. a team pays part in cash and part online for the
  // same booking. When both are 0, paymentMethod above is what to trust.
  cashAmount:    { type: Number, default: 0 },
  onlineAmount:  { type: Number, default: 0 },
  // Same idea as a student's payment installments: every individual
  // transaction that went into this booking (e.g. Rs 2,000 cash on
  // booking day, then Rs 1,000 online later), so the receipt/history can
  // show the full trail, not just the running totals above.
  installments: [{
    date:         { type: String, default: '' },
    cashAmount:   { type: Number, default: 0 },
    onlineAmount: { type: Number, default: 0 },
    amount:       { type: Number, default: 0 },
    method:       { type: String, default: 'Cash' }
  }],
  notes:         { type: String, default: '' },
  createdAt:     { type: Date,   default: Date.now }
});
export const Booking = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);