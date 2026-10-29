import Link from 'next/link';
import TagBadge from './TagBadge';
import type { Tag } from '@/lib/tags';

// Standard GET forms preserve category/month and work without client hydration.
export default function TagFilter({ tags, selected, action, preserved }: {
  tags: Tag[]; selected: string[]; action: '/' | '/expenses'; preserved: { name: string; value: string };
}) {
  return <form key={`${preserved.value}:${selected.join(',')}`} action={action} className="space-y-3 rounded border border-zinc-300 bg-white p-4">
    <input type="hidden" name={preserved.name} value={preserved.value} />
    <fieldset><legend className="mb-2 font-medium">Фільтр: усі вибрані теги</legend>
      <div className="flex flex-wrap gap-3">{tags.map((tag) => <label key={tag.id} className="flex min-w-0 items-center gap-2"><input type="checkbox" name="tag" value={tag.id} defaultChecked={selected.includes(tag.id)} /><TagBadge tag={tag} /></label>)}</div>
      {tags.length === 0 && <p className="text-sm text-zinc-600">Тегів ще немає. Створіть їх на сторінці «Теги».</p>}
    </fieldset>
    <div className="flex flex-wrap items-center gap-3"><button className="rounded bg-blue-600 px-3 py-2 text-white">Застосувати</button><Link className="text-blue-700 underline" href={`${action}?${new URLSearchParams({ [preserved.name]: preserved.value })}`}>Скинути фільтр</Link></div>
  </form>;
}
