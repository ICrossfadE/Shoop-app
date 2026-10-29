'use server';

import { revalidatePath } from 'next/cache';
import { workspaceClient } from '@/lib/workspace';
import { categoryName } from '@/lib/categories';
import { isWorkspaceId, type ProductResult } from '@/lib/products';

// Only a name is editable; RLS restricts the Workspace and author.
export async function saveCategory(workspaceId: string, id: string | null, input: string): Promise<ProductResult> {
  const name = categoryName(input);
  if (!name || (id !== null && !isWorkspaceId(id))) return { ok: false, error: 'Вкажіть назву категорії від 1 до 120 символів.' };
  try {
    const client = await workspaceClient(workspaceId);
    if (!client) return { ok: false, error: 'Немає доступу. Оновіть сторінку.' };
    const query = id === null ? client.from('categories').insert({ workspace_id: workspaceId, name })
      : client.from('categories').update({ name }).eq('id', id).eq('workspace_id', workspaceId);
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data) return { ok: false, error: error?.code === '23505' ? 'Категорія з такою назвою вже існує.' : 'Не вдалося зберегти категорію.' };
  } catch { return { ok: false, error: 'Немає з’єднання. Спробуйте знову.' }; }
  revalidatePath('/'); revalidatePath('/settings');
  return { ok: true };
}

// Let the foreign key reject nonempty deletion atomically, including concurrent inserts.
export async function deleteCategory(workspaceId: string, id: string): Promise<ProductResult> {
  if (!isWorkspaceId(id)) return { ok: false, error: 'Некоректна категорія.' };
  try {
    const client = await workspaceClient(workspaceId);
    if (!client) return { ok: false, error: 'Немає доступу. Оновіть сторінку.' };
    const { data, error } = await client.from('categories').delete().eq('id', id).eq('workspace_id', workspaceId).select('id').maybeSingle();
    if (error || !data) return { ok: false, error: error?.code === '23503' ? 'Категорія містить активні або завершені продукти. Завершені покупки можна видалити на сторінці витрат.' : 'Не вдалося видалити категорію. Спробуйте знову.' };
  } catch { return { ok: false, error: 'Немає з’єднання. Спробуйте знову.' }; }
  revalidatePath('/'); revalidatePath('/settings');
  return { ok: true };
}
