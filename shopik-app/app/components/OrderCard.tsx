'use client';

import type { TaggedProduct } from '@/lib/tags';
import TagBadge from './TagBadge';
import AuthorInfo from './AuthorInfo';
import type { ProductAuthor } from '@/lib/identity';
import { useEffect, useId, useRef, useState } from 'react';

type Props = {
  product: TaggedProduct; pending: boolean;
  author?: ProductAuthor;
  onEdit: (trigger: HTMLElement) => void; onStatus: () => void; onDelete: () => void;
};
const money = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' });

// Present one persisted product and its explicit edit, completion and delete actions.
export default function OrderCard({ product, author, pending, onEdit, onStatus, onDelete }: Props) {
  const completed = product.status === 'completed';
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  // Close outside the menu, restoring keyboard focus on Escape.
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('button')?.focus();
    function outside(event: PointerEvent) { if (!menu.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <article className="product-row">
      <span className="product-symbol" aria-hidden="true">▤</span>
      {/* Product details wrap on narrow screens and for long names. */}
      <div className="min-w-0 space-y-2 break-words [overflow-wrap:anywhere]">
        <h3 className={`text-lg font-semibold ${completed ? 'text-muted line-through' : ''}`}>{product.name}</h3>
        {product.description && <p className="whitespace-pre-wrap text-muted">{product.description}</p>}
        <ul aria-label="Теги продукту" className="flex flex-wrap gap-2">{product.tags.map((tag) => <li key={tag.id}><TagBadge tag={tag} /></li>)}</ul>
        <AuthorInfo author={author} createdAt={product.created_at} />
      </div>
      {/* Wrapping actions preserve usable buttons on mobile. */}
      <div className="product-end">
        <p className="product-price">{money.format(product.price)} <small className="text-muted">UAH</small></p>
        <div className="mt-2 flex justify-end gap-2">
        {!completed && <button disabled={pending} onClick={onStatus} aria-label={`Завершити ${product.name}`} className="icon-action">✓</button>}
        <div ref={menu} className="product-menu" onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[data-menu-action]') ?? []);
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
          }
        }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
          <button ref={trigger} disabled={pending} aria-label={`Дії: ${product.name}`} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)} className="icon-action">⋯</button>
          {open && <div id={menuId} className="product-menu-panel" aria-label="Дії продукту">
            {!completed && <button data-menu-action disabled={pending} onClick={() => { setOpen(false); onEdit(trigger.current!); }}>Редагувати</button>}
            <button data-menu-action disabled={pending} onClick={() => { setOpen(false); trigger.current?.focus(); onDelete(); }} className="text-danger">Видалити</button>
          </div>}
        </div>
        </div>
      </div>
    </article>
  );
}
