'use client';
import { useEffect, useOptimistic, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import TagBadge from './TagBadge';
import type { Tag } from '@/lib/tags';

// Exact optimistic sets plus a ref keep rapid clicks from losing earlier choices.
export default function TagFilter({ tags, selected, action, preserved }: {
  tags: Tag[]; selected: string[]; action: '/' | '/expenses'; preserved: { name: string; value: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [visible, showSelection] = useOptimistic(selected, (_previous: string[], next: string[]) => next);
  const latest = useRef(selected);
  // Back/forward and server navigation become the source of truth once settled.
  useEffect(() => { if (!pending) latest.current = selected; }, [selected, pending]);

  function apply(next: string[]) {
    latest.current = next;
    const params = new URLSearchParams({ [preserved.name]: preserved.value });
    next.forEach((id) => params.append('tag', id));
    startTransition(() => { showSelection(next); router.push(`${action}?${params}`, { scroll: false }); });
  }
  function toggle(id: string) {
    apply(latest.current.includes(id) ? latest.current.filter((value) => value !== id) : [...latest.current, id].sort());
  }
  // One tag is always in exactly one block; buttons support keyboard activation.
  function tagButton(tag: Tag, chosen: boolean) {
    return <button key={tag.id} type="button" aria-pressed={chosen} aria-label={`${chosen ? 'Прибрати' : 'Додати'} тег ${tag.name}`} onClick={() => toggle(tag.id)} className="max-w-full rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-600"><TagBadge tag={tag} /></button>;
  }
  const chosen = tags.filter((tag) => visible.includes(tag.id));
  const available = tags.filter((tag) => !visible.includes(tag.id));
  return <section aria-label="Фільтр тегів" className="space-y-4 rounded border border-zinc-300 bg-white p-4">
    <p className="text-sm text-zinc-600">Усі вибрані теги · фільтр застосовується одразу</p>
    {/* Selected pills return to suggestions when clicked. */}
    <div><h3 className="mb-2 font-medium">Вибрані теги</h3><div className="flex flex-wrap gap-2">{chosen.map((tag) => tagButton(tag, true))}</div>{chosen.length === 0 && <p className="text-sm text-zinc-600">Фільтр тегів не застосований.</p>}</div>
    <div><h3 className="mb-2 font-medium">Доступні теги</h3><div className="flex flex-wrap gap-2">{available.map((tag) => tagButton(tag, false))}</div>{available.length === 0 && <p className="text-sm text-zinc-600">{tags.length ? 'Усі теги вибрані.' : 'Створіть теги на сторінці «Теги».'}</p>}</div>
    <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => apply([])} className="text-blue-700 underline">Скинути фільтр</button><p role="status" className="text-sm text-zinc-600">{pending ? 'Оновлюємо результати…' : ''}</p></div>
  </section>;
}
