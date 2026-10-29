import type { Tag } from './tags';
// Expense snapshots stay immutable until deletion of the completed product.
export type Expense = {
  id: string; workspace_id: string; product_id: string; name: string;
  category_id: string; category_name: string; amount: number; currency: 'UAH'; occurred_at: string;
  tags?: Tag[];
};
export type ExpenseMonth = {
  total: number;
  categories: { category_id: string; category_name: string; total: number; count: number }[];
  items: Expense[];
};

// Use the same timezone as the database aggregation, regardless of server timezone.
export function currentKyivMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`;
}

// Bound input before passing it as a Postgres date parameter.
export function isExpenseMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value);
}
