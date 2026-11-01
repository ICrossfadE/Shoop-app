"use client";
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useList, listCache } from '@/lib/use-list';
import { readTagFilter, type Tag, type TaggedProduct } from '@/lib/tags';
import { ownsRecord } from '@/lib/permissions';
import type { Account, ProductAuthor } from '@/lib/identity';
import type { Category } from '@/lib/categories';
import type { ListData, ListFilter } from '@/lib/list-model';
import { mutateProduct } from '@/lib/mutate-product';
import OrderCard from './OrderCard';
import AnimatedNumber from './AnimatedNumber';
import DeleteProductDialog from './DeleteProductDialog';
import TagFilter from './TagFilter';
import WorkspaceAvatars from './WorkspaceAvatars';

type Props = {
  membershipVersion?: string; hasInitial?: boolean; userId: string; workspaceId: string;
  workspaceName: string; email: string; role: string; account: Account;
  authors: ProductAuthor[]; products: TaggedProduct[]; loadError: string | null;
  categories: Category[]; selectedCategory: string; tags: Tag[]; selectedTags: string[];
};

// Each category uses the existing scoped cache; sums and rows share one filtered snapshot.
function CategorySection({ category, selectedTags, initial, initialFilter, ...props }: Props & { category: Category; initial?: ListData; initialFilter: ListFilter }) {
  const query = useList(props.userId, props.workspaceId, { kind: 'products', category: category.id, month: '', tags: selectedTags }, initialFilter, category.id === initialFilter.category ? initial : undefined, props.membershipVersion);
  const [removing, setRemoving] = useState<TaggedProduct | null>(null);
  const products = query.data?.products ?? [];
  const authors = new Map((query.data?.authors ?? []).map(author => [author.product_id, author]));
  const total = products.reduce((sum, product) => sum + Math.round(product.price * 100), 0) / 100;
  // Native details provides independent accessible expansion without changing URL filters.
  return <details className="category-accordion" data-category={category.id} open>
    <summary><span className="category-name">{category.name}</span><span className="category-sum">{query.data ? <><AnimatedNumber value={total} /></> : query.error ? 'Недоступно' : '…'}</span></summary>
    <div className="category-panel" aria-busy={query.loading}>
      {query.error && <p role="alert">{query.error} <button onClick={query.retry}>Спробувати знову</button></p>}
      {query.loading && !query.data && <p role="status" className="text-muted">Завантажуємо покупки…</p>}
      {query.data && !products.length && <p className="category-empty text-muted">{selectedTags.length ? 'За вибраними тегами покупок немає.' : 'Покупок ще немає. Додайте через «+».'}</p>}
      <div className="product-cards">{products.map(product => <OrderCard key={product.id} product={product} author={authors.get(product.id)} canManage={ownsRecord(props.userId, product)} pending={query.pending.some(operation => operation.id === product.id)}
        onEdit={trigger => listCache.openDraft({ key: crypto.randomUUID(), trigger, scope: query.scope, userId: props.userId, workspaceId: props.workspaceId, product, categories: props.categories, tags: props.tags, selectedCategory: category.id })}
        onStatus={() => void mutateProduct(query.scope, props.workspaceId, product.id, 'complete', product.name)} onDelete={() => setRemoving(product)} />)}</div>
    </div>
    {removing && <DeleteProductDialog product={removing} pending={false} error="" onClose={() => setRemoving(null)} onDelete={() => { setRemoving(null); void mutateProduct(query.scope, props.workspaceId, removing.id, 'delete', removing.name); }} onExpense={() => { setRemoving(null); void mutateProduct(query.scope, props.workspaceId, removing.id, 'complete', removing.name); }} />}
  </details>;
}

// The home screen prioritizes purchases; creation is owned by the shared floating action.
export default function ProductList(props: Props) {
  const params = useSearchParams();
  const selectedTags = readTagFilter(params.getAll('tag'));
  const invalidTags = !selectedTags || selectedTags.some(id => !props.tags.some(tag => tag.id === id));
  const initialFilter: ListFilter = { kind: 'products', category: props.selectedCategory, tags: props.selectedTags, month: '' };
  const initial = props.hasInitial && !props.loadError ? { products: props.products, authors: props.authors, expenses: null } : undefined;
  return <main className="app-main mobile-main shopping-home">
    {/* Minimal heading and current workspace participants. */}
    <section className="list-heading"><h1>Список продуктів</h1><WorkspaceAvatars workspaceId={props.workspaceId} userId={props.userId} account={props.account} /></section>
    {/* Filters retain AND semantics and URL history without a sidebar. */}
    <TagFilter tags={props.tags} selected={selectedTags ?? []} action="/" preserved={{ name: 'category', value: params.get('category') ?? props.selectedCategory }} />
    {props.loadError && <p role="alert">{props.loadError} <button onClick={() => window.location.reload()}>Спробувати знову</button></p>}
    {invalidTags && <p role="alert">Один із тегів недоступний. Скиньте фільтр.</p>}
    {!props.loadError && !invalidTags && <section aria-label="Категорії продуктів" className="category-list">
      {!props.categories.length && <p className="category-empty">Створіть категорію через «+», щоб додати продукт.</p>}
      {props.categories.map(category => <CategorySection key={category.id} {...props} category={category} selectedTags={selectedTags ?? []} initial={initial} initialFilter={initialFilter} />)}
    </section>}
  </main>;
}
