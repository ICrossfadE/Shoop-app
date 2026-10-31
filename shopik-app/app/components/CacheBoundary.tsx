'use client';
import LocalDataStatus from './LocalDataStatus';
import { useEffect, useSyncExternalStore } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { listCache } from '@/lib/use-list';
import OrderModal from './OrderModal';
import { mutateProduct } from '@/lib/mutate-product';

// Supabase broadcasts sign-out/account changes across tabs. Never retain another
// account's lists, even when a page is restored from the router cache.
export default function CacheBoundary() {
  useSyncExternalStore(listCache.subscribe, () => listCache.revision, () => 0);
  useEffect(() => {
    if (!getSupabaseConfig()) return;
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (listCache.owner && session?.user.id && listCache.owner !== session.user.id)) {
        listCache.clear();
        window.location.replace('/login');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  // Keep in-flight forms mounted across route navigation, including failed drafts.
  return <><LocalDataStatus />
    {[...listCache.failures.values()].map((failure) => <aside key={failure.operationId} role="alert" className="mx-auto w-full max-w-4xl rounded border border-danger bg-surface p-4">
      <p>{failure.name}: {failure.error}</p>
      <button className="text-link underline" onClick={() => mutateProduct(failure.scope, failure.workspaceId, failure.id, failure.mode, failure.name, failure.expense)}>Повторити дію</button>
      {!failure.ambiguous && <button className="ml-4 text-link underline" onClick={() => { listCache.failures.delete(failure.operationId); listCache.emit(); }}>Закрити</button>}
    </aside>)}
    {[...listCache.drafts.values()].map(({ key, ...draft }) => <OrderModal key={key}
      {...draft} temporaryId={key} onClose={() => listCache.closeDraft(key)} onSaved={() => listCache.closeDraft(key)} />)}
  </>;
}
