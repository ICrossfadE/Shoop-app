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
