'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SignOutButton from './SignOutButton';
import OrderCard from './OrderCard';
import OrderModal from './OrderModal';
import CategoryManager from './CategoryManager';
import DeleteProductDialog from './DeleteProductDialog';
import { deleteProduct, setProductStatus } from '@/app/products/actions';
import type { Product } from '@/lib/products';
import type { Category } from '@/lib/categories';

type Props = {
  workspaceId: string; workspaceName: string; email: string; role: string;
  products: Product[]; loadError: string | null; categories: Category[]; selectedCategory: string;
};

// Server-filtered props are the source of truth; selection is reflected in the URL.
export default function ProductList({ workspaceId, workspaceName, email, role, products, loadError, categories, selectedCategory }: Props) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ product: Product | null } | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
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

  // Explicit modes distinguish completion, reactivation and permanent deletion.
  function mutate(product: Product, mode: 'delete' | 'complete' | 'toggle') {
    if (pending) return;
    setError(''); setNotice('');
    startTransition(async () => {
      try {
        const result = mode === 'delete' ? await deleteProduct(workspaceId, product.id)
          : await setProductStatus(workspaceId, product.id, mode === 'complete' || product.status === 'active' ? 'completed' : 'active');
        if (!result.ok) setError(result.error);
        else { setRemoving(null); setNotice(mode === 'delete' ? 'Продукт і пов’язану витрату видалено.' : 'Статус і витрати оновлено.'); }
      } catch { setError('Не вдалося виконати дію. Спробуйте знову.'); }
    });
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 text-zinc-900">
      {/* Workspace navigation and session controls. */}
      <header className="bg-zinc-900 text-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <h1 className="text-2xl font-bold">Shopik</h1>
          <nav aria-label="Основна навігація" className="flex gap-4"><Link href="/" aria-current="page">Продукти</Link><Link href="/expenses">Витрати</Link></nav>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-5 py-6">
        {/* Categories are persisted independently of the selected product list. */}
        <section className="space-y-3" aria-labelledby="workspace-heading">
          <h2 id="workspace-heading" className="text-xl font-semibold">{workspaceName}</h2>
          <p className="break-all text-sm text-zinc-600">{email} · {role === 'owner' ? 'Власник' : 'Учасник'}</p>
          <CategoryManager workspaceId={workspaceId} categories={categories} />
          <nav aria-label="Категорії продуктів" className="flex flex-wrap gap-2">
            {categories.map((category) => <button key={category.id} disabled={pending} aria-pressed={selectedCategory === category.id}
              onClick={() => { setError(''); startTransition(() => router.push(`/?category=${category.id}`)); }}
              className={`max-w-full break-words rounded border px-3 py-2 ${selectedCategory === category.id ? 'bg-blue-600 text-white' : 'bg-white'}`}>{category.name}</button>)}
          </nav>
          <div className="flex flex-wrap gap-3">
            <button ref={newButton} disabled={pending || !!loadError || categories.length === 0} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" onClick={(event) => { editorTrigger.current = event.currentTarget; setNotice(''); setEditor({ product: null }); }}>Додати продукт</button>
            <button disabled={pending} onClick={() => startTransition(() => router.refresh())} className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-50">{pending ? 'Оновлення…' : 'Оновити список'}</button>
          </div>
        </section>
        {/* Distinguish loading failures, zero categories and an empty category. */}
        {(loadError || error) && <p role="alert" className="rounded bg-red-50 p-4 text-red-800">{loadError || error}</p>}
        <p role="status" className="text-sm text-zinc-600">{pending ? 'Оновлюємо дані…' : notice}</p>
        {!loadError && categories.length === 0 && <p className="rounded border border-dashed p-6">Спочатку створіть категорію, щоб додати продукт.</p>}
        {!loadError && categories.length > 0 && products.length === 0 && <section className="rounded-lg border border-dashed border-zinc-400 p-8 text-center"><h3 className="font-semibold">У цій категорії поки немає продуктів</h3><p className="mt-2 text-zinc-600">Додайте перший продукт.</p></section>}
        {!loadError && <section aria-label="Продукти" aria-busy={pending} className="space-y-4">
          {products.map((product) => <OrderCard key={product.id} product={product} pending={pending}
            onEdit={(trigger) => { editorTrigger.current = trigger; setNotice(''); setEditor({ product }); }}
            onStatus={() => mutate(product, 'toggle')} onDelete={() => { setError(''); setRemoving(product); }} />)}
        </section>}
      </main>
      {/* Separate dialogs for editing and the explicit expense/delete choice. */}
      {editor && <OrderModal key={editor.product?.id ?? 'new'} workspaceId={workspaceId} product={editor.product}
        categories={categories} selectedCategory={selectedCategory} onClose={closeEditor}
        onSaved={() => { setNotice('Продукт збережено.'); closeEditor(); }} />}
      {removing && <DeleteProductDialog product={removing} pending={pending} error={error}
        onClose={() => setRemoving(null)} onDelete={() => mutate(removing, 'delete')} onExpense={() => mutate(removing, 'complete')} />}
    </div>
  );
}
