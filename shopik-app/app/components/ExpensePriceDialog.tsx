'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Expense } from '@/lib/expenses';
import { parsePrice } from '@/lib/money';
import { correctExpensePrice } from '../expenses/actions';
import { listCache, discardDeniedAccess } from '@/lib/use-list';
import { lockDialogScroll } from '@/lib/dialog-scroll';

// A retained operation key and locked input allow safe retries after lost responses.
export default function ExpensePriceDialog({ expense, workspaceId, scope, trigger, onClose }: { expense: Expense; workspaceId: string; scope: string; trigger?: HTMLElement; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const operation = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const [price, setPrice] = useState(String(expense.amount));
  const [pending, setPending] = useState(false);
  const [ambiguous, setAmbiguous] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const opener = trigger ?? document.activeElement as HTMLElement | null;
    const element = dialog.current!; element.showModal(); const unlock = lockDialogScroll();
    return () => { element.close(); unlock(); if (opener?.isConnected) opener.focus(); };
  }, [trigger]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    if (parsePrice(price) === null) { setError('Вкажіть ціну від 0 до 99 999 999,99 грн, до двох знаків після коми.'); return; }
    if (!listCache.begin(operation.current, { scope, id: expense.product_id })) { setError('Дочекайтеся завершення попередньої дії з покупкою.'); return; }
    busy.current = true; setPending(true); setError('');
    try {
      const result = await correctExpensePrice(workspaceId, expense.id, operation.current, price, expense.amount);
      // Account changes and membership revocation remove the operation; a late
      // result must not clear a newer session or repopulate its private cache.
      if (listCache.owner !== scope.split(':')[0] || !listCache.overlays.has(operation.current)) return;
      if (discardDeniedAccess(result)) return;
      listCache.finish(operation.current, result.ok ? result.data : undefined);
      if (result.ok) { listCache.invalidateLocal(scope); listCache.invalidate(scope); onClose(); }
      else { setError(result.error); setAmbiguous(!!result.ambiguous); if (!result.ambiguous) operation.current = crypto.randomUUID(); }
    } catch { listCache.finish(operation.current); setAmbiguous(true); setError('Результат невідомий. Повторіть збереження з тими самими даними.'); }
    finally { busy.current = false; setPending(false); }
  }
  return <dialog ref={dialog} className="product-dialog create-dialog" aria-labelledby="expense-price-title" onCancel={event => { event.preventDefault(); if (!pending && !ambiguous) onClose(); }}>
    {/* Only the actual amount is editable; historical metadata remains a snapshot. */}
    <h2 id="expense-price-title">Фактична ціна</h2><p className="my-2 break-words">{expense.name}</p>
    <form onSubmit={submit} className="space-y-3" aria-busy={pending}>
      <label htmlFor="actual-price" className="block">Ціна, грн</label>
      <input autoFocus id="actual-price" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} disabled={pending || ambiguous} aria-invalid={!!error} aria-describedby={error ? 'actual-price-error' : undefined} className="w-full rounded border p-2" />
      {error && <p id="actual-price-error" role="alert" className="text-danger">{error}</p>}
      {ambiguous && <p role="status">Повторіть збереження, щоб перевірити результат.</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={pending || ambiguous} onClick={onClose} className="rounded border px-3 py-2">Скасувати</button><button disabled={pending} className="button-primary px-3 py-2">{pending ? 'Збереження…' : 'Зберегти'}</button></div>
    </form>
  </dialog>;
}
