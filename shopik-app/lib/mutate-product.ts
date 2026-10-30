'use client';
import { deleteProduct, setProductStatus } from '@/app/products/actions';
import { listCache, discardDeniedAccess } from './use-list';
import type { MutationResult } from './list-model';

// Operation identity and errors survive route changes, just like pending forms.
export async function mutateProduct(scope: string, workspaceId: string, id: string, mode: 'delete' | 'complete', name: string, expense = false) {
  const previous = [...listCache.failures.values()].find((failure) => failure.scope === scope && failure.id === id && failure.mode === mode);
  const operationId = previous?.operationId ?? crypto.randomUUID();
  if (!listCache.begin(operationId, { scope, id, remove: true, expense })) return null;
  listCache.failures.delete(operationId); listCache.emit();
  let result: MutationResult;
  try {
    result = mode === 'delete' ? await deleteProduct(workspaceId, id, operationId) : await setProductStatus(workspaceId, id, 'completed', operationId);
  } catch { result = { ok: false, error: 'Немає відповіді сервера. Повторіть спробу.', ambiguous: true }; }
  if (discardDeniedAccess(result)) return result;
  // A sign-out/account switch may have cleared the operation during the request.
  if (!listCache.overlays.has(operationId)) return result;
  listCache.finish(operationId, result.ok ? result.data : undefined);
  if (!result.ok) {
    listCache.failures.set(operationId, { operationId, scope, workspaceId, id, mode, name, expense, error: result.error, ambiguous: !!result.ambiguous });
    listCache.emit();
  }
  return result;
}
