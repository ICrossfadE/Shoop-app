"use client";
import { canDeleteExpense } from '@/lib/permissions';
import AnimatedNumber from "./AnimatedNumber";
import { mutateProduct } from "@/lib/mutate-product";
import { useSearchParams } from "next/navigation";
import { currentKyivMonth, isExpenseMonth } from "@/lib/expenses";
import { readTagFilter } from "@/lib/tags";
import { useList, navigateList } from "@/lib/use-list";
import type { ListData, ListFilter } from "@/lib/list-model";
import type { Tag } from "@/lib/tags";
import ExpenseChart from "./ExpenseChart";
import AuthorInfo from "./AuthorInfo";
import TagFilter from "./TagFilter";
import TagBadge from "./TagBadge";

const date = new Intl.DateTimeFormat("uk-UA", {
  timeZone: "Europe/Kyiv",
  dateStyle: "medium",
});

// Month, rows and totals switch as one keyed snapshot, never mixing filters.
export default function ExpenseList({
  membershipVersion,
  userId,
  workspace,
  tags,
  initialFilter,
  initial,
  loadError,
}: {
  membershipVersion?: string;
  userId: string;
  workspace: { workspace_id: string; workspace_name: string };
  tags: Tag[];
  initialFilter: ListFilter;
  initial?: ListData;
  loadError: boolean;
}) {
  const params = useSearchParams();
  const month = isExpenseMonth(params.get("month"))
    ? params.get("month")!
    : currentKyivMonth();
  const selectedTags = readTagFilter(params.getAll("tag"));
  const invalidTags =
    selectedTags === null ||
    selectedTags.some((id) => !tags.some((tag) => tag.id === id));
  const query = useList(
    userId,
    workspace.workspace_id,
    { kind: "expenses", category: "", month, tags: selectedTags ?? [] },
    initialFilter,
    initial,
    membershipVersion,
  );
  const data = invalidTags ? null : query.data?.expenses;
  const error = invalidTags || (!data && (loadError || !!query.error));
  function remove(id: string, name: string) {
    if (window.confirm("Видалити «" + name + "» разом із витратою?"))
      void mutateProduct(
        query.scope,
        workspace.workspace_id,
        id,
        "delete",
        name,
        true,
      );
  }
  const authors = new Map(
    (query.data?.authors ?? []).map((author) => [author.product_id, author]),
  );
  return (
    <div className="flex flex-1 flex-col bg-page text-foreground">
      {/* Shared authenticated navigation. */}
      <main className="app-main space-y-6">
        <h1 className="font-semibold">Витрати</h1>
        <p>{workspace.workspace_name}</p>
        {query.error && (
          <p role="alert">
            {query.error}{" "}
            <button onClick={query.retry}>Спробувати знову</button>
          </p>
        )}
        {data && query.loading && <p role="status">Оновлюємо витрати…</p>}
        {query.pending.length > 0 && (
          <p role="status">Зберігається… Підсумки попередні.</p>
        )}
        {/* Changing the month retains all tag filters, including before hydration. */}
        <form
          className="flex flex-wrap items-end gap-3"
          action="/expenses"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new URLSearchParams(
              new FormData(event.currentTarget) as unknown as Record<
                string,
                string
              >,
            );
            navigateList(`/expenses?${values}`);
          }}
        >
          {(selectedTags ?? []).map((id) => (
            <input key={id} type="hidden" name="tag" value={id} />
          ))}
          {selectedTags === null && (
            <input type="hidden" name="tag" value="invalid" />
          )}
          <div>
            <label htmlFor="expense-month" className="block">
              Місяць і рік
            </label>
            <input
              key={month}
              id="expense-month"
              name="month"
              type="month"
              min="1000-01"
              max="9999-12"
              defaultValue={month}
              required
              className="mt-1 rounded border border-line bg-surface px-3 py-2"
            />
          </div>
          <button className="rounded button-primary px-4 py-2">Показати</button>
        </form>
        <div className="shopping-layout">
          <aside>
            {" "}
            <TagFilter
              tags={tags}
              selected={selectedTags ?? []}
              action="/expenses"
              preserved={{ name: "month", value: month }}
            />
          </aside>
          <div className="shopping-content space-y-6">
            {error || !data ? (
              <section
                role="alert"
                className="rounded bg-danger-surface p-4 text-danger"
              >
                <p>
                  {invalidTags
                    ? "Один із тегів недоступний. Скиньте фільтр."
                    : query.loading
                      ? "Завантажуємо витрати…"
                      : "Не вдалося завантажити витрати."}
                </p>
                <button onClick={query.retry}>Спробувати знову</button>
              </section>
            ) : (
              <>
                {/* Filtered sums use historical Expense amounts, never current Product prices. */}
                <ExpenseChart
                  data={data}
                  filtered={!!selectedTags?.length}
                  month={month}
                />
                {/* Current product tags are shown alongside immutable completion snapshots. */}
                <section aria-labelledby="expense-history">
                  <h2
                    id="expense-history"
                    className="mb-3 text-lg font-semibold"
                  >
                    Покупки
                  </h2>
                  <ul className="product-rows">
                    {data.items.map((expense) => (
                      <li key={expense.id} className="product-row expense-row">
                        <div className="min-w-0 space-y-2">
                          <h3 className="break-words font-semibold">
                            {expense.name}
                          </h3>
                          <p>
                            {expense.category_name} ·{" "}
                            {date.format(new Date(expense.occurred_at))}
                          </p>
                          <ul
                            aria-label="Теги покупки"
                            className="flex flex-wrap gap-2"
                          >
                            {(expense.tags ?? []).map((tag) => (
                              <li key={tag.id}>
                                <TagBadge tag={tag} />
                              </li>
                            ))}
                          </ul>
                          <AuthorInfo
                            author={expense.author ?? authors.get(expense.product_id)}
                          />
                        </div>
                        <div className="product-end space-y-2 flex flex-col items-end justify-between gap-2">
                          <p className="product-price">
                            <AnimatedNumber value={expense.amount} />{" "}
                            <small className="text-muted">UAH</small>
                          </p>
                          {canDeleteExpense(userId, expense) && <button
                            className="rounded border border-danger px-3 py-2 text-danger "
                            onClick={() =>
                              remove(expense.product_id, expense.name)
                            }
                          >
                            Видалити
                          </button>}
                          {expense.archived && <p className="text-sm text-muted">Архівна покупка</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
