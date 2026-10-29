'use client';
import { useEffect, useRef } from 'react';
import type { Product } from '@/lib/products';

// Deletion is distinct from completion: users choose what happens to the expense.
export default function DeleteProductDialog({ product, pending, error, onClose, onDelete, onExpense }: {
  product: Product; pending: boolean; error: string; onClose: () => void; onDelete: () => void; onExpense: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Native modal traps focus and makes the underlying list inert.
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} aria-labelledby="delete-product-title" aria-describedby="delete-product-description"
    onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-xl bg-white p-6 text-zinc-900 shadow-xl backdrop:bg-black/50">
    {/* Explain both outcomes before any irreversible product deletion. */}
    <h2 id="delete-product-title" className="text-xl font-semibold">Що зробити з продуктом?</h2>
    <p className="my-3 break-words font-medium">{product.name}</p>
    <p id="delete-product-description">Можна завершити продукт і врахувати його у витратах або видалити. Видалення прибере також пов’язану витрату зі статистики.</p>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    <div className="mt-5 flex flex-wrap gap-3">
      <button autoFocus disabled={pending} onClick={onClose} className="rounded border px-3 py-2">Скасувати</button>
      <button disabled={pending} onClick={onExpense} className="rounded bg-green-700 px-3 py-2 text-white">{product.status === 'completed' ? 'Залишити у витратах' : 'Перенести у витрати'}</button>
      <button disabled={pending} onClick={onDelete} className="rounded bg-red-700 px-3 py-2 text-white">Видалити</button>
    </div>
    {pending && <p role="status" className="mt-3">Збереження…</p>}
  </dialog>;
}
