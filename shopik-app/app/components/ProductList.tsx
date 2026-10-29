'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import SignOutButton from './SignOutButton';
import OrderCard from './OrderCard';
import OrderModal from './OrderModal';
import { deleteProduct, setProductStatus } from '@/app/products/actions';
import type { Product } from '@/lib/products';

type Props = {
  workspaceId: string; workspaceName: string; email: string; role: string;
  products: Product[]; loadError: string | null;
};

// Server props are the source of truth; no demo data or local product storage.
export default function ProductList({ workspaceId, workspaceName, email, role, products, loadError }: Props) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ product: Product | null } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();
  const newButton = useRef<HTMLButtonElement>(null);
  const editorTrigger = useRef<HTMLElement | null>(null);

  // Preserve keyboard focus when a dialog closes, including after a save.
  function closeEditor() {
    setEditor(null);
    (editorTrigger.current ?? newButton.current)?.focus();
  }

  // Actions keep the old row visible on failure and refresh server data on success.
  function mutate(product: Product, remove: boolean) {
    if (pending) return;
    if (remove && !window.confirm(`Видалити «${product.name}»?`)) return;
    setError('');
    setNotice('');
    startTransition(async () => {
      try {
        const result = remove
          ? await deleteProduct(workspaceId, product.id)
          : await setProductStatus(workspaceId, product.id, product.status === 'active' ? 'completed' : 'active');
        if (!result.ok) setError(result.error);
        else setNotice(remove ? 'Продукт видалено.' : 'Статус продукту змінено.');
      } catch {
        setError('Не вдалося виконати дію. Спробуйте знову.');
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 text-zinc-900">
      {/* Workspace header and authenticated session controls. */}
      <header className="bg-zinc-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <h1 className="text-2xl font-bold">Shopik</h1>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-5 py-6">
        {/* Workspace details and creation control. */}
        <section className="space-y-3" aria-labelledby="workspace-heading">
          <h2 id="workspace-heading" className="text-xl font-semibold">{workspaceName}</h2>
          <p className="break-all text-sm text-zinc-600">{email} · {role === 'owner' ? 'Власник' : 'Учасник'}</p>
          <div className="flex flex-wrap gap-3">
            <button ref={newButton} disabled={pending || !!loadError} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" onClick={(event) => { editorTrigger.current = event.currentTarget; setNotice(''); setEditor({ product: null }); }}>Додати продукт</button>
            <button disabled={pending} onClick={() => startTransition(() => router.refresh())} className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-50">{pending ? 'Оновлення…' : 'Оновити список'}</button>
          </div>
        </section>
        {/* Loading and operation errors never masquerade as an empty list. */}
        {(loadError || error) && <p role="alert" className="rounded bg-red-50 p-4 text-red-800">{loadError || error}</p>}
        <p role="status" className="text-sm text-zinc-600">{pending ? 'Збереження змін…' : notice}</p>
        {!loadError && products.length === 0 && <section className="rounded-lg border border-dashed border-zinc-400 p-8 text-center"><h3 className="font-semibold">Поки немає продуктів</h3><p className="mt-2 text-zinc-600">Додайте перший продукт до свого простору.</p></section>}
        {/* Persisted products; completed rows remain available for editing. */}
        {!loadError && <section aria-label="Продукти" aria-busy={pending} className="space-y-4">
          {products.map((product) => <OrderCard key={product.id} product={product} pending={pending}
            onEdit={(trigger) => { editorTrigger.current = trigger; setNotice(''); setEditor({ product }); }}
            onStatus={() => mutate(product, false)} onDelete={() => mutate(product, true)} />)}
        </section>}
      </main>
      {/* A fresh form instance separates create and edit field/error state. */}
      {editor && <OrderModal key={editor.product?.id ?? 'new'} workspaceId={workspaceId} product={editor.product} onClose={closeEditor}
        onSaved={() => { setNotice('Продукт збережено.'); closeEditor(); }} />}
    </div>
  );
}
