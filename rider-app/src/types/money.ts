/**
 * Nominal/Branded type representing money strictly in integer pesewas.
 * 100 pesewas = 1.00 GHS. Floats are prohibited.
 */
export type Pesewas = number & { readonly __brand: unique symbol };

export function toPesewas(value: number): Pesewas {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Pesewas must be an integer, received float or non-integer: ${value}`);
  }
  if (value < 0) {
    throw new RangeError(`Pesewas cannot be negative, received: ${value}`);
  }
  return value as Pesewas;
}

/**
 * Formats integer pesewas into human-readable Ghanaian Cedi display format.
 * E.g., 5000 pesewas -> "GH₵ 50.00"
 */
export function formatPesewasToGHS(amount: Pesewas): string {
  const cediValue = amount / 100;
  return `GH₵ ${cediValue.toFixed(2)}`;
}
