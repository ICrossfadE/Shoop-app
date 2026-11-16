import { categoryName, validateTag, validateProduct, productTotal, parsePrice, currentKyivMonth, isExpenseMonth, isProductId, isWorkspaceId } from '../../../shopik-app/lib/domain/index.ts';
import type { WorkspaceScope } from '../../../shopik-app/lib/domain/index.ts';
import type { EntityGraph, EntityKind, EntityRef, IdMapping, LocalCommand, LocalOperation, ServerPatch } from './model.ts';

// Local IDs are explicit client keys, never substitutes for server SHA256 product IDs.
export function isLocalId(value: string): value is `local:${string}` {
  return /^local:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}
export function validServerId(kind: EntityKind, id: string) { return kind === 'product' ? isProductId(id) : isWorkspaceId(id); }
export function table(graph: EntityGraph, kind: EntityKind) {
  switch (kind) { case 'category': return graph.categories; case 'tag': return graph.tags; case 'product': return graph.products; case 'expense': return graph.expenses; }
}
// Only declared entity references are resolved; user-entered text is never rewritten.
export function references(command: LocalCommand): EntityRef[] {
  switch (command.kind) {
    case 'category.create': case 'category.rename': case 'category.delete': return [{ kind: 'category', id: command.id }];
    case 'tag.create': case 'tag.delete': return [{ kind: 'tag', id: command.id }];
    case 'product.save': return [{ kind: 'product', id: command.id }, { kind: 'category', id: command.categoryId }, ...command.tagIds.map(id => ({ kind: 'tag' as const, id }))];
    case 'product.delete': return [{ kind: 'product', id: command.id }];
    case 'product.complete': return command.items.flatMap(item => [{ kind: 'product' as const, id: item.id }, { kind: 'expense' as const, id: item.expenseId }]);
    case 'expense.correct': return [{ kind: 'expense', id: command.id }];
  }
}
// The command retains its original client keys; the immutable wire representation resolves dependencies.
export function resolveCommand(command: LocalCommand, mappings: IdMapping[]): LocalCommand {
  const id = (kind: EntityKind, value: string) => mappings.find(item => item.kind === kind && item.localId === value)?.serverId ?? value;
  switch (command.kind) {
    case 'category.create': case 'category.rename': case 'category.delete': return { ...command, id: id('category', command.id) } as LocalCommand;
    case 'tag.create': case 'tag.delete': return { ...command, id: id('tag', command.id) } as LocalCommand;
    case 'product.save': return { ...command, id: id('product', command.id), categoryId: id('category', command.categoryId), tagIds: command.tagIds.map(value => id('tag', value)) };
    case 'product.delete': return { ...command, id: id('product', command.id) };
    case 'product.complete': return { ...command, items: command.items.map(item => ({ ...item, id: id('product', item.id) })) };
    case 'expense.correct': return { ...command, id: id('expense', command.id) };
  }
}
// Invalid amounts fail before any transaction writes its projection/outbox pair.
function amount(value: string): number {
  const result = parsePrice(value); if (result === null) throw new Error('Invalid amount'); return result;
}
function requireEntity<T>(value: T | undefined): T { if (!value) throw new Error('Entity unavailable'); return value; }

