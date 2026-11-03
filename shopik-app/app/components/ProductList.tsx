"use client";
import { IconChevronDown } from "@tabler/icons-react";
import { useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useList, listCache, navigateList } from "@/lib/use-list";
import { readTagFilter, type Tag, type TaggedProduct } from "@/lib/tags";
import type { Account, ProductAuthor } from "@/lib/identity";
import type { Category } from "@/lib/categories";
import type { ListFilter } from "@/lib/list-model";
import { productTotal, formatMoney } from "@/lib/money";
import { mutateProduct } from "@/lib/mutate-product";
import OrderCard from "./OrderCard";
import AnimatedNumber from "./AnimatedNumber";
import DeleteProductDialog from "./DeleteProductDialog";
import TagFilter from "./TagFilter";
import WorkspaceAvatars from "./WorkspaceAvatars";

type Props = {
  membershipVersion?: string;
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
type Query = ReturnType<typeof useList>;

// Expansion is local to this visit; the create button is separate from the toggle.
function CategorySection({
  category,
  products,
  children,
  ready,
}: {
  category: Category;
  products: TaggedProduct[];
  children: React.ReactNode;
  ready: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const total =
    products.reduce(
      (sum, product) => sum + Math.round(productTotal(product) * 100),
      0,
    ) / 100;
  return (
    <section className="category-accordion" data-category={category.id}>
      <div className="flex items-center gap-2 pe-4">
        <button
          className="category-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          <IconChevronDown size={20} className="accordion-chevron" aria-hidden="true" />
          <span className="category-name">{category.name}</span>
          <span className="category-sum">
            {ready ? <AnimatedNumber value={total} /> : "…"}
          </span>
        </button>
        <button
          // className="icon-action category-add"
          className="font-bold"
          aria-label={"Додати товар у категорію " + category.name}
          onClick={(event) =>
            window.dispatchEvent(
              new CustomEvent("shopik-create-in-category", {
                detail: { category: category.id, trigger: event.currentTarget },
              }),
            )
          }
        >
          +
        </button>
      </div>
      <div id={panelId} hidden={!open} className="category-panel">
        {children}
      </div>
    </section>
  );
}

// Selection is reset by the keyed parent whenever the tag filter changes.
function ShoppingGroups({
  props,
  query,
  products,
  filterKey,
}: {
  props: Props;
  query: Query;
  products: TaggedProduct[];
  filterKey: string;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<{ filter: string; ids: string[] }>(
    { filter: filterKey, ids: [] },
  );
  // Adjust selection on a new filter without remounting the category accordions.
  if (selection.filter !== filterKey)
    setSelection({ filter: filterKey, ids: [] });
  const selected = selection.filter === filterKey ? selection.ids : [];
  const setSelected = (update: string[] | ((previous: string[]) => string[])) =>
    setSelection((previous) => ({
      filter: filterKey,
      ids:
        typeof update === "function"
          ? update(previous.filter === filterKey ? previous.ids : [])
          : update,
    }));
  const [removing, setRemoving] = useState<TaggedProduct | null>(null);
  const authors = new Map(
    (query.data?.authors ?? []).map((author) => [author.product_id, author]),
  );
  const chosen = products.filter((product) => selected.includes(product.id));
  const pending = (id: string) =>
    query.pending.some((operation) => operation.id === id);
  function complete(items: TaggedProduct[], trigger?: HTMLElement) {
    listCache.openCompletion({
      key: crypto.randomUUID(),
      scope: query.scope,
      workspaceId: props.workspaceId,
      products: items,
      trigger,
    });
  }
  return (
    <>
      {/* Explicit selection supports purchases in independently expanded categories. */}
      <div className="selection-toolbar">
        <button
          onClick={() => {
            setSelecting(!selecting);
            setSelected([]);
          }}
        >
          {selecting ? "Скасувати вибір" : "Вибрати товари"}
        </button>
        {selecting && (
          <button
            onClick={() =>
              setSelected(
                products
                  .filter((product) => !pending(product.id))
                  .map((product) => product.id),
              )
            }
          >
            Вибрати всі
          </button>
        )}
        {selecting && (
          <span>
            Вибрано: {chosen.length} ·{" "}
            {formatMoney(
              chosen.reduce(
                (sum, product) => sum + Math.round(productTotal(product) * 100),
                0,
              ) / 100,
            )}
          </span>
        )}
        {selecting && (
          <button
            className="button-primary px-3 py-2"
            disabled={
              !chosen.length ||
              chosen.length > 500 ||
              chosen.some((product) => pending(product.id))
            }
            onClick={(event) => complete(chosen, event.currentTarget)}
          >
            Перемістити у витрати
          </button>
        )}
        {chosen.length > 500 && (
          <p role="alert">Оберіть не більше 500 покупок за один раз.</p>
        )}
      </div>
      <section aria-label="Категорії продуктів" className="category-list">
        {!props.categories.length && (
          <p className="category-empty">
            Створіть категорію через «+», щоб додати продукт.
          </p>
        )}
        {props.categories.map((category) => {
          const rows = products.filter(
            (product) => product.category_id === category.id,
          );
          return (
            <CategorySection
              key={category.id}
              category={category}
              products={rows}
              ready={!!query.data}
            >
              {!rows.length && (
                <p className="category-empty text-muted">
                  {query.loading && !query.data
                    ? "Завантажуємо покупки…"
                    : "Покупок за поточними фільтрами немає."}
                </p>
              )}
              <div className="product-cards">
                {rows.map((product) => (
                  <div
                    key={product.id}
                    className={selecting ? "selectable-product" : ""}
                  >
                    {selecting && (
                      <label className="product-select">
                        <input
                          type="checkbox"
                          aria-label={"Вибрати " + product.name}
                          checked={selected.includes(product.id)}
                          disabled={pending(product.id)}
                          onChange={(event) =>
                            setSelected((previous) =>
                              event.target.checked
                                ? [...previous, product.id]
                                : previous.filter((id) => id !== product.id),
                            )
                          }
                        />
                      </label>
                    )}
                    <OrderCard
                      product={product}
                      author={authors.get(product.id)}
                      canManage
                      pending={pending(product.id)}
                      onEdit={(trigger) =>
                        listCache.openDraft({
                          key: crypto.randomUUID(),
                          trigger,
                          scope: query.scope,
                          userId: props.userId,
                          workspaceId: props.workspaceId,
                          product,
                          categories: props.categories,
                          tags: props.tags,
                          selectedCategory: category.id,
                        })
                      }
                      onStatus={() =>
                        complete(
                          [product],
                          document.activeElement as HTMLElement,
                        )
                      }
                      onDelete={() => setRemoving(product)}
                    />
                  </div>
                ))}
              </div>
            </CategorySection>
          );
        })}
      </section>
      {removing && (
        <DeleteProductDialog
          product={removing}
          pending={false}
          error=""
          onClose={() => setRemoving(null)}
          onDelete={() => {
            setRemoving(null);
            void mutateProduct(
              query.scope,
              props.workspaceId,
              removing.id,
              "delete",
              removing.name,
            );
          }}
          onExpense={() => {
            setRemoving(null);
            complete([removing]);
          }}
        />
      )}
    </>
  );
}

// A single snapshot supplies every category and the footer, including collapsed lists.
export default function ProductList(props: Props) {
  const params = useSearchParams();
  const selectedTags = readTagFilter(params.getAll("tag"));
  const invalidTags =
    !selectedTags ||
    selectedTags.some((id) => !props.tags.some((tag) => tag.id === id));
  const initialFilter: ListFilter = {
    kind: "products",
    category: props.selectedCategory,
    tags: props.selectedTags,
    month: "",
  };
  const query = useList(
    props.userId,
    props.workspaceId,
    { kind: "products", category: "", tags: selectedTags ?? [], month: "" },
    initialFilter,
    props.hasInitial && !props.loadError
      ? { products: props.products, authors: props.authors, expenses: null }
      : undefined,
    props.membershipVersion,
  );
  const products = invalidTags ? [] : (query.data?.products ?? []);
  const hasSelection = params.get("sumScope") === props.workspaceId;
  const included = hasSelection
    ? params
        .getAll("sumCategory")
        .filter((id) => props.categories.some((category) => category.id === id))
    : props.categories.map((category) => category.id);
  const total =
    products
      .filter((product) => included.includes(product.category_id))
      .reduce(
        (sum, product) => sum + Math.round(productTotal(product) * 100),
        0,
      ) / 100;
  function selectCategories(ids: string[]) {
    const next = new URLSearchParams(params.toString());
    next.set("sumScope", props.workspaceId);
    next.delete("sumCategory");
    ids.forEach((id) => next.append("sumCategory", id));
    navigateList("/?" + next);
  }
  return (
    <main className="app-main mobile-main shopping-home">
      {/* Workspace identity and active filters remain available without opening categories. */}
      <section className="list-heading">
        <h1>Список продуктів</h1>
        <WorkspaceAvatars
          workspaceId={props.workspaceId}
          userId={props.userId}
          account={props.account}
        />
      </section>
      <TagFilter
        tags={props.tags}
        selected={selectedTags ?? []}
        action="/"
        preserved={{ name: "category", value: "" }}
        categoryCount={included.length}
      >
        <fieldset className="sum-categories">
          <legend>Категорії для загальної суми</legend>
          <button
            onClick={() =>
              selectCategories(props.categories.map((category) => category.id))
            }
          >
            Усі категорії
          </button>
          <button onClick={() => selectCategories([])}>
            Очистити категорії
          </button>
          {props.categories.map((category) => (
            <label key={category.id}>
              <input
                type="checkbox"
                checked={included.includes(category.id)}
                onChange={(event) =>
                  selectCategories(
                    event.target.checked
                      ? [...included, category.id]
                      : included.filter((id) => id !== category.id),
                  )
                }
              />
              {category.name}
            </label>
          ))}
        </fieldset>
      </TagFilter>
      {(props.loadError || query.error) && (
        <p role="alert">
          {props.loadError || query.error}{" "}
          <button onClick={query.retry}>Спробувати знову</button>
        </p>
      )}
      {invalidTags && (
        <p role="alert">Один із тегів недоступний. Скиньте фільтр.</p>
      )}
      {!props.loadError && !invalidTags && (
        <ShoppingGroups
          key={query.scope}
          filterKey={(selectedTags ?? []).join(",")}
          props={props}
          query={query}
          products={products}
        />
      )}
      {/* The footer never mistakes a partially loaded category set for the full total. */}
      <div className="shopping-total" role="status">
        <span>
          {hasSelection ? "Разом · категорій: " + included.length : "Разом"}
        </span>
        <strong>
          {invalidTags || props.loadError || query.error ? (
            "Недоступно"
          ) : !query.data ? (
            "Завантажуємо…"
          ) : (
            <AnimatedNumber value={total} />
          )}
        </strong>
        {query.pending.length > 0 && <small>Зберігається…</small>}
      </div>
    </main>
  );
}
