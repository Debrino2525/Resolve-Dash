/**
 * Formats what a rider types into DD/MM/YYYY as they type (inserting the slashes).
 * "25122027" → "25/12/2027"
 */
export function maskDdMmYyyy(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** "25/12/2027" → "2027-12-25", or null if it is not a real calendar date. */
export function ddMmYyyyToIso(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
  if (d.getUTCFullYear() !== +yyyy || d.getUTCMonth() !== +mm - 1 || d.getUTCDate() !== +dd) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/** "2027-12-25" → "25/12/2027" */
export function isoToDdMmYyyy(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** True if the ISO date is before today (device date). */
export function isPastIsoDate(iso: string, now: Date = new Date()): boolean {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return iso < today;
}
