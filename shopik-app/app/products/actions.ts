'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isProductId, isWorkspaceId, validateProduct, type ProductFields, type ProductResult } from '@/lib/products';

// Recheck identity and membership for every mutation; RLS also enforces access.
async function productContext(workspaceId: string) {
  if (!isWorkspaceId(workspaceId)) return null;
  const supabase = await createClient(true);
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return null;
  const { data: membership, error: memberError } = await supabase.from('workspace_members')
    .select('role').eq('workspace_id', workspaceId).eq('user_id', data.claims.sub).maybeSingle();
  return !memberError && membership ? supabase : null;
}

// Save only editable fields. Author, SHA256 ID and timestamps come from Postgres.
export async function saveProduct(workspaceId: string, productId: string | null, input: ProductFields): Promise<ProductResult> {
  const parsed = validateProduct(input);
  if (!parsed.ok) return { ok: false, error: 'Перевірте поля форми.', fields: parsed.fields };
  if (productId !== null && !isProductId(productId)) return { ok: false, error: 'Некоректний продукт.' };
  try {
    const supabase = await productContext(workspaceId);
    if (!supabase) return { ok: false, error: 'Сесія завершилась або немає доступу до простору. Оновіть сторінку.' };
    const query = productId === null
      ? supabase.from('products').insert({ ...parsed.value, workspace_id: workspaceId })
      : supabase.from('products').update(parsed.value).eq('id', productId).eq('workspace_id', workspaceId);
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data) return { ok: false, error: 'Не вдалося зберегти продукт. Оновіть список і спробуйте знову.' };
  } catch {
    return { ok: false, error: 'Немає з’єднання. Введені дані залишились у формі.' };
  }
  revalidatePath('/');
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
  return { ok: true };
}
