import type { TaggedProduct, Tag } from './tags';
import type { ProductAuthor } from './identity';
import type { Category } from './categories';
import type { ExpenseMonth } from './expenses';

export type ListFilter = { kind: 'products' | 'expenses'; category: string; tags: string[]; month: string };
export type ListData = { products: TaggedProduct[]; authors: ProductAuthor[]; expenses: ExpenseMonth | null };
export type MutationData = { product?: TaggedProduct; author?: ProductAuthor; category?: Category; tag?: Tag; deleted?: string };
export type MutationResult = { ok: true; data: MutationData } | { ok: false; error: string; ambiguous?: boolean; accessLost?: boolean; fields?: import('./products').ProductErrors };
export type ProductDraft = { trigger?: HTMLElement; key: string; scope: string; userId: string; workspaceId: string; product: TaggedProduct | null; categories: Category[]; tags: Tag[]; selectedCategory: string };
export type FailedMutation = { operationId: string; scope: string; workspaceId: string; id: string; mode: 'delete' | 'complete'; name: string; expense: boolean; error: string; ambiguous: boolean };

// Stable order prevents duplicate cache entries for equivalent tag selections.
export function listKey(scope: string, filter: ListFilter) {
  return JSON.stringify([scope, filter.kind, filter.kind === 'products' ? filter.category : filter.month, [...new Set(filter.tags)].sort()]);
}
export function matches(product: TaggedProduct, filter: ListFilter) {
  return product.status === 'active' && product.category_id === filter.category && filter.tags.every((id) => product.tags.some((tag) => tag.id === id));
}

// Derive both optimistic totals and rows from the same snapshot, using kopecks.
export function withoutExpenses(data: ExpenseMonth, ids: Set<string>): ExpenseMonth {
  const items = data.items.filter((item) => !ids.has(item.product_id));
  const categories = new Map<string, ExpenseMonth['categories'][number]>();
  let kopecks = 0;
  for (const item of items) {
    const amount = Math.round(item.amount * 100);
    kopecks += amount;
    const key = JSON.stringify([item.category_id, item.category_name]);
    const previous = categories.get(key);
    categories.set(key, { category_id: item.category_id, category_name: item.category_name, total: ((previous ? Math.round(previous.total * 100) : 0) + amount) / 100, count: (previous?.count ?? 0) + 1 });
  }
  return { items, total: kopecks / 100, categories: [...categories.values()].sort((a, b) => b.total - a.total || a.category_name.localeCompare(b.category_name)) };
}
