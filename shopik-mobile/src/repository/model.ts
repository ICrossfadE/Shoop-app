import type { Category, Product, Tag, Expense, WorkspaceScope, LocalEntityKey } from '../../../shopik-app/lib/domain/index.ts';

export type EntityKind = 'category' | 'tag' | 'product' | 'expense';
export type EntityRef = { kind: EntityKind; id: string };
export type LocalCommand =
  | { kind: 'category.create'; id: LocalEntityKey; name: string }
  | { kind: 'category.rename'; id: string; name: string }
  | { kind: 'category.delete'; id: string }
  | { kind: 'tag.create'; id: LocalEntityKey; name: string; color: string }
  | { kind: 'tag.delete'; id: string }
  | { kind: 'product.save'; id: string; name: string; description: string; price: string; quantity: string; categoryId: string; tagIds: string[] }
  | { kind: 'product.delete'; id: string }
  | { kind: 'product.complete'; items: { id: string; amount: string; expenseId: LocalEntityKey }[] }
  | { kind: 'expense.correct'; id: string; amount: string };
export type OperationState = 'pending' | 'sending' | 'needs-auth' | 'conflict' | 'rejected' | 'acknowledged';
export type LocalOperation = {
  scopeKey: string; scope: WorkspaceScope; id: string; sequence: number; commandVersion: 1;
  command: LocalCommand; creates: EntityRef[]; dependencies: string[];
  baseRevision: string | null; occurredAt: string; state: OperationState; attempts: number;
  wirePayload: string | null; acknowledgedRevision: string | null;
};
export type EntityGraph = {
  categories: Record<string, Category>; tags: Record<string, Tag>; products: Record<string, Product>;
  productTags: Record<string, string[]>; expenses: Record<string, Expense>;
  knownMonths: string[]; bootstrapped: boolean;
};
export type IdMapping = { kind: EntityKind; localId: LocalEntityKey; serverId: string };
export type WorkspaceRecord = {
  formatVersion: 1; scope: WorkspaceScope; confirmed: EntityGraph; projection: EntityGraph;
  mappings: IdMapping[]; nextSequence: number; serverRevision: string | null;
};
export type ServerPatch = {
  categories?: Category[]; tags?: Tag[]; products?: Product[]; expenses?: Expense[];
  productTags?: { productId: string; tagIds: string[] }[]; removed?: EntityRef[];
  knownMonths?: string[]; bootstrapped?: boolean;
};
export type ServerReply = { revision: string; mappings: IdMapping[]; patch: ServerPatch };
export type LocalDraft = { kind: 'product'; name: string; description: string; price: string; quantity: string; categoryId: string; tagIds: string[] };
export type ViewSnapshot = { productIds: string[]; expenseIds: string[]; savedAt: string };
export type RepositoryView = { workspace: WorkspaceRecord; operations: LocalOperation[]; drafts: { key: string; value: LocalDraft }[] };

// Empty loaded months differ from months that have never been downloaded.
export function emptyGraph(): EntityGraph {
  return { categories: {}, tags: {}, products: {}, productTags: {}, expenses: {}, knownMonths: [], bootstrapped: false };
}
// A new account/membership gets a separate graph and monotonic operation sequence.
export function emptyWorkspace(scope: WorkspaceScope): WorkspaceRecord {
  return { formatVersion: 1, scope, confirmed: emptyGraph(), projection: emptyGraph(), mappings: [], nextSequence: 1, serverRevision: null };
}
