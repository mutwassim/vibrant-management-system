// Pakistani mobile number rules — shared by the UI, the API routes and the
// Excel importer so all three agree on what a valid number is.
//
// Valid  : 03139832544  (11 digits, starts with 03)
// Also accepted and converted to the 03… form:
//   +923139832544 / 00923139832544 / 923139832544
//   3139832544    (Excel drops the leading zero from number cells)
//   0313-983-2544 / 0313 983 2544  (dashes and spaces are ignored)
// Anything else (landlines, wrong length, letters) is rejected.

export const PHONE_HINT = 'Number must be 11 digits starting with 03 — e.g. 03139832544';

/** Cleans a number into the canonical 03XXXXXXXXX form. Returns '' for empty input. */
export function normalizePhone(value) {
  if (value === null || value === undefined) return '';

  let s = String(value).trim();
  if (!s) return '';

  s = s.replace(/[^\d+]/g, ''); // drop spaces, dashes, brackets, "/-" etc.

  if (s.startsWith('+92')) s = '0' + s.slice(3);
  else if (s.startsWith('0092')) s = '0' + s.slice(4);
  else if (/^92\d{10}$/.test(s)) s = '0' + s.slice(2);
  else if (/^3\d{9}$/.test(s)) s = '0' + s; // leading zero eaten by Excel

  return s.replace(/\D/g, '');
}

/** true only for a proper 11-digit 03… mobile number. */
export function isValidPhone(value) {
  return /^03\d{9}$/.test(normalizePhone(value));
}

/**
 * Validates one contact field.
 * @returns {string} an error message, or '' when the value is acceptable.
 */
export function phoneError(value, { required = false, label = 'Contact number' } = {}) {
  const cleaned = normalizePhone(value);
  if (!cleaned) return required ? `${label} is required` : '';
  if (!isValidPhone(cleaned)) return `${label} is not valid. ${PHONE_HINT}`;
  return '';
}