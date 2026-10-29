'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { saveProduct } from '@/app/products/actions';
import { validateProduct, type Product, type ProductErrors } from '@/lib/products';

type Props = { workspaceId: string; product: Product | null; onClose: () => void; onSaved: () => void };

// Native dialog handles focus trapping, background inertness and keyboard navigation.
export default function OrderModal({ workspaceId, product, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '0');
  const [fields, setFields] = useState<ProductErrors>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // Open once per form instance; restore body scrolling on every unmount.
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  // Keep all user input intact if validation or the network request fails.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const input = { name, description, price };
    const validation = validateProduct(input);
    setError('');
    if (!validation.ok) { setFields(validation.fields); return; }
    setFields({});
    submitting.current = true;
    setPending(true);
    let saved = false;
    try {
      const result = await saveProduct(workspaceId, product?.id ?? null, input);
      if (!result.ok) { setError(result.error); setFields(result.fields ?? {}); }
      else saved = true;
    } catch {
      setError('Не вдалося зберегти продукт. Перевірте підключення та спробуйте знову.');
    } finally {
      submitting.current = false;
      setPending(false);
    }
    if (saved) onSaved();
  }

  return (
    <dialog ref={dialog} aria-labelledby="product-dialog-title" aria-describedby="product-dialog-description"
      onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl bg-white p-6 text-zinc-900 shadow-xl backdrop:bg-black/50">
      {/* Product form shared by create and edit; labels have matching field IDs. */}
      <h2 id="product-dialog-title" className="text-xl font-semibold">{product ? 'Редагувати продукт' : 'Новий продукт'}</h2>
      <p id="product-dialog-description" className="mt-2 text-sm text-zinc-600">Ціна у гривнях. Опис можна залишити порожнім.</p>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4" aria-busy={pending}>
        <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
          <div>
            <label htmlFor="product-name" className="block font-medium">Назва</label>
            <input autoFocus id="product-name" name="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} aria-invalid={!!fields.name} aria-describedby={fields.name ? 'name-error' : undefined} className="mt-1 w-full rounded border border-zinc-400 px-3 py-2" />
            {fields.name && <p id="name-error" className="mt-1 text-sm text-red-700">{fields.name}</p>}
          </div>
          <div>
            <label htmlFor="product-description" className="block font-medium">Опис (необов’язково)</label>
            <textarea id="product-description" name="description" rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} aria-invalid={!!fields.description} aria-describedby={fields.description ? 'description-error' : undefined} className="mt-1 w-full rounded border border-zinc-400 px-3 py-2" />
            {fields.description && <p id="description-error" className="mt-1 text-sm text-red-700">{fields.description}</p>}
          </div>
          <div>
            <label htmlFor="product-price" className="block font-medium">Ціна, грн</label>
            <input id="product-price" name="price" type="text" inputMode="decimal" required value={price} onChange={(event) => setPrice(event.target.value)} aria-invalid={!!fields.price} aria-describedby={fields.price ? 'price-error' : undefined} className="mt-1 w-full rounded border border-zinc-400 px-3 py-2" />
            {fields.price && <p id="price-error" className="mt-1 text-sm text-red-700">{fields.price}</p>}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {/* Disable dismissal while a request is in flight to avoid ambiguous saves. */}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" disabled={pending} onClick={onClose} className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-50">Скасувати</button>
          <button type="submit" disabled={pending} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{pending ? 'Збереження…' : 'Зберегти'}</button>
        </div>
        {pending && <p role="status" className="text-sm text-zinc-600">Зберігаємо продукт…</p>}
      </form>
    </dialog>
  );
}
