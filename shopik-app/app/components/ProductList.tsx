'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import AppHeader from './AppHeader';
import type { Account, ProductAuthor } from '@/lib/identity';
import OrderCard from './OrderCard';
import OrderModal from './OrderModal';
import CategoryManager from './CategoryManager';
import DeleteProductDialog from './DeleteProductDialog';
import { deleteProduct, setProductStatus } from '@/app/products/actions';
import type { Tag, TaggedProduct } from '@/lib/tags';
import TagFilter from './TagFilter';
import type { Category } from '@/lib/categories';

type Props = {
  workspaceId: string; workspaceName: string; email: string; role: string; account: Account; authors: ProductAuthor[];
  products: TaggedProduct[]; loadError: string | null; categories: Category[]; selectedCategory: string; tags: Tag[]; selectedTags: string[];
};

// Server-filtered props are the source of truth; selection is reflected in the URL.
export default function ProductList({ workspaceId, workspaceName, email, role, products, loadError, categories, selectedCategory, tags, selectedTags, account, authors }: Props) {
  const router = useRouter();
  const categoryNav = useRef<HTMLElement>(null);
  const authorMap = new Map(authors.map((author) => [author.product_id, author]));
  // Keep the active category visible inside its horizontal scroll container.
  useEffect(() => { categoryNav.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [selectedCategory]);
  const [editor, setEditor] = useState<{ product: TaggedProduct | null } | null>(null);
  const [removing, setRemoving] = useState<TaggedProduct | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();
  const newButton = useRef<HTMLButtonElement>(null);
  const editorTrigger = useRef<HTMLElement | null>(null);

  // Native dialog closes before restoring focus to the original control.
  function closeEditor() {
    setEditor(null);
    (editorTrigger.current ?? newButton.current)?.focus();
  }

  // Explicit modes distinguish completion and permanent deletion.
  function mutate(product: TaggedProduct, mode: 'delete' | 'complete') {
    if (pending) return;
    setError(''); setNotice('');
    startTransition(async () => {
      try {
        const result = mode === 'delete' ? await deleteProduct(workspaceId, product.id)
          : await setProductStatus(workspaceId, product.id, 'completed');
        if (!result.ok) setError(result.error);
        else { setRemoving(null); setNotice(mode === 'delete' ? 'Продукт і пов’язану витрату видалено.' : 'Статус і витрати оновлено.'); }
      } catch { setError('Не вдалося виконати дію. Спробуйте знову.'); }
    });
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 text-zinc-900">
      {/* Workspace navigation and session controls. */}
      <AppHeader account={account} page="products" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-5 py-6">
        {/* Categories are persisted independently of the selected product list. */}
        <section className="space-y-3" aria-labelledby="workspace-heading">
          <h2 id="workspace-heading" className="text-xl font-semibold">{workspaceName}</h2>
          <p className="break-all text-sm text-zinc-600">{email} · {role === 'owner' ? 'Власник' : 'Учасник'}</p>
          <CategoryManager workspaceId={workspaceId} categories={categories} />
          <nav ref={categoryNav} aria-label="Категорії продуктів" className="flex w-full min-w-0 gap-2 overflow-x-auto py-2">
            {categories.map((category) => <button key={category.id} title={category.name} disabled={pending} aria-pressed={selectedCategory === category.id}
              onClick={() => { setError(''); const params = new URLSearchParams({ category: category.id }); selectedTags.forEach((id) => params.append('tag', id)); startTransition(() => router.push(`/?${params}`, { scroll: false })); }}
              className={`max-w-[85%] shrink-0 whitespace-nowrap overflow-hidden text-ellipsis rounded border px-3 py-2 ${selectedCategory === category.id ? 'bg-blue-600 text-white' : 'bg-white'}`}>{category.name}</button>)}
          </nav>
          <TagFilter tags={tags} selected={selectedTags} action="/" preserved={{ name: 'category', value: selectedCategory }} />

        </section>
        {/* Distinguish loading failures, zero categories and an empty category. */}
        {(loadError || error) && <p role="alert" className="rounded bg-red-50 p-4 text-red-800">{loadError || error}</p>}
        {loadError && <button disabled={pending} onClick={() => startTransition(() => router.refresh())} className="rounded border px-3 py-2">Спробувати знову</button>}
        <p role="status" className="text-sm text-zinc-600">{pending ? 'Оновлюємо дані…' : notice}</p>
        {!loadError && categories.length === 0 && <p className="rounded border border-dashed p-6">Спочатку створіть категорію, щоб додати продукт.</p>}

        <section aria-label="Продукти" aria-busy={pending} className="relative min-w-0 space-y-4">
          {/* Sticky action stays inside the product section, above its cards. */}
          <div className="sticky top-0 z-20 bg-zinc-50 py-3">
            <button ref={newButton} disabled={pending || !!loadError || categories.length === 0} onClick={(event) => { editorTrigger.current = event.currentTarget; setNotice(''); setEditor({ product: null }); }} className="w-full rounded bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50">Додати продукт</button>
          </div>
        {!loadError && categories.length > 0 && products.length === 0 && <section className="rounded-lg border border-dashed border-zinc-400 p-8 text-center"><h3 className="font-semibold">{selectedTags.length ? 'Продуктів із вибраними тегами немає' : 'У цій категорії поки немає продуктів'}</h3><p className="mt-2 text-zinc-600">Додайте перший продукт.</p></section>}
          {!loadError && products.map((product) => <OrderCard key={product.id} product={product} author={authorMap.get(product.id)} pending={pending}
            onEdit={(trigger) => { editorTrigger.current = trigger; setNotice(''); setEditor({ product }); }}
            onStatus={() => mutate(product, 'complete')} onDelete={() => { setError(''); setRemoving(product); }} />)}
        </section>
      </main>
      {/* Separate dialogs for editing and the explicit expense/delete choice. */}
      {editor && <OrderModal key={editor.product?.id ?? 'new'} workspaceId={workspaceId} product={editor.product}
        categories={categories} tags={tags} selectedCategory={selectedCategory} onClose={closeEditor}
        onSaved={() => { setNotice('Продукт збережено.'); closeEditor(); }} />}
      {removing && <DeleteProductDialog product={removing} pending={pending} error={error}
        onClose={() => setRemoving(null)} onDelete={() => mutate(removing, 'delete')} onExpense={() => mutate(removing, 'complete')} />}
    </div>
  );
}
