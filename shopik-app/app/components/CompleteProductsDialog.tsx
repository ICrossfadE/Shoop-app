'use client';
import { useEffect, useRef, useState } from 'react';
import { completeProducts } from '../products/actions';
import { listCache, discardDeniedAccess } from '@/lib/use-list';
import type { CompletionDraft, MutationResult } from '@/lib/list-model';
import { formatMoney, productTotal } from '@/lib/money';
import { lockDialogScroll } from '@/lib/dialog-scroll';

// One retained confirmation covers both a single checkmark and a cross-category batch.
export default function CompleteProductsDialog({ draft }: { draft: CompletionDraft }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [ambiguous, setAmbiguous] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const unlock = lockDialogScroll();
    return () => { element.close(); unlock(); };
  }, []);
  async function confirm() {
    if (busy.current || conflict) return;
    const keys: string[] = [];
    for (const product of draft.products) {
      const key = `${draft.key}:${product.id}`;
      if (!listCache.begin(key, { scope: draft.scope, id: product.id, remove: true })) {
        keys.forEach(key => listCache.finish(key)); setError('Дочекайтеся попередньої дії з покупками.'); return;
      }
      keys.push(key);
    }
    busy.current = true; setPending(true); setError('');
    let result: MutationResult;
    try {
      result = await completeProducts(draft.workspaceId, draft.key, draft.products.map(product => ({ id: product.id, amount: productTotal(product), updated_at: product.updated_at })));
    } catch {
      result = { ok: false, error: 'Немає відповіді. Перевірте результат повтором того самого набору.', ambiguous: true };
    }
    if (listCache.owner !== draft.scope.split(':')[0] || !listCache.completions.has(draft.key)) return;
    if (discardDeniedAccess(result)) return;
    keys.forEach(key => listCache.finish(key, result.ok ? result.data : undefined));
    busy.current = false; setPending(false);
    if (result.ok) { listCache.invalidate(draft.scope); listCache.closeCompletion(draft.key); }
    else {
      setError(result.error); setAmbiguous(!!result.ambiguous);
      if (!result.ambiguous) { setConflict(true); listCache.invalidate(draft.scope); }
    }
  }
  const total = draft.products.reduce((sum, product) => sum + Math.round(productTotal(product) * 100), 0) / 100;
  return <dialog ref={dialog} className="product-dialog create-dialog" aria-labelledby="complete-title" onCancel={event => { event.preventDefault(); if (!pending && !ambiguous) listCache.closeCompletion(draft.key); }}>
    {/* Confirmation lists exactly the immutable snapshot submitted on every retry. */}
    <h2 id="complete-title">Перемістити у куплене / витрати?</h2>
    <p className="my-3">{draft.products.length === 1 ? draft.products[0].name : `Вибрано покупок: ${draft.products.length}`} · {formatMoney(total)}</p>
    {draft.products.length > 1 && <ul className="confirmation-items">{draft.products.map(product => <li key={product.id}>{product.name} · {formatMoney(productTotal(product))}</li>)}</ul>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {ambiguous && <p role="status">Результат невідомий. Повтор використовує той самий набір і не дублює витрати.</p>}
    <div className="flex flex-wrap justify-end gap-2 mt-4">
      <button disabled={pending || ambiguous} onClick={() => listCache.closeCompletion(draft.key)} className="rounded border px-3 py-2">{conflict ? 'Закрити й оновити' : 'Скасувати'}</button>
      <button disabled={pending || conflict} onClick={() => void confirm()} className="button-primary px-3 py-2">{pending ? 'Переміщення…' : ambiguous ? 'Перевірити / повторити' : 'Перемістити'}</button>
    </div>
  </dialog>;
}
