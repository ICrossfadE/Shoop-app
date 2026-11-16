import type { LocalId, ProbeBundle, ProbeOperation, ProbeRecord, Scope } from './contracts.ts';

export const probeScope: Scope = Object.freeze({
  accountId: 'prototype-only', workspaceId: 'prototype-only', membershipEpoch: 'probe-v1',
});

// Keep local keys visibly distinct from permanent server-generated SHA256 IDs.
function localId(): LocalId {
  return `local:${crypto.randomUUID()}`;
}

// Produce non-private fixtures for the persistence gate; never send them to Supabase.
export function createProbe(scope: Scope = probeScope): { record: ProbeRecord; operation: ProbeOperation } {
  const now = new Date().toISOString();
  const common = { workspace_id: scope.workspaceId, created_by: scope.accountId, created_at: now, updated_at: now };
  const category = { ...common, id: localId(), name: 'Тестова категорія' };
  const tag = { ...common, id: localId(), name: 'Тестовий тег', color: '#22633D' };
  const bundle: ProbeBundle = {
    category, tag,
    product: { ...common, id: localId(), category_id: category.id, tag_ids: [tag.id],
      name: 'Тестова покупка', description: 'Перевірка збереження після перезапуску',
      price: 12.5, quantity: 2, currency: 'UAH', status: 'active' },
  };
  return {
    record: { scope, bundle, committedAt: now },
    operation: { id: crypto.randomUUID(), scope, kind: 'probe.create-bundle', payload: bundle, state: 'pending', createdAt: now },
  };
}
