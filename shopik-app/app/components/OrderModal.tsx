'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { listCache, discardDeniedAccess } from '@/lib/use-list';
import { lockDialogScroll } from '@/lib/dialog-scroll';
import { saveProduct } from '@/app/products/actions';
import { validateProduct, type ProductErrors } from '@/lib/products';
import type { Category } from '@/lib/categories';
import type { Tag, TaggedProduct } from '@/lib/tags';
import { ownsRecord } from '@/lib/permissions';
import { localStore } from '@/lib/local-store';
import TagBadge from './TagBadge';

type LocalDraft = { name: string; description: string; price: string; categoryId: string; tagIds: string[]; operationId: string; ambiguous: boolean };

type Props = { scope: string; temporaryId: string; userId: string; workspaceId: string; product: TaggedProduct | null; categories: Category[]; tags: Tag[]; selectedCategory: string; onClose: () => void; onSaved: () => void };

// Native dialog handles focus trapping, background inertness and keyboard navigation.
export default function OrderModal({ scope, temporaryId, userId, workspaceId, product, categories, tags, selectedCategory, onClose, onSaved }: Props) {
  const canEdit = !product || ownsRecord(userId, product);
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const operationId = useRef(crypto.randomUUID());
  const [ambiguous, setAmbiguous] = useState(false);
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [categoryId, setCategoryId] = useState(product?.category_id ?? selectedCategory);
  const [tagIds, setTagIds] = useState<string[]>(product?.tags.map((tag) => tag.id) ?? []);
  const [fields, setFields] = useState<ProductErrors>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [recovered, setRecovered] = useState<LocalDraft | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const draftKey = `draft:${scope}:${product?.id ?? 'new'}`;
  // Offer saved input explicitly; never overwrite current server fields silently.
  useEffect(() => {
    let active = true;
    void localStore.read<LocalDraft>(userId, draftKey).then((saved) => {
      if (!active || listCache.owner !== userId) return;
      if (saved && typeof saved.name === 'string' && typeof saved.price === 'string' && Array.isArray(saved.tagIds)) setRecovered(saved);
      setStorageReady(true);
    });
    return () => { active = false; };
  }, [userId, draftKey]);
  useEffect(() => {
    if (!storageReady || recovered || listCache.owner !== userId) return;
    void localStore.write(userId, draftKey, { name, description, price, categoryId, tagIds, operationId: operationId.current, ambiguous } satisfies LocalDraft);
  }, [storageReady, recovered, userId, draftKey, name, description, price, categoryId, tagIds, ambiguous]);
  // Explicit cancellation discards the local draft; closing the tab keeps it.
  function dismiss() { void localStore.remove(draftKey); onClose(); }
  function restore() {
    if (!recovered) return;
    setName(recovered.name); setDescription(recovered.description); setPrice(recovered.price);
    setCategoryId(recovered.categoryId); setTagIds(recovered.tagIds);
    operationId.current = recovered.operationId; setAmbiguous(recovered.ambiguous); setRecovered(null);
  }


  // Moving pills between groups preserves focus for keyboard and screen-reader users.
  function toggleTag(id: string) {
    setTagIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
    requestAnimationFrame(() => {
      Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('[data-tag-id]') ?? [])
        .find((button) => button.dataset.tagId === id)?.focus();
    });
  }

  // Open once per form instance; restore body scrolling on every unmount.
  useEffect(() => {
    if (pending) return;
    const element = dialog.current;
    element?.showModal();
    const unlock = lockDialogScroll();
    return () => { element?.close(); unlock(); };
  }, [pending]);

  // Keep all user input intact if validation or the network request fails.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !canEdit) return;
    const input = { name, description, price, category_id: categoryId, tag_ids: tagIds };
    const validation = validateProduct(input);
    setError('');
    if (!validation.ok) { setFields(validation.fields); return; }
    setFields({});
    const now = new Date().toISOString();
    const optimistic: TaggedProduct = { ...(product ?? { id: temporaryId, workspace_id: workspaceId, created_by: userId, currency: 'UAH' as const, status: 'active' as const, created_at: now, updated_at: now }), ...validation.value, tags: tags.filter((tag) => tagIds.includes(tag.id)) };
    if (!listCache.begin(operationId.current, { scope, id: product?.id ?? temporaryId, product: optimistic })) return;
    submitting.current = true;
    setPending(true);
    // Persist the retry identity before sending: a lost response must reuse the same payload.
    await localStore.write(userId, draftKey, { name, description, price, categoryId, tagIds, operationId: operationId.current, ambiguous: true } satisfies LocalDraft);
    let saved = false;
    try {
      const result = await saveProduct(workspaceId, product?.id ?? null, input, operationId.current);
      if (discardDeniedAccess(result)) return;
      listCache.finish(operationId.current, result.ok ? result.data : undefined);
      if (!result.ok) { setError(result.error); setFields(result.fields ?? {}); setAmbiguous(!!result.ambiguous); if (!result.ambiguous) operationId.current = crypto.randomUUID(); }
      else saved = true;
    } catch {
      listCache.finish(operationId.current); setAmbiguous(true);
      setError('Результат невідомий. Повторіть збереження з тими самими даними.');
    } finally {
      submitting.current = false;
      setPending(false);
    }
    if (saved) { await localStore.remove(draftKey); onSaved(); }
  }

  return (
    <dialog ref={dialog} aria-labelledby="product-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!pending && !ambiguous) dismiss(); }}
      className="product-dialog fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto bg-surface p-5 text-foreground">
      {/* Product form shared by create and edit; labels have matching field IDs. */}
      <h2 id="product-dialog-title" className="text-xl font-semibold">{product ? 'Редагувати продукт' : 'Новий продукт'}</h2>
      {!canEdit && <p role="alert" className="text-danger">Редагування доступне лише автору продукту.</p>}
      {/* Recovery is a local draft, not a queued or confirmed server change. */}
      {recovered && <aside className="my-3 space-y-2" role="status"><p>На цьому пристрої є чернетка цього продукту.</p><button type="button" onClick={restore}>Відновити чернетку</button><button type="button" onClick={() => { void localStore.remove(draftKey); setRecovered(null); }}>Відкинути чернетку</button></aside>}
      <form onSubmit={submit} noValidate className="mt-5 space-y-4" aria-busy={pending}>
        <fieldset disabled={pending || ambiguous || !!recovered || !storageReady || !canEdit} className="space-y-4 disabled:opacity-60">
          {/* Mandatory category is also checked by the Workspace-scoped foreign key. */}
          <div>
            <label htmlFor="product-category" className="block font-medium">Категорія</label>
            <select id="product-category" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-invalid={!!fields.category_id} aria-describedby={fields.category_id ? 'category-error' : undefined} className="mt-1 w-full rounded border border-line px-3 py-2">
              <option value="">Виберіть категорію</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            {fields.category_id && <p id="category-error" className="mt-1 text-sm text-danger">{fields.category_id}</p>}
          </div>
          <div>
            <label htmlFor="product-name" className="block font-medium">Назва</label>
            <input autoFocus id="product-name" name="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} aria-invalid={!!fields.name} aria-describedby={fields.name ? 'name-error' : undefined} className="mt-1 w-full rounded border border-line px-3 py-2" />
            {fields.name && <p id="name-error" className="mt-1 text-sm text-danger">{fields.name}</p>}
          </div>
          <div>
            <label htmlFor="product-description" className="block font-medium">Опис (необов’язково)</label>
            <textarea id="product-description" name="description" rows={2} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} aria-invalid={!!fields.description} aria-describedby={fields.description ? 'description-error' : undefined} className="mt-1 w-full rounded border border-line px-3 py-2" />
            {fields.description && <p id="description-error" className="mt-1 text-sm text-danger">{fields.description}</p>}
          </div>
          <div>
            <label htmlFor="product-price" className="block font-medium">Ціна, грн</label>
            <input id="product-price" name="price" type="text" inputMode="decimal" placeholder="0" required value={price} onChange={(event) => setPrice(event.target.value)} aria-invalid={!!fields.price} aria-describedby={fields.price ? 'price-error' : undefined} className="mt-1 w-full rounded border border-line px-3 py-2" />
            {fields.price && <p id="price-error" className="mt-1 text-sm text-danger">{fields.price}</p>}
          </div>
          {/* Filter-style pills move between selected and available groups. */}
          <fieldset className="tag-picker"><legend className="mb-2 font-medium">Теги</legend>
            <div className="selected-tags flex flex-wrap gap-2" aria-label="Вибрані теги">{tags.filter((tag) => tagIds.includes(tag.id)).map((tag) => <button type="button" key={tag.id} data-tag-id={tag.id} aria-pressed="true" aria-label={`Прибрати тег ${tag.name}`} onClick={() => toggleTag(tag.id)}><TagBadge tag={tag} /></button>)}{!tagIds.length && <span className="text-sm text-muted">Виберіть теги нижче</span>}</div>
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Доступні теги">{tags.filter((tag) => !tagIds.includes(tag.id)).map((tag) => <button type="button" key={tag.id} data-tag-id={tag.id} aria-pressed="false" aria-label={`Додати тег ${tag.name}`} onClick={() => toggleTag(tag.id)}><TagBadge tag={tag} /></button>)}</div>
            {!tags.length && <p className="text-sm text-muted">Створіть теги у налаштуваннях.</p>}
            {fields.tag_ids && <p role="alert" className="text-sm text-danger">{fields.tag_ids}</p>}
          </fieldset>
        </fieldset>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {/* Disable dismissal while a request is in flight to avoid ambiguous saves. */}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" disabled={pending || ambiguous || !!recovered || !storageReady || !canEdit} onClick={dismiss} className="rounded border border-line px-4 py-2 disabled:opacity-50">Скасувати</button>
          <button type="submit" disabled={pending || !!recovered || !storageReady || !canEdit} className="rounded button-primary px-4 py-2 disabled:opacity-50">{pending ? 'Збереження…' : 'Зберегти'}</button>
        </div>
        {ambiguous && <p role="status">Поля збережено для безпечного повтору. Натисніть «Зберегти», щоб перевірити результат.</p>}
      </form>
    </dialog>
  );
}
