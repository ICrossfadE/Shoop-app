'use server';
import { isProductId, validateProduct, type ProductFields } from '@/lib/products';
import { parseTagIds } from '@/lib/tags';
import { operation } from '@/lib/operations';
import type { MutationResult } from '@/lib/list-model';

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
