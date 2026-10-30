'use server';
import { categoryName } from '@/lib/categories';
import { isWorkspaceId } from '@/lib/products';
import { operation } from '@/lib/operations';
import type { MutationResult } from '@/lib/list-model';

// Postgres retains nonempty-category and unique-name checks.
export async function saveCategory(workspaceId: string, id: string | null, input: string, operationId: string): Promise<MutationResult> {
  const name = categoryName(input);
  if (!name || (id !== null && !isWorkspaceId(id))) return { ok: false, error: 'Вкажіть назву категорії від 1 до 120 символів.' };
  const result = await operation(workspaceId, operationId, 'save_category', { id, name });
  return result;
}
export async function deleteCategory(workspaceId: string, id: string, operationId: string): Promise<MutationResult> {
  if (!isWorkspaceId(id)) return { ok: false, error: 'Некоректна категорія.' };
  const result = await operation(workspaceId, operationId, 'delete_category', { id });
  return result;
}
