'use server';
import { isProductId, validateProduct, type ProductFields } from '@/lib/products';
import { parseTagIds } from '@/lib/tags';
import { operation } from '@/lib/operations';
import type { MutationResult } from '@/lib/list-model';
import { isWorkspaceId } from '@/lib/products';
import { workspaceClient } from '@/lib/workspace';

// Canonical response replaces the changed card without a broad page re-render.
export async function saveProduct(workspaceId: string, productId: string | null, input: ProductFields, operationId: string): Promise<MutationResult> {
  const parsed = validateProduct(input);
  if (!parsed.ok) return { ok: false, error: 'Перевірте поля форми.', fields: parsed.fields };
  const tagIds = parseTagIds(input.tag_ids);
  if (!tagIds || (productId !== null && !isProductId(productId))) return { ok: false, error: 'Некоректні продукт або теги.' };
  return operation(workspaceId, operationId, 'save_product', { id: productId, ...parsed.value, tag_ids: tagIds });
}
export async function setProductStatus(workspaceId: string, productId: string, status: 'completed', operationId: string): Promise<MutationResult> {
  if (!isProductId(productId) || status !== 'completed') return { ok: false, error: 'Некоректний продукт або статус.' };
  return operation(workspaceId, operationId, 'complete_product', { id: productId });
}
export async function deleteProduct(workspaceId: string, productId: string, operationId: string): Promise<MutationResult> {
  if (!isProductId(productId)) return { ok: false, error: 'Некоректний продукт.' };
  return operation(workspaceId, operationId, 'delete_product', { id: productId });
}

// Validate the confirmation snapshot; PostgreSQL rechecks current values atomically.
export async function completeProducts(workspaceId: string, operationId: string, items: { id: string; amount: number; updated_at: string }[]): Promise<MutationResult> {
  if (!isWorkspaceId(workspaceId) || !isWorkspaceId(operationId) || !Array.isArray(items) || items.length < 1 || items.length > 500 || items.some(item => !item || !isProductId(item.id) || !Number.isFinite(item.amount) || item.amount < 0 || item.amount > 99999999.99 || typeof item.updated_at !== 'string' || !Number.isFinite(Date.parse(item.updated_at)))) return { ok: false, error: 'Некоректний набір покупок (від 1 до 500).' };
  try {
    const client = await workspaceClient(workspaceId);
    if (!client) return { ok: false, error: 'Немає доступу до простору.', accessLost: true };
    const { data, error } = await client.rpc('complete_products', { p_workspace_id: workspaceId, p_operation_id: operationId, p_items: items.map(({ id, amount, updated_at }) => ({ id, amount, updated_at })) });
    if (error) {
      const messages: Record<string, string> = { '40001': 'Покупки змінилися. Закрийте підтвердження та виберіть їх знову.', '42501': 'Немає доступу до покупок.', '22023': 'Некоректний набір або ключ операції.', 'PGRST202': 'Потрібно застосувати міграцію 015 у Supabase.' };
      return { ok: false, error: messages[error.code] ?? 'Результат невідомий. Повторіть той самий набір.', ambiguous: !messages[error.code], accessLost: error.message === 'Workspace access denied' };
    }
    return data ? { ok: true, data } : { ok: false, error: 'Результат невідомий. Повторіть той самий набір.', ambiguous: true };
  } catch { return { ok: false, error: 'Немає відповіді. Повторіть той самий набір.', ambiguous: true }; }
}
