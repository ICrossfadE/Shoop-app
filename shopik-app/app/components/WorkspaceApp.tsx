'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { WorkspaceBoot, Screen } from '@/lib/workspace-boot';
import type { ListFilter, MutationData } from '@/lib/list-model';
import { currentKyivMonth } from '@/lib/expenses';
import { listCache, readList } from '@/lib/use-list';
import AppHeader from './AppHeader';
import ProductList from './ProductList';
import ExpenseList from './ExpenseList';
import SettingsPanel from './SettingsPanel';
import CreateAction from './CreateAction';

// One mounted shell owns shared metadata. Screens consume the same scoped query
// cache, so prefetched data is invalidated by mutations before it can be reused.
export default function WorkspaceApp({ boot }: { boot: WorkspaceBoot }) {
  const pathname = usePathname();
  const screen: Screen = pathname === '/expenses' ? 'expenses' : pathname === '/settings' ? 'settings' : 'products';
  const [metadata, setMetadata] = useState(boot);
  const [error, setError] = useState('');
  const catalog = useRef(JSON.stringify([boot.categories, boot.tags]));
  const freshness = useRef({ at: 0, generation: 0, loading: false });
  const scope = `${boot.userId}:${boot.workspace.workspace_id}`;
  const refresh = useCallback(async (force = false): Promise<void> => {
    const state = freshness.current;
    if (state.loading || (!force && Date.now() - state.at < 30_000)) return;
    state.loading = true;
    const generation = state.generation;
    try {
      const response = await fetch(`/api/workspace?workspace=${boot.workspace.workspace_id}`, { cache: 'no-store' });
      if (listCache.owner !== boot.userId) return;
      if (response.status === 401 || response.status === 403) { await listCache.clear(); window.location.replace('/login'); return; }
      if (!response.ok) throw new Error('Metadata unavailable');
      const next: Pick<WorkspaceBoot, 'categories' | 'tags' | 'theme' | 'userId'> = await response.json();
      if (listCache.owner !== boot.userId) return;
      if (next.userId !== boot.userId) { await listCache.clear(); window.location.replace('/login'); return; }
      if (state.generation !== generation) return;
      const signature = JSON.stringify([next.categories, next.tags]);
      if (catalog.current !== signature) { catalog.current = signature; listCache.invalidateLocal(scope); listCache.invalidate(scope); }
      state.at = Date.now();
      setMetadata((previous) => ({ ...previous, ...next, categoriesError: false, tagsError: false }));
      setError('');
    } catch { setError('Не вдалося оновити довідники. Показано останні збережені дані.'); }
    finally { state.loading = false; if (state.generation !== generation && listCache.owner === boot.userId) void refresh(true); }
  }, [boot.userId, boot.workspace.workspace_id, scope]);

  useEffect(() => { listCache.activate(boot.userId); listCache.prepare(scope,boot.membershipVersion); if (boot.revokedWorkspaceId) void listCache.revoke(`${boot.userId}:${boot.revokedWorkspaceId}`); freshness.current.at = Date.now(); }, [boot.userId, boot.revokedWorkspaceId, boot.membershipVersion, scope]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const onReturn = () => { if (document.visibilityState === 'visible') void refresh(true); };
    const interval = window.setInterval(onReturn, 30_000);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn); window.addEventListener('online', onReturn);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange',onReturn); window.clearTimeout(timer); window.removeEventListener('focus', onReturn); window.removeEventListener('online', onReturn); };
  }, [screen, refresh]);
  useEffect(() => {
    // One preparation of the two default views, never every filter combination.
    // Saving data/offline devices can load on demand instead.
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData || !navigator.onLine || boot.categoriesError || boot.tagsError) return;
    const timer = window.setTimeout(() => {
      const filters: ListFilter[] = [
        { kind: 'products', category: boot.categories[0]?.id ?? '', month: '', tags: [] },
        { kind: 'expenses', category: '', month: currentKyivMonth(), tags: [] },
      ];
      for (const filter of filters) {
        if (filter.kind === 'products' && !filter.category) continue;
        void listCache.load(scope, filter, () => readList(boot.workspace.workspace_id, filter)).catch(() => {
          if (listCache.owner === '' || listCache.owner === boot.userId) window.location.replace('/login');
        });
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [boot, scope]);

  function changed(change: MutationData) {
    listCache.invalidateLocal(scope);
    freshness.current.generation++; freshness.current.at = 0;
    if (change.workspaceChanged) { listCache.invalidate(scope); void refresh(true); }
    setMetadata((previous) => ({ ...previous,
      categories: change.category ? [...previous.categories.filter((item) => item.id !== change.category!.id), change.category].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)) : change.deleted ? previous.categories.filter((item) => item.id !== change.deleted) : previous.categories,
      tags: change.tag ? [...previous.tags.filter((item) => item.id !== change.tag!.id), change.tag].sort((a, b) => a.name.localeCompare(b.name)) : previous.tags,
    }));
  }
  return <div className="flex flex-1 flex-col bg-page text-foreground">
    <AppHeader account={boot.account} page={screen} />
    {error && <aside role="alert" className="app-main">{error} <button onClick={() => refresh(true)}>Спробувати знову</button></aside>}
    {screen === 'products' ? <ProductList membershipVersion={boot.membershipVersion} userId={boot.userId} workspaceId={boot.workspace.workspace_id} workspaceName={boot.workspace.workspace_name} role={boot.workspace.member_role} account={boot.account} email={boot.email}
      categories={metadata.categories} tags={metadata.tags} hasInitial={!!boot.initial && boot.initialFilter.kind === 'products'} selectedCategory={boot.initialFilter.kind === 'products' ? boot.initialFilter.category : metadata.categories[0]?.id ?? ''}
      selectedTags={boot.initialFilter.kind === 'products' ? boot.initialFilter.tags : []} products={boot.initial?.products ?? []} authors={boot.initial?.authors ?? []}
      loadError={metadata.categoriesError || metadata.tagsError ? 'Не вдалося завантажити довідники.' : null} />
      : screen === 'expenses' ? <ExpenseList membershipVersion={boot.membershipVersion} userId={boot.userId} workspace={boot.workspace} tags={metadata.tags} initialFilter={boot.initialFilter.kind === 'expenses' ? boot.initialFilter : { kind: 'expenses', category: '', month: currentKyivMonth(), tags: [] }}
        initial={boot.initialFilter.kind === 'expenses' ? boot.initial : undefined} loadError={metadata.tagsError} />
      : null}
    {screen !== 'settings' && <CreateAction key={boot.workspace.workspace_id} boot={metadata} onChange={changed} />}
    <div hidden={screen !== 'settings'} style={{ display: screen === 'settings' ? 'contents' : 'none' }}><SettingsPanel active={screen==='settings'} boot={metadata} onChange={changed} /></div>
  </div>;
}
