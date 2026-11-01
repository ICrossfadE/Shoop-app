"use client";
import { useEffect, useOptimistic, useRef, useTransition } from "react";
import { navigateList } from "@/lib/use-list";
import TagBadge from "./TagBadge";
import type { Tag } from "@/lib/tags";

// Exact optimistic sets plus a ref keep rapid clicks from losing earlier choices.
export default function TagFilter({
  tags,
  selected,
  action,
  preserved,
}: {
  tags: Tag[];
  selected: string[];
  action: "/" | "/expenses";
  preserved: { name: string; value: string };
}) {
  const [pending, startTransition] = useTransition();
  const [visible, showSelection] = useOptimistic(
    selected,
    (_previous: string[], next: string[]) => next,
  );
  const latest = useRef(selected);
  // Back/forward and server navigation become the source of truth once settled.
  useEffect(() => {
    if (!pending) latest.current = selected;
  }, [selected, pending]);

  function apply(next: string[]) {
    latest.current = next;
    const params = new URLSearchParams({ [preserved.name]: preserved.value });
    next.forEach((id) => params.append("tag", id));
    startTransition(() => {
      showSelection(next);
      navigateList(`${action}?${params}`);
    });
  }
  function toggle(id: string) {
    apply(
      latest.current.includes(id)
        ? latest.current.filter((value) => value !== id)
        : [...latest.current, id].sort(),
    );
  }
  // One tag is always in exactly one block; buttons support keyboard activation.
  function tagButton(tag: Tag, chosen: boolean) {
    return (
      <button
        key={tag.id}
        type="button"
        aria-label={`${chosen ? "Прибрати" : "Додати"} тег ${tag.name}`}
        onClick={() => toggle(tag.id)}
        aria-pressed={chosen}
        className="shrink-0"
      >
        <TagBadge tag={tag} />
      </button>
    );
  }
  return (
    <section aria-label="Фільтр тегів" className="compact-filter">
      {/* One horizontal row keeps chosen and available tags in stable order. */}
      <div className="filter-caption"><span>Теги · усі вибрані</span>
        <button type="button" onClick={() => apply([])} className="text-link">Скинути</button>
        <span role="status" className="sr-only">{pending ? 'Оновлюємо результати…' : ''}</span>
      </div>
      <div className="tag-scroll">{tags.map(tag => tagButton(tag, visible.includes(tag.id)))}
        {!tags.length && <span className="text-sm text-muted">Тегів ще немає</span>}
      </div>
    </section>
  );
}
