"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useList, listCache, navigateList } from "@/lib/use-list";
import { readTagFilter } from "@/lib/tags";
import { isWorkspaceId } from "@/lib/products";

import type { Account, ProductAuthor } from "@/lib/identity";
import OrderCard from "./OrderCard";
import AnimatedNumber from "./AnimatedNumber";
import ScreenLink from "./ScreenLink";
import DeleteProductDialog from "./DeleteProductDialog";
import { mutateProduct } from "@/lib/mutate-product";
import type { Tag, TaggedProduct } from "@/lib/tags";
import TagFilter from "./TagFilter";
import type { Category } from "@/lib/categories";

type Props = {
  hasInitial?: boolean;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: string;
  account: Account;
  authors: ProductAuthor[];
  products: TaggedProduct[];
  loadError: string | null;
  categories: Category[];
  selectedCategory: string;
  tags: Tag[];
  selectedTags: string[];
};

// Server-filtered props are the source of truth; selection is reflected in the URL.
export default function ProductList({
  hasInitial = true,
  userId,
  workspaceId,
  workspaceName,
  email,
  role,
  products: initialProducts,
  loadError: initialError,
  categories,
  selectedCategory: initialCategory,
  tags,
  selectedTags: initialTags,
  authors: initialAuthors,
}: Props) {
  const params = useSearchParams();
  const requested = params.get("category");
  const selectedCategory =
    isWorkspaceId(requested) &&
    categories.some((category) => category.id === requested)
      ? requested
      : (categories[0]?.id ?? "");
  const parsedTags = readTagFilter(params.getAll("tag"));
  const selectedTags = parsedTags ?? [];
  const invalidTags =
    !parsedTags ||
    selectedTags.some((id) => !tags.some((tag) => tag.id === id));
  const filter = {
    kind: "products" as const,
    category: selectedCategory,
    tags: selectedTags,
    month: "",
  };
  const query = useList(
    userId,
    workspaceId,
    filter,
    {
      kind: "products",
      category: initialCategory,
      tags: initialTags,
      month: "",
    },
    !hasInitial || initialError
      ? undefined
      : { products: initialProducts, authors: initialAuthors, expenses: null },
  );
  // A separate unfiltered snapshot keeps totals independent of tag selection.
  const categoryQuery = useList(
    userId,
    workspaceId,
    { ...filter, tags: [] },
    {
      kind: "products",
      category: initialCategory,
      tags: initialTags,
      month: "",
    },
    !hasInitial || initialError
      ? undefined
      : { products: initialProducts, authors: initialAuthors, expenses: null },
  );
  const categoryTotal = categoryQuery.data?.products.reduce(
    (sum, product) => sum + Math.round(product.price * 100),
    0,
  );
  const products = invalidTags ? [] : (query.data?.products ?? []);
  const authors = query.data?.authors ?? [];
  const loadError = invalidTags
    ? "Один із тегів недоступний. Скиньте фільтр."
    : (!query.data && (query.error || initialError)) || null;
  const categoryNav = useRef<HTMLElement>(null);
  const authorMap = new Map(
    authors.map((author) => [author.product_id, author]),
  );
  // Keep the active category visible inside its horizontal scroll container.
  useEffect(() => {
    categoryNav.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedCategory]);
  const setEditor = (value: { product: TaggedProduct | null }) =>
    listCache.openDraft({
      ...value,
      key: crypto.randomUUID(),
      trigger: editorTrigger.current ?? newButton.current ?? undefined,
      scope: query.scope,
      userId,
      workspaceId,
      categories,
      tags,
      selectedCategory,
    });
  const [removing, setRemoving] = useState<TaggedProduct | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const newButton = useRef<HTMLButtonElement>(null);
  const editorTrigger = useRef<HTMLElement | null>(null);

  // Explicit modes distinguish completion and permanent deletion.
  function mutate(product: TaggedProduct, mode: "delete" | "complete") {
    setError("");
    setNotice("");
    setRemoving(null);
    startTransition(async () => {
      const result = await mutateProduct(
        query.scope,
        workspaceId,
        product.id,
        mode,
        product.name,
      );
      if (result?.ok)
        setNotice(
          mode === "delete"
            ? "Продукт видалено."
            : "Статус і витрати оновлено.",
        );
    });
  }

  return (
    <div className="flex flex-1 flex-col bg-page text-foreground">
      {/* Workspace navigation and session controls. */}
      <main className="app-main flex-1 space-y-5">
        {/* Categories are persisted independently of the selected product list. */}
        <section className="space-y-3" aria-labelledby="workspace-heading">
          <h1 className="font-semibold">Список покупок</h1>
          <h2 id="workspace-heading" className="text-xl font-semibold">
            {workspaceName}
          </h2>
          <p className="break-all text-sm text-muted">
            {email} · {role === "owner" ? "Власник" : "Учасник"}
          </p>
        </section>
        <div className="shopping-layout">
          <aside className="space-y-4">
            {/* Missing data is never represented as a zero sum. */}
            <section className="category-total" aria-label="Сума категорії">
              <p className="text-sm text-muted">Загальна сума категорії</p>
              <strong>
                {categoryTotal !== undefined ? (
                  <>
                    <AnimatedNumber value={categoryTotal / 100} />{" "}
                    <small>UAH</small>
                  </>
                ) : categoryQuery.error ? (
                  "Недоступно"
                ) : (
                  "Завантаження…"
                )}
              </strong>
            </section>
            <TagFilter
              tags={tags}
              selected={selectedTags}
              action="/"
              preserved={{ name: "category", value: selectedCategory }}
            />
          </aside>
          <div className="shopping-content">
            {" "}
            <nav
              ref={categoryNav}
              aria-label="Категорії продуктів"
              className="categories flex w-full min-w-0 gap-2 overflow-x-auto py-2"
            >
              {categories.map((category) => (
                <button
                  key={category.id}
                  title={category.name}
                  aria-pressed={selectedCategory === category.id}
                  onClick={() => {
                    setError("");
                    const params = new URLSearchParams({
                      category: category.id,
                    });
                    selectedTags.forEach((id) => params.append("tag", id));
                    navigateList(`/?${params}`);
                  }}
                  className={`max-w-[85%] shrink-0 whitespace-nowrap overflow-hidden text-ellipsis border px-3 py-2 ${selectedCategory === category.id ? "button-primary" : "bg-surface"}`}
                >
                  {category.name}
                </button>
              ))}
            </nav>
            {/* Distinguish loading failures, zero categories and an empty category. */}
            {query.error && query.data && (
              <p role="alert">
                {query.error}{" "}
                <button onClick={query.retry}>Спробувати знову</button>
              </p>
            )}
            {(loadError || error) && (
              <p
                role="alert"
                className="rounded bg-danger-surface p-4 text-danger"
              >
                {loadError || error}
              </p>
            )}
            {loadError && (
              <button
                disabled={pending}
                onClick={query.retry}
                className="rounded border px-3 py-2"
              >
                Спробувати знову
              </button>
            )}
            <p role="status" className="text-sm text-muted">
              {query.pending.length
                ? "Зберігається…"
                : query.loading
                  ? "Оновлюємо дані…"
                  : notice}
            </p>
            {!loadError && categories.length === 0 && (
              <p className="rounded border border-dashed p-6">
                Спочатку створіть категорію, щоб додати продукт.{" "}
                <ScreenLink
                  href="/settings#categories"
                  className="text-link underline"
                >
                  Створити категорію
                </ScreenLink>
              </p>
            )}
            <section
              aria-label="Список покупок"
              aria-busy={query.loading}
              className="relative min-w-0 space-y-4"
            >
              {/* Sticky action stays inside the product section, above its cards. */}
              <div className="sticky top-0 z-20 bg-page py-3">
                <button
                  ref={newButton}
                  disabled={!!loadError || categories.length === 0}
                  onClick={(event) => {
                    editorTrigger.current = event.currentTarget;
                    setNotice("");
                    setEditor({ product: null });
                  }}
                  className="w-full rounded button-primary px-4 py-3 font-medium disabled:opacity-50"
                >
                  Додати продукт
                </button>
              </div>
              {!loadError &&
                categories.length > 0 &&
                products.length === 0 &&
                !query.loading && (
                  <section className="rounded-lg border border-dashed border-line p-8 text-center">
                    <h3 className="font-semibold">
                      {selectedTags.length
                        ? "Продуктів із вибраними тегами немає"
                        : "У цій категорії поки немає продуктів"}
                    </h3>
                    <p className="mt-2 text-muted">Додайте перший продукт.</p>
                  </section>
                )}
              <div className="product-rows">
                {!loadError &&
                  products.map((product) => (
                    <OrderCard
                      key={product.id}
                      product={product}
                      author={authorMap.get(product.id)}
                      pending={query.pending.some(
                        (operation) => operation.id === product.id,
                      )}
                      onEdit={(trigger) => {
                        editorTrigger.current = trigger;
                        setNotice("");
                        setEditor({ product });
                      }}
                      onStatus={() => mutate(product, "complete")}
                      onDelete={() => {
                        setError("");
                        setRemoving(product);
                      }}
                    />
                  ))}
              </div>
            </section>
          </div>
        </div>
      </main>
      {/* Separate dialogs for editing and the explicit expense/delete choice. */}
      {removing && (
        <DeleteProductDialog
          product={removing}
          pending={false}
          error={error}
          onClose={() => setRemoving(null)}
          onDelete={() => mutate(removing, "delete")}
          onExpense={() => mutate(removing, "complete")}
        />
      )}
    </div>
  );
}
