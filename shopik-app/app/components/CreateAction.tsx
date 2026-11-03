'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { WorkspaceBoot } from '@/lib/workspace-boot';
import type { MutationData } from '@/lib/list-model';
import { listCache } from '@/lib/use-list';
import { lockDialogScroll } from '@/lib/dialog-scroll';
import { localStore } from '@/lib/local-store';
import { chooseCategory, lastCategoryKey } from '@/lib/shopping';
import CategoryManager from './CategoryManager';
import TagManager from '../tags/TagManager';

// One viewport action opens the established forms for the active workspace.
export default function CreateAction({ boot, onChange }: { boot: WorkspaceBoot; onChange: (change: MutationData) => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<'tag' | 'category' | null>(null);
  useSyncExternalStore(listCache.subscribe, () => listCache.revision, () => 0);
  const drafting = listCache.drafts.size > 0 || listCache.completions.size > 0;
  useEffect(() => {
    if (!form || !dialog.current) return;
    const element = dialog.current;
    const opener = button.current;
    element.showModal();
    const unlock = lockDialogScroll();
    return () => { element.close(); unlock(); opener?.focus(); };
  }, [form]);
  // Preserve retry identities while a form has an unresolved response.
  function close() {
    if (!dialog.current?.querySelector('[data-locked="true"]')) setForm(null);
  }
  async function choose(kind: 'product' | 'tag' | 'category') {
    menu.current?.hidePopover();
    if (kind !== 'product') { setForm(kind); return; }
    const remembered = await localStore.read<string>(boot.userId, lastCategoryKey(boot.userId, boot.workspace.workspace_id));
    if (listCache.owner !== boot.userId || listCache.drafts.size) return;
    listCache.openDraft({ key: crypto.randomUUID(), trigger: button.current ?? undefined, scope: boot.userId + ':' + boot.workspace.workspace_id, userId: boot.userId, workspaceId: boot.workspace.workspace_id, product: null, categories: boot.categories, tags: boot.tags, selectedCategory: chooseCategory(boot.categories, null, remembered) });
  }
  // Category creation bypasses the global type menu without toggling its accordion.
  useEffect(() => {
    function createInCategory(event: Event) {
      const detail = (event as CustomEvent<{ category: string; trigger: HTMLElement }>).detail;
      if (listCache.owner !== boot.userId || listCache.drafts.size || listCache.completions.size || !boot.categories.some(category => category.id === detail.category)) return;
      listCache.openDraft({ key: crypto.randomUUID(), trigger: detail.trigger, scope: boot.userId + ':' + boot.workspace.workspace_id, userId: boot.userId, workspaceId: boot.workspace.workspace_id, product: null, categories: boot.categories, tags: boot.tags, selectedCategory: detail.category });
    }
    window.addEventListener('shopik-create-in-category', createInCategory);
    return () => window.removeEventListener('shopik-create-in-category', createInCategory);
  }, [boot]);
  return <>
    {/* Native popover handles outside dismissal and Escape in the top layer. */}
    <div ref={menu} id="create-menu" popover="auto" className="create-menu" aria-label="Створення" onKeyDown={event => {
      if (event.key === 'Escape') button.current?.focus();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
    }}>
      <button onClick={() => choose('product')} disabled={boot.categoriesError || !boot.categories.length}>Створити продукт</button>
      <button onClick={() => choose('tag')} disabled={boot.tagsError}>Створити тег</button>
      <button onClick={() => choose('category')} disabled={boot.categoriesError}>Створити категорію</button>
      {!boot.categories.length && <p className="text-xs text-muted">Спочатку створіть категорію</p>}
    </div>
    <button hidden={!!form || drafting} ref={button} popoverTarget="create-menu" className="create-fab" aria-label="Створити" onClick={() => { requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()); }}>+</button>
    {form && <dialog ref={dialog} className="product-dialog create-dialog" aria-labelledby="create-title" onCancel={event => { event.preventDefault(); close(); }}>
      <div className="list-heading"><h2 id="create-title">{form === 'tag' ? 'Створити тег' : 'Створити категорію'}</h2><button className="icon-action" aria-label="Закрити форму" onClick={close}>×</button></div>
      {form === 'tag' ? <TagManager createOnly workspaceId={boot.workspace.workspace_id} tags={boot.tags} onChange={onChange} /> : <CategoryManager createOnly workspaceId={boot.workspace.workspace_id} userId={boot.userId} categories={boot.categories} onChange={onChange} />}
    </dialog>}
  </>;
}
