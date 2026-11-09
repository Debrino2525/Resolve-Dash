/**
 * Nominal/Branded type representing money strictly in integer pesewas.
 * 100 pesewas = 1.00 GHS. Floating-point currency values are strictly prohibited.
 */
export type Pesewas = number & { readonly __brand: unique symbol };

/**
 * Validates and converts an integer number to Pesewas.
 * Throws an explicit error if input is not an integer or is negative.
 */
export function toPesewas(value: number): Pesewas {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Pesewas must be an integer, received float or non-integer: ${value}`);
  }
  if (value < 0) {
    throw new RangeError(`Pesewas cannot be negative, received: ${value}`);
  }
  return value as Pesewas;
}

export const GHS_CURRENCY = 'GHS' as const;
export type CurrencyGHS = typeof GHS_CURRENCY;
