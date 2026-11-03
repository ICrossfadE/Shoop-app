"use client";
import { useSearchParams } from "next/navigation";
import { navigateList } from "@/lib/use-list";
import TagBadge from "./TagBadge";
import type { Tag } from "@/lib/tags";
import type { ReactNode } from "react";

// Filters wrap inside an accessible accordion; unrelated URL selections survive.
export default function TagFilter({
  tags,
  selected,
  action,
  preserved,
  children,
  categoryCount,
}: {
  tags: Tag[];
  selected: string[];
  action: "/" | "/expenses";
  preserved: { name: string; value: string };
  children?: ReactNode;
  categoryCount?: number;
}) {
  const current = useSearchParams();
  function apply(next: string[]) {
    const params = new URLSearchParams(current.toString());
    params.set(preserved.name, preserved.value);
    params.delete("tag");
    next.forEach((id) => params.append("tag", id));
    navigateList(action + "?" + params);
  }
  return (
    <details className="filter-accordion compact-filter">
      {/* Active selections remain visible when the filter controls are collapsed. */}
      <summary>
        Фільтри · тегів: {selected.length}
        {categoryCount !== undefined
          ? " · категорій для суми: " + categoryCount
          : ""}
      </summary>
      <div className="filter-panel">
        <div className="filter-caption">
          <span>Теги · будь-який вибраний</span>
          <button type="button" onClick={() => apply([])} className="text-link">
            Скинути теги
          </button>
        </div>
        <div className="tag-wrap">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              aria-label={
                (selected.includes(tag.id) ? "Прибрати" : "Додати") +
                " тег " +
                tag.name
              }
              aria-pressed={selected.includes(tag.id)}
              onClick={() => {
                // Read the current URL at click time so rapid taps never lose a selection.
                const latest = new URLSearchParams(
                  window.location.search,
                ).getAll("tag");
                apply(
                  latest.includes(tag.id)
                    ? latest.filter((id) => id !== tag.id)
                    : [...latest, tag.id],
                );
              }}
            >
              <TagBadge tag={tag} />
            </button>
          ))}
          {!tags.length && <span className="text-muted">Тегів ще немає</span>}
        </div>
        {children}
      </div>
    </details>
  );
}
