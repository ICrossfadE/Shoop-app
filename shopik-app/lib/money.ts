const number = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Validate decimal text as integer kopecks, accepting the local comma separator.
export function parsePrice(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(',', '.');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return (Number(whole) * 100 + Number(fraction.padEnd(2, '0'))) / 100;
}

// Node and browsers ship different CLDR currency labels (₴ / грн). Keep the
// currency symbol explicit so server HTML and hydrated React text agree.
export function formatMoney(amount: number) {
  return `${number.format(amount).replace(/\s/g, '\u00a0')}\u00a0₴`;
}

// Multiply integer kopecks; old snapshots without quantity represent one unit.
export function productTotal(product: { price: number; quantity?: number }): number {
  return Math.round(product.price * 100) * (product.quantity ?? 1) / 100;
}

// Unknown historical plans are excluded, never treated as a zero budget.
export function savings(items: { amount: number; planned_amount?: number | null }[]) {
  const known = items.filter(item => item.planned_amount != null);
  const kopecks = known.reduce((sum, item) => sum + Math.round(item.planned_amount! * 100) - Math.round(item.amount * 100), 0);
  return { amount: kopecks / 100, compared: known.length, total: items.length };
}
