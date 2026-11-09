import { toPesewas, formatPesewasToGHS } from '../src/types/money';

describe('Rider App Money & Pesewas Utilities', () => {
  it('correctly accepts non-negative integer pesewas', () => {
    const pesewas = toPesewas(5000);
    expect(pesewas).toBe(5000);
  });

  it('rejects floating point amounts to prevent fractional currency corruption', () => {
    expect(() => toPesewas(50.5)).toThrow(TypeError);
    expect(() => toPesewas(0.01)).toThrow(TypeError);
  });

  it('rejects negative pesewas', () => {
    expect(() => toPesewas(-100)).toThrow(RangeError);
  });

  it('formats pesewas into standard Ghanaian Cedi currency string', () => {
    const weeklyRate = toPesewas(5000); // GH₵ 50.00
    expect(formatPesewasToGHS(weeklyRate)).toBe('GH₵ 50.00');

    const singleCedi = toPesewas(100);
    expect(formatPesewasToGHS(singleCedi)).toBe('GH₵ 1.00');

    const zeroCedi = toPesewas(0);
    expect(formatPesewasToGHS(zeroCedi)).toBe('GH₵ 0.00');
  });
});
