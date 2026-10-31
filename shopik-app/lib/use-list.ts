'use client';
import { localStore } from './local-store';
import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { AccessError, QueryCache } from './query-cache';
import { listKey, type ListData, type ListFilter, type MutationResult } from './list-model';

export const listCache = new QueryCache(30_000, () => Date.now(), localStore);
// A revoked Workspace must not leave private snapshots or drafts visible.
export function discardDeniedAccess(result: MutationResult) {
  if (!result.ok && result.accessLost) { void Promise.resolve(listCache.clear()).then(() => window.location.replace('/login')); return true; }
  return false;
}
export const navigateList = (url: string) => window.history.pushState(null, '', url);

// Shared by mounted lists and the small navigation warmer.
export async function readList(workspaceId: string, filter: ListFilter): Promise<ListData> {
  const params = new URLSearchParams({ workspace: workspaceId, kind: filter.kind, category: filter.category, month: filter.month });
  filter.tags.forEach((tag) => params.append('tag', tag));
  const response = await fetch('/api/lists?'+params, { cache: 'no-store' });
  if (response.status === 401 || response.status === 403) throw new AccessError();
  if (!response.ok) throw new Error('Read failed');
  return response.json();
}

// SSR uses only the supplied initial data. Memory is populated after hydration.
export function useList(userId: string, workspaceId: string, filter: ListFilter, initialFilter: ListFilter, initial?: ListData, membershipVersion?: string) {
  const scope = `${userId}:${workspaceId}`;
  const key = listKey(scope, filter), initialKey = listKey(scope, initialFilter);
  const router = useRouter();
  const revision = useSyncExternalStore(listCache.subscribe, () => listCache.revision, () => 0);
  const generation = listCache.entry(scope, filter)?.generation ?? 0;
  useEffect(() => {
    listCache.activate(userId);
    listCache.prepare(scope,membershipVersion);
    if (initial) listCache.seed(scope, initialFilter, initial);
    listCache.emit();
    // All dependencies are represented by the normalized keys below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, scope, initialKey, membershipVersion]);
  useEffect(() => {
    let active = true;
    const read = () => readList(workspaceId, filter);
    const load = (force = false) => {
      if (filter.kind === 'products' && !filter.category) return;
      void listCache.load(scope, filter, read, force).catch(() => { if (active) router.replace('/login'); });
    };
    load();
    const refresh = () => { if (document.visibilityState === 'visible') { listCache.invalidate(); load(true); } };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, key, generation, router]);
  const entry = listCache.entry(scope, filter);
  const data = listCache.view(scope, filter) ?? (key === initialKey && revision === 0 ? initial : undefined);
  return { scope, data, loading: entry?.loading ?? !data, error: entry?.error ?? '', pending: [...listCache.overlays.values()].filter((operation) => operation.scope === scope), retry: () => listCache.invalidate(scope) };
}
