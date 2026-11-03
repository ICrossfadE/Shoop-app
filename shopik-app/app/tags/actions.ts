'use server';
import { validateTag } from '@/lib/tags';
import { operation } from '@/lib/operations';
import type { MutationResult } from '@/lib/list-model';
import { isWorkspaceId } from '@/lib/products';

// Identity and timestamps remain database-owned.
export async function createTag(workspaceId: string, name: string, color: string, operationId: string): Promise<MutationResult> {
  const parsed = validateTag(name, color);
  if (!parsed) return { ok: false, error: 'Вкажіть назву від 1 до 120 символів і колір #RRGGBB.' };
  const result = await operation(workspaceId, operationId, 'create_tag', parsed);
  return result;
}

// Deleting the catalog tag preserves immutable expense snapshots in PostgreSQL.
export async function deleteTag(workspaceId: string, tagId: string, operationId: string): Promise<MutationResult> {
  if (!isWorkspaceId(tagId)) return { ok: false, error: 'Некоректний тег.' };
  return operation(workspaceId, operationId, 'delete_tag', { id: tagId });
}
