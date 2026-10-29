import Link from 'next/link';
import { requireWorkspace } from '@/lib/workspace';
import { currentKyivMonth, isExpenseMonth } from '@/lib/expenses';
import { readTagFilter } from '@/lib/tags';
import SignOutButton from '../components/SignOutButton';
import TagFilter from '../components/TagFilter';
import TagBadge from '../components/TagBadge';

export const dynamic = 'force-dynamic';
const money = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' });
const date = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', dateStyle: 'medium' });

// A single filtered SQL dataset supplies items, category totals and headline sum.
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; tag?: string | string[] }> }) {
  const { supabase, workspace } = await requireWorkspace();
  const requested = await searchParams;
  const month = isExpenseMonth(requested.month) ? requested.month : currentKyivMonth();
  const selectedTags = readTagFilter(requested.tag);
  const tagResult = await supabase.from('tags').select('*').eq('workspace_id', workspace.workspace_id).order('name').order('id');
  const tags = tagResult.data ?? [];
  const invalidTags = selectedTags === null || selectedTags.some((id) => !tags.some((tag) => tag.id === id));
  const { data, error } = !tagResult.error && !invalidTags
    ? await supabase.rpc('expense_month_tags', { p_workspace_id: workspace.workspace_id, p_month: `${month}-01`, p_tag_ids: selectedTags ?? [] })
    : { data: null, error: true };
  return <div className="flex flex-1 flex-col bg-zinc-50 text-zinc-900">
    {/* Shared authenticated navigation. */}
    <header className="bg-zinc-900 text-white"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-4">
      <Link href="/" className="text-2xl font-bold">Shopik</Link>
      <nav aria-label="Основна навігація" className="flex flex-wrap gap-4"><Link href="/">Продукти</Link><Link href="/expenses" aria-current="page">Витрати</Link><Link href="/tags">Теги</Link></nav>
      <SignOutButton />
    </div></header>
    <main className="mx-auto w-full max-w-3xl space-y-6 px-5 py-6">
      <h1 className="text-2xl font-semibold">Витрати</h1>
      <p>{workspace.workspace_name} · Часовий пояс: Київ</p>
      {/* Changing the month retains all tag filters, including before hydration. */}
      <form className="flex flex-wrap items-end gap-3" action="/expenses">
        {(selectedTags ?? []).map((id) => <input key={id} type="hidden" name="tag" value={id} />)}
        {selectedTags === null && <input type="hidden" name="tag" value="invalid" />}
        <div><label htmlFor="expense-month" className="block">Місяць і рік</label><input key={month} id="expense-month" name="month" type="month" min="1000-01" max="9999-12" defaultValue={month} required className="mt-1 rounded border border-zinc-400 bg-white px-3 py-2" /></div>
        <button className="rounded bg-blue-600 px-4 py-2 text-white">Показати</button>
      </form>
      <TagFilter tags={tags} selected={selectedTags ?? []} action="/expenses" preserved={{ name: 'month', value: month }} />
      {error || !data ? <section role="alert" className="rounded bg-red-50 p-4 text-red-800"><p>{invalidTags ? 'Один із тегів недоступний. Скиньте фільтр і виберіть теги знову.' : 'Не вдалося завантажити витрати. Оновіть сторінку.'}</p></section> : <>
        {/* Filtered sums use historical Expense amounts, never current Product prices. */}
        <section aria-label="Підсумок місяця" className="rounded-lg bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">{selectedTags?.length ? 'Сума за вибраними тегами' : 'Загальна сума'} за {month}</h2><p className="mt-2 text-2xl font-bold">{money.format(data.total)}</p></section>
        <section aria-labelledby="expense-categories"><h2 id="expense-categories" className="mb-3 text-lg font-semibold">За категоріями</h2>
          {data.categories.length === 0 ? <p>{selectedTags?.length ? 'Витрат із вибраними тегами цього місяця немає.' : 'Цього місяця витрат немає.'}</p> : <ul className="space-y-2">{data.categories.map((category) => <li key={`${category.category_id}:${category.category_name}`} className="flex flex-wrap justify-between gap-3 rounded bg-white p-3"><span className="break-words">{category.category_name} · {category.count} покупок</span><strong>{money.format(category.total)}</strong></li>)}</ul>}
        </section>
        {/* Current product tags are shown alongside immutable completion snapshots. */}
        <section aria-labelledby="expense-history"><h2 id="expense-history" className="mb-3 text-lg font-semibold">Покупки</h2><ul className="space-y-3">{data.items.map((expense) => <li key={expense.id} className="space-y-2 rounded bg-white p-4"><h3 className="break-words font-semibold">{expense.name}</h3><p>{expense.category_name} · {date.format(new Date(expense.occurred_at))}</p><p>{money.format(expense.amount)}</p><ul aria-label="Теги покупки" className="flex flex-wrap gap-2">{(expense.tags ?? []).map((tag) => <li key={tag.id}><TagBadge tag={tag} /></li>)}</ul><Link className="text-blue-700 underline" href="/">До списку продуктів</Link></li>)}</ul></section>
      </>}
    </main>
  </div>;
}
