const number = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Node and browsers ship different CLDR currency labels (₴ / грн). Keep the
// currency symbol explicit so server HTML and hydrated React text agree.
export function formatMoney(amount: number) {
  return `${number.format(amount).replace(/\s/g, '\u00a0')}\u00a0₴`;
}
