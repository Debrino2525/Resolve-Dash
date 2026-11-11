import { formatGhanaLocal, toGhanaE164 } from '../src/utils/phone';

describe('toGhanaE164', () => {
  it.each([
    ['241234567', '+233241234567'],
    ['0241234567', '+233241234567'],
    ['024 123 4567', '+233241234567'],
    ['+233241234567', '+233241234567'],
    ['233551234567', '+233551234567'],
    ['0201234567', '+233201234567'],
  ])('normalises %p to %p', (input, expected) => {
    expect(toGhanaE164(input)).toBe(expected);
  });

  it.each(['', '12345', '0341234567', '+447700900123', '02412345678', 'abc'])(
    'rejects %p',
    (input) => {
      expect(toGhanaE164(input)).toBeNull();
    },
  );
});

describe('formatGhanaLocal', () => {
  it('formats E.164 Ghana numbers for display', () => {
    expect(formatGhanaLocal('+233241234567')).toBe('024 123 4567');
  });

  it('leaves anything else untouched', () => {
    expect(formatGhanaLocal('+447700900123')).toBe('+447700900123');
  });
});
