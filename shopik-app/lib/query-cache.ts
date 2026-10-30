import { listKey, matches, withoutExpenses, type ListData, type ListFilter, type MutationData, type ProductDraft, type FailedMutation } from './list-model.ts';
import type { TaggedProduct } from './tags';

type Entry = { scope: string; filter: ListFilter; data?: ListData; at: number; error: string; loading: boolean; generation: number; promise?: Promise<void> };
export type Overlay = { scope: string; id: string; product?: TaggedProduct; remove?: boolean; expense?: boolean };
export class AccessError extends Error {}

// Browser-owned only: no process-global server cache of private data.
export class QueryCache {
  entries = new Map<string, Entry>();
  overlays = new Map<string, Overlay>();
  drafts = new Map<string, ProductDraft>();
  failures = new Map<string, FailedMutation>();
  listeners = new Set<() => void>();
  revision = 0;
  owner = '';
  readonly ttl: number;
  readonly now: () => number;
  constructor(ttl = 30_000, now = () => Date.now()) { this.ttl = ttl; this.now = now; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  emit = () => { this.revision++; this.listeners.forEach((listener) => listener()); };
  clear() { this.entries.clear(); this.overlays.clear(); this.drafts.clear(); this.failures.clear(); this.owner = ''; this.emit(); }
  openDraft(draft: ProductDraft) {
    if (draft.product && [...this.drafts.values()].some((other) => other.scope === draft.scope && other.product?.id === draft.product?.id)) return;
    this.drafts.set(draft.key, draft); this.emit();
  }
  closeDraft(key: string) { const trigger = this.drafts.get(key)?.trigger; this.drafts.delete(key); this.emit(); if (trigger?.isConnected) trigger.focus(); }
  activate(owner: string) { if (this.owner !== owner) { this.clear(); this.owner = owner; } }
  seed(scope: string, filter: ListFilter, data: ListData) {
    const key = listKey(scope, filter);
    if (!this.entries.has(key)) this.entries.set(key, { scope, filter, data, at: this.now(), error: '', loading: false, generation: 0 });
  }
  entry(scope: string, filter: ListFilter) { return this.entries.get(listKey(scope, filter)); }
  view(scope: string, filter: ListFilter): ListData | undefined {
    const base = this.entry(scope, filter)?.data;
    if (!base) return;
    let products = base.products;
    const deletedExpenses = new Set<string>();
    for (const overlay of this.overlays.values()) {
      if (overlay.scope !== scope) continue;
      products = products.filter((product) => product.id !== overlay.id);
      if (overlay.product && matches(overlay.product, filter)) products = [overlay.product, ...products];
      if (overlay.expense && overlay.remove) deletedExpenses.add(overlay.id);
    }
    return { ...base, products: products.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)), expenses: base.expenses && deletedExpenses.size ? withoutExpenses(base.expenses, deletedExpenses) : base.expenses };
  }
  begin(key: string, overlay: Overlay) {
    if ([...this.overlays.values()].some((other) => other.scope === overlay.scope && other.id === overlay.id)) return false;
    if ([...this.failures.values()].some((other) => other.ambiguous && other.scope === overlay.scope && other.id === overlay.id && other.operationId !== key)) return false;
    this.overlays.set(key, overlay); this.emit(); return true;
  }
  finish(key: string, data?: MutationData) {
    const overlay = this.overlays.get(key);
    if (!overlay) return;
    this.overlays.delete(key);
    if (data) for (const entry of this.entries.values()) {
      if (entry.scope !== overlay.scope) continue;
      const previousAt = entry.at;
      entry.generation++; entry.at = 0;
      if (!entry.data) continue;
      if (entry.filter.kind === 'products') {
        let products = entry.data.products.filter((product) => product.id !== overlay.id && product.id !== data.product?.id && product.id !== data.deleted);
        if (data.product && matches(data.product, entry.filter)) products = [data.product, ...products];
        entry.data = { ...entry.data, products, authors: data.author ? [...entry.data.authors.filter((author) => author.product_id !== data.author!.product_id), data.author] : entry.data.authors };
        // Do not extend the freshness of unrelated rows on every local mutation.
        entry.at = previousAt;
      } else if (data.deleted && entry.data.expenses) {
        entry.data = { ...entry.data, expenses: withoutExpenses(entry.data.expenses, new Set([data.deleted])) };
      }
    }
    this.emit();
  }
  invalidate(scope?: string) { for (const entry of this.entries.values()) if (!scope || entry.scope === scope) { entry.at = 0; entry.generation++; } this.emit(); }
  async load(scope: string, filter: ListFilter, loader: () => Promise<ListData>, force = false) {
    const key = listKey(scope, filter);
    let entry = this.entries.get(key);
    if (!entry) { entry = { scope, filter, at: 0, error: '', loading: false, generation: 0 }; this.entries.set(key, entry); }
    if (entry.promise) return entry.promise;
    if (!force && entry.data && this.now() - entry.at < this.ttl) return;
    const target = entry, generation = entry.generation;
    target.loading = true; target.error = '';
    target.promise = (async () => {
      try {
        const data = await loader();
        if (this.entries.get(key) === target && target.generation === generation) { target.data = data; target.at = this.now(); }
      } catch (error) {
        if (error instanceof AccessError && this.entries.get(key) === target) { this.clear(); throw error; }
        if (this.entries.get(key) === target) target.error = 'Не вдалося оновити дані. Показано останній збережений список.';
      } finally { target.loading = false; target.promise = undefined; this.emit(); if (this.entries.get(key) === target && target.generation !== generation) void this.load(scope, filter, loader, true).catch(() => {}); }
    })();
    this.emit();
    return target.promise;
  }
}
