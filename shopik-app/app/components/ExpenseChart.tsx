'use client';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { ExpenseMonth } from '@/lib/expenses';
import { expenseCategoryColor } from '@/lib/expense-chart';

const money = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' });
// Donut-with-text pattern inspired by shadcn.io; one server snapshot supplies all values.
export default function ExpenseChart({ data, filtered, month }: { data: ExpenseMonth; filtered: boolean; month: string }) {
  const positive = data.categories.filter((category) => category.total > 0);
  const label = filtered ? 'Відфільтрована сума' : 'Загальна сума';
  return <section className="expense-summary" aria-label={`Підсумок місяця ${month}`}>
    <div className="donut">
      <div className="h-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 300, height: 280 }}>
          <PieChart><Pie data={positive.length ? positive : [{ total: 1 }]} dataKey="total" innerRadius="72%" outerRadius="95%" stroke="var(--surface)" strokeWidth={3} isAnimationActive={false}>
            {positive.length ? positive.map((category) => <Cell key={`${category.category_id}:${category.category_name}`} fill={expenseCategoryColor(category.category_id, category.category_name)} />) : <Cell fill="var(--soft)" />}
          </Pie></PieChart>
        </ResponsiveContainer>
      </div>
      <div className="donut-center"><span className="text-xs text-muted">{label}</span><strong className="text-xl">{money.format(data.total)}</strong><span className="text-xs text-muted">UAH · {month}</span></div>
    </div>
    {/* Text remains accessible without hovering, including zero-value categories. */}
    <div><h2 className="mb-4 text-lg font-semibold">За категоріями</h2>{!data.categories.length && <p className="text-muted">Цього місяця витрат{filtered ? ' із вибраними тегами' : ''} немає.</p>}
      <ul className="space-y-4">{data.categories.map((category) => <li key={`${category.category_id}:${category.category_name}`} className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded" style={{ background: expenseCategoryColor(category.category_id, category.category_name) }} />
        <span className="min-w-0 flex-1 break-words">{category.category_name}<small className="block text-muted">{category.count} покупок</small></span><strong className="max-w-[50%] break-words">{money.format(category.total)}</strong>
      </li>)}</ul>
    </div>
  </section>;
}
