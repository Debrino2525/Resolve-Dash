import { ddMmYyyyToIso, isoToDdMmYyyy, isPastIsoDate, maskDdMmYyyy } from '../src/utils/date';

describe('maskDdMmYyyy', () => {
  it.each([
    ['2', '2'],
    ['251', '25/1'],
    ['25122', '25/12/2'],
    ['25122027', '25/12/2027'],
    ['25/12/2027', '25/12/2027'],
    ['2512202799', '25/12/2027'],
  ])('%p → %p', (input, expected) => {
    expect(maskDdMmYyyy(input)).toBe(expected);
  });
});

describe('ddMmYyyyToIso', () => {
  it('converts valid dates', () => {
    expect(ddMmYyyyToIso('25/12/2027')).toBe('2027-12-25');
    expect(ddMmYyyyToIso('29/02/2028')).toBe('2028-02-29'); // leap year
  });

  it.each(['31/02/2027', '29/02/2027', '00/01/2027', '12/13/2027', '1/1/2027', ''])(
    'rejects %p',
    (input) => {
      expect(ddMmYyyyToIso(input)).toBeNull();
    },
  );
});

describe('isoToDdMmYyyy / isPastIsoDate', () => {
  it('round-trips', () => {
    expect(isoToDdMmYyyy('2027-12-25')).toBe('25/12/2027');
    expect(isoToDdMmYyyy(null)).toBe('');
  });

  it('compares against the local date', () => {
    const now = new Date(2026, 10, 10, 9, 0); // 10 Nov 2026 local
    expect(isPastIsoDate('2026-11-09', now)).toBe(true);
    expect(isPastIsoDate('2026-11-10', now)).toBe(false);
  });
});
