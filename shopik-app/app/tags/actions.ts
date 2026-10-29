'use server';
import { revalidatePath } from 'next/cache';
import { workspaceClient } from '@/lib/workspace';
import { validateTag } from '@/lib/tags';
import type { ProductResult } from '@/lib/products';

// Only a member can create a tag; ownership is derived by the database.
export async function createTag(workspaceId: string, name: string, color: string): Promise<ProductResult> {
  const parsed = validateTag(name, color);
  if (!parsed) return { ok: false, error: 'Вкажіть назву від 1 до 120 символів і колір у форматі #RRGGBB.' };
  try {
    const client = await workspaceClient(workspaceId);
    if (!client) return { ok: false, error: 'Немає доступу. Оновіть сторінку.' };
    const { data, error } = await client.from('tags').insert({ workspace_id: workspaceId, ...parsed }).select('id').maybeSingle();
    if (error || !data) return { ok: false, error: error?.code === '23505' ? 'Тег із такою назвою вже існує.' : 'Не вдалося створити тег.' };
  } catch { return { ok: false, error: 'Немає з’єднання. Спробуйте знову.' }; }
  revalidatePath('/tags'); revalidatePath('/'); revalidatePath('/settings'); revalidatePath('/expenses');
  return { ok: true };
}
