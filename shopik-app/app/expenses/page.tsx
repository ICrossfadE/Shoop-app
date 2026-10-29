import Link from 'next/link';
import { requireWorkspace } from '@/lib/workspace';
import { currentKyivMonth, isExpenseMonth } from '@/lib/expenses';
import SignOutButton from '../components/SignOutButton';

export const dynamic = 'force-dynamic';
const money = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' });
const date = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', dateStyle: 'medium' });

// Database aggregates exact amounts and filters by Kyiv calendar month under RLS.
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { supabase, workspace } = await requireWorkspace();
  const requested = (await searchParams).month;
  const month = isExpenseMonth(requested) ? requested : currentKyivMonth();
  const { data, error } = await supabase.rpc('expense_month', { p_workspace_id: workspace.workspace_id, p_month: `${month}-01` });
  return <div className="flex flex-1 flex-col bg-zinc-50 text-zinc-900">
    {/* Shared navigation keeps expenses independent of category names. */}
    <header className="bg-zinc-900 text-white"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-4">
      <Link href="/" className="text-2xl font-bold">Shopik</Link>
      <nav aria-label="Основна навігація" className="flex gap-4"><Link href="/">Продукти</Link><Link href="/expenses" aria-current="page">Витрати</Link></nav>
      <SignOutButton />
    </div></header>
    <main className="mx-auto w-full max-w-3xl space-y-6 px-5 py-6">
      <h1 className="text-2xl font-semibold">Витрати</h1>
      <p>{workspace.workspace_name} · Часовий пояс: Київ</p>
      {/* GET form allows month selection even before client hydration. */}
      <form className="flex flex-wrap items-end gap-3" action="/expenses">
        <div><label htmlFor="expense-month" className="block">Місяць і рік</label><input key={month} id="expense-month" name="month" type="month" min="1000-01" max="9999-12" defaultValue={month} required className="mt-1 rounded border border-zinc-400 bg-white px-3 py-2" /></div>
        <button className="rounded bg-blue-600 px-4 py-2 text-white">Показати</button>
      </form>
      {error || !data ? <section role="alert" className="rounded bg-red-50 p-4 text-red-800"><p>Не вдалося завантажити витрати.</p><Link href={`/expenses?month=${month}`} className="underline">Спробувати знову</Link></section> : <>
        {/* Exact monthly total and category snapshot breakdown. */}
        <section aria-label="Підсумок місяця" className="rounded-lg bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Загальна сума за {month}</h2><p className="mt-2 text-2xl font-bold">{money.format(data.total)}</p></section>
        <section aria-labelledby="expense-categories"><h2 id="expense-categories" className="mb-3 text-lg font-semibold">За категоріями</h2>
          {data.categories.length === 0 ? <p>Цього місяця витрат немає.</p> : <ul className="space-y-2">{data.categories.map((category) => <li key={`${category.category_id}:${category.category_name}`} className="flex flex-wrap justify-between gap-3 rounded bg-white p-3"><span className="break-words">{category.category_name} · {category.count} покупок</span><strong>{money.format(category.total)}</strong></li>)}</ul>}
        </section>
        {/* Expense snapshots preserve price/category at completion; delete/reactivate via products. */}
        <section aria-labelledby="expense-history"><h2 id="expense-history" className="mb-3 text-lg font-semibold">Покупки</h2><ul className="space-y-3">{data.items.map((expense) => <li key={expense.id} className="space-y-2 rounded bg-white p-4"><h3 className="break-words font-semibold">{expense.name}</h3><p>{expense.category_name} · {date.format(new Date(expense.occurred_at))}</p><p>{money.format(expense.amount)}</p><Link className="text-blue-700 underline" href="/">До списку продуктів</Link></li>)}</ul></section>
      </>}
    </main>
  </div>;
}
