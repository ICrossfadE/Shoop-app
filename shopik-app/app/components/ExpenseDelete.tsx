'use client';
import { useState, useTransition } from 'react';
import { deleteProduct } from '@/app/products/actions';

// Completed purchases expose only deletion, preserving the current month/tag URL.
export default function ExpenseDelete({ workspaceId, productId, name }: { workspaceId: string; productId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  function remove() {
    if (pending || !window.confirm(`Видалити «${name}»? Витрату та її суму буде прибрано зі статистики.`)) return;
    setError('');
    startTransition(async () => {
      try { const result = await deleteProduct(workspaceId, productId); if (!result.ok) setError(result.error); }
      catch { setError('Не вдалося видалити покупку. Спробуйте знову.'); }
    });
  }
  return <div><button onClick={remove} disabled={pending} className="rounded border border-danger px-3 py-2 text-danger disabled:opacity-50">{pending ? 'Видалення…' : 'Видалити покупку'}</button>{error && <p role="alert" className="mt-2 text-danger">{error}</p>}</div>;
}
