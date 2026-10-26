// Money is stored in minor units (integer). Never use floats.
export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}
export function fromMinor(minor: number): number {
  return minor / 100;
}
export function formatMoney(minor: number, currency = 'NPR'): string {
  return `${currency} ${(minor / 100).toFixed(2)}`;
}
