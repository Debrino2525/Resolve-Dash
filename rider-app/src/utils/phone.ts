/**
 * Normalises what a rider types into the +233 box to E.164, or returns null if it isn't a
 * Ghana mobile number. Accepts "241234567", "0241234567", "24 123 4567", "+233241234567".
 */
export function toGhanaE164(input: string): string | null {
  let digits = input.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+233')) digits = digits.slice(4);
  else if (digits.startsWith('233') && digits.length === 12) digits = digits.slice(3);
  digits = digits.replace(/^0+/, '');
  return /^[25]\d{8}$/.test(digits) ? `+233${digits}` : null;
}

/** +233241234567 → "024 123 4567" for display. */
export function formatGhanaLocal(e164: string): string {
  const m = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}