// Apply the same business validation as the web, allowing local category references before sync.
export function applyCommand(graph: EntityGraph, command: LocalCommand, scope: WorkspaceScope, occurredAt: string): EntityGraph {
  const next = structuredClone(graph);
  const common = { workspace_id: scope.workspaceId, created_by: scope.accountId, created_at: occurredAt, updated_at: occurredAt };
  for (const ref of references(command)) if (!isLocalId(ref.id) && !validServerId(ref.kind, ref.id)) throw new Error('Invalid entity key');
  switch (command.kind) {
    case 'category.create': {
      const name = categoryName(command.name);
      if (!name || !isLocalId(command.id) || next.categories[command.id]) throw new Error('Invalid new category');
      next.categories[command.id] = { ...common, id: command.id, name }; break;
    }
    case 'category.rename': {
      const category = requireEntity(next.categories[command.id]); const name = categoryName(command.name);
      if (!name || category.created_by !== scope.accountId) throw new Error('Category cannot be edited');
      next.categories[command.id] = { ...category, name, updated_at: occurredAt }; break;
    }
    case 'category.delete': {
      const category = requireEntity(next.categories[command.id]);
      if (category.created_by !== scope.accountId || Object.values(next.products).some(item => item.category_id === command.id)) throw new Error('Category is not empty or not owned');
      delete next.categories[command.id]; break;
    }
    case 'tag.create': {
      const tag = validateTag(command.name, command.color);
      if (!tag || !isLocalId(command.id) || next.tags[command.id]) throw new Error('Invalid new tag');
      next.tags[command.id] = { ...common, id: command.id, ...tag }; break;
    }
    case 'tag.delete':
      requireEntity(next.tags[command.id]); delete next.tags[command.id];
      for (const key of Object.keys(next.productTags)) next.productTags[key] = next.productTags[key].filter(id => id !== command.id);
      // Historical expense tags deliberately retain their original names/colors.
      break;
    case 'product.save': {
      const existing = next.products[command.id];
      if (!existing && !isLocalId(command.id)) throw new Error('Unknown server product');
      if (existing?.status === 'completed') throw new Error('Completed product');
      requireEntity(next.categories[command.categoryId]);
      command.tagIds.forEach(id => requireEntity(next.tags[id]));
      if (new Set(command.tagIds).size !== command.tagIds.length) throw new Error('Duplicate tags');
      const validated = validateProduct({ ...command, category_id: '00000000-0000-0000-0000-000000000000' });
      if (!validated.ok) throw new Error('Invalid product fields');
      next.products[command.id] = { ...common, ...existing, ...validated.value, category_id: command.categoryId, id: command.id, currency: 'UAH', status: 'active', updated_at: occurredAt };
      next.productTags[command.id] = [...command.tagIds]; break;
    }
    case 'product.delete': {
      const product = requireEntity(next.products[command.id]);
      if (product.status !== 'active') throw new Error('Completed product');
      delete next.products[command.id]; delete next.productTags[command.id]; break;
    }
    case 'product.complete': {
      if (!command.items.length || command.items.length > 500 || new Set(command.items.map(item => item.id)).size !== command.items.length) throw new Error('Invalid completion batch');
      for (const item of command.items) {
        const product = requireEntity(next.products[item.id]); const category = requireEntity(next.categories[product.category_id]);
        if (product.status !== 'active' || !isLocalId(item.expenseId) || next.expenses[item.expenseId]) throw new Error('Invalid completion');
        next.products[item.id] = { ...product, status: 'completed' };
        next.expenses[item.expenseId] = { id: item.expenseId, workspace_id: scope.workspaceId, product_id: product.id,
          category_id: product.category_id, category_name: category.name, name: product.name, amount: amount(item.amount),
          planned_amount: productTotal(product), currency: 'UAH', occurred_at: occurredAt, created_by: scope.accountId,
          tags: (next.productTags[product.id] ?? []).map(id => structuredClone(requireEntity(next.tags[id]))) };
      } break;
    }
    case 'expense.correct': {
      const expense = requireEntity(next.expenses[command.id]);
      if (expense.archived || expense.created_by !== scope.accountId) throw new Error('Expense cannot be corrected');
      next.expenses[command.id] = { ...expense, amount: amount(command.amount) }; break;
    }
    default: throw new Error('Unsupported command');
  }
  return next;
}

// A pending expense is visible without claiming that the whole historical month was downloaded.
export function expensePeriod(graph: EntityGraph, month: string) {
  if (!isExpenseMonth(month)) throw new Error('Invalid month');
  return { downloaded: graph.knownMonths.includes(month), items: Object.values(graph.expenses).filter(item => currentKyivMonth(new Date(item.occurred_at)) === month) };
}
// Validate a server graph before replaying local intentions over it.
export function applyServerPatch(graph: EntityGraph, patch: ServerPatch, scope: WorkspaceScope): EntityGraph {
  const next = structuredClone(graph);
  for (const kind of ['category', 'tag', 'product', 'expense'] as const) {
    const rows = kind === 'category' ? patch.categories : kind === 'tag' ? patch.tags : kind === 'product' ? patch.products : patch.expenses;
    for (const row of rows ?? []) {
      if (row.workspace_id !== scope.workspaceId || !validServerId(kind, row.id)) throw new Error('Invalid server entity/scope');
      Object.assign(table(next, kind), { [row.id]: structuredClone(row) });
    }
  }
  for (const ref of patch.removed ?? []) {
    delete table(next, ref.kind)[ref.id];
    if (ref.kind === 'product') delete next.productTags[ref.id];
    if (ref.kind === 'tag') for (const product of Object.keys(next.productTags)) next.productTags[product] = next.productTags[product].filter(id => id !== ref.id);
  }
  for (const relation of patch.productTags ?? []) {
    requireEntity(next.products[relation.productId]); relation.tagIds.forEach(id => requireEntity(next.tags[id]));
    next.productTags[relation.productId] = [...new Set(relation.tagIds)];
  }
  for (const month of patch.knownMonths ?? []) { if (!isExpenseMonth(month)) throw new Error('Invalid loaded month'); }
  next.knownMonths = [...new Set([...next.knownMonths, ...patch.knownMonths ?? []])];
  if (patch.bootstrapped !== undefined) next.bootstrapped = patch.bootstrapped;
  return next;
}
// Rebuild instead of overwriting an optimistic graph when server confirmations arrive.
export function replay(confirmed: EntityGraph, operations: LocalOperation[], mappings: IdMapping[], scope: WorkspaceScope) {
  return operations.filter(item => item.state !== 'acknowledged').sort((a,b) => a.sequence - b.sequence)
    .reduce((graph, operation) => applyCommand(graph, resolveCommand(operation.command, mappings), scope, operation.occurredAt), structuredClone(confirmed));
}
