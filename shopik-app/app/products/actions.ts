'use server';

import { revalidatePath } from 'next/cache';
import { workspaceClient as productContext } from '@/lib/workspace';
import { isProductId, validateProduct, type ProductFields, type ProductResult } from '@/lib/products';
import { parseTagIds } from '@/lib/tags';

// Save only editable fields. Author, SHA256 ID and timestamps come from Postgres.
export async function saveProduct(workspaceId: string, productId: string | null, input: ProductFields): Promise<ProductResult> {
  const parsed = validateProduct(input);
  if (!parsed.ok) return { ok: false, error: 'Перевірте поля форми.', fields: parsed.fields };
  if (productId !== null && !isProductId(productId)) return { ok: false, error: 'Некоректний продукт.' };
  const tagIds = parseTagIds(input.tag_ids);
  if (!tagIds) return { ok: false, error: 'Некоректні теги.', fields: { tag_ids: 'Оновіть теги та виберіть їх знову.' } };
  try {
    const supabase = await productContext(workspaceId);
    if (!supabase) return { ok: false, error: 'Сесія завершилась або немає доступу до простору. Оновіть сторінку.' };
    // RPC makes field changes and all tag replacements a single transaction.
    const { data, error } = await supabase.rpc('save_product_tags', {
      p_workspace_id: workspaceId, p_product_id: productId,
      p_name: parsed.value.name, p_description: parsed.value.description, p_price: parsed.value.price,
      p_category_id: parsed.value.category_id, p_tag_ids: tagIds,
    });
    if (error || !data) return { ok: false, error: error?.code === '23503' || error?.code === '22023' ? 'Категорія або теги недоступні. Оновіть список і виберіть їх знову.' : 'Не вдалося зберегти продукт. Оновіть список і спробуйте знову.' };
  } catch {
    return { ok: false, error: 'Немає з’єднання. Введені дані залишились у формі.' };
  }
  revalidatePath('/');
  revalidatePath('/expenses');
  return { ok: true };
}

// Set an explicit status so repeated clicks cannot accidentally toggle it back.
export async function setProductStatus(workspaceId: string, productId: string, status: 'active' | 'completed'): Promise<ProductResult> {
  if (!isProductId(productId) || !['active', 'completed'].includes(status)) return { ok: false, error: 'Некоректний продукт або статус.' };
  try {
    const supabase = await productContext(workspaceId);
    if (!supabase) return { ok: false, error: 'Немає доступу. Оновіть сторінку.' };
    const { data, error } = await supabase.from('products').update({ status })
      .eq('id', productId).eq('workspace_id', workspaceId).select('id').maybeSingle();
    if (error || !data) return { ok: false, error: 'Не вдалося змінити статус. Оновіть список.' };
  } catch {
    return { ok: false, error: 'Не вдалося підключитися. Спробуйте знову.' };
  }
  revalidatePath('/');
  revalidatePath('/expenses');
  return { ok: true };
}

// Delete only the requested row in a Workspace the current user can access.
export async function deleteProduct(workspaceId: string, productId: string): Promise<ProductResult> {
  if (!isProductId(productId)) return { ok: false, error: 'Некоректний продукт.' };
  try {
    const supabase = await productContext(workspaceId);
    if (!supabase) return { ok: false, error: 'Немає доступу. Оновіть сторінку.' };
    const { data, error } = await supabase.from('products').delete()
      .eq('id', productId).eq('workspace_id', workspaceId).select('id').maybeSingle();
    if (error || !data) return { ok: false, error: 'Продукт не знайдено або немає доступу. Оновіть список.' };
  } catch {
    return { ok: false, error: 'Не вдалося видалити продукт. Спробуйте знову.' };
  }
  revalidatePath('/');
  revalidatePath('/expenses');
  return { ok: true };
}
