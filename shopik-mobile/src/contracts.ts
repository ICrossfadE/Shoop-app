import type { Category, Product, Tag, WorkspaceScope, LocalEntityKey } from '../../shopik-app/lib/domain/index.ts';

// Domain models are shared; only feasibility fixtures belong to this mobile module.
export type { Category, Product, Tag };
export type Scope = WorkspaceScope;
export type LocalId = LocalEntityKey;
export type LocalCategory = Omit<Category, 'id'> & { id: LocalId };
export type LocalTag = Omit<Tag, 'id'> & { id: LocalId };
export type LocalProduct = Omit<Product, 'id' | 'category_id'> & { id: LocalId; category_id: LocalId; tag_ids: LocalId[] };
export type ProbeBundle = { category: LocalCategory; tag: LocalTag; product: LocalProduct };
export type ProbeRecord = { scope: Scope; bundle: ProbeBundle; committedAt: string };
export type ProbeOperation = {
  id: string;
  scope: Scope;
  kind: 'probe.create-bundle';
  payload: ProbeBundle;
  state: 'pending';
  createdAt: string;
};

export type { CredentialStorage } from '../../shopik-app/lib/domain/platform.ts';

// The probe repository is not the production repository or sync protocol.
export interface ProbeRepository {
  load(scope: Scope): Promise<{ record: ProbeRecord | null; operations: ProbeOperation[] }>;
  save(record: ProbeRecord, operation: ProbeOperation): Promise<void>;
  clear(scope: Scope): Promise<void>;
  close(): void;
}

// Encode every scope part independently so account/workspace/epoch cannot collide.
export function scopeKey(scope: Scope): string {
  return JSON.stringify([scope.accountId, scope.workspaceId, scope.membershipEpoch]);
}
