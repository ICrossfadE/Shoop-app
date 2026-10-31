import { workspaceClient } from './workspace';
import { isWorkspaceId } from './products';
import type { MutationResult } from './list-model';

// Postgres errors roll back; a transport failure may have committed. Retain the key.
export async function operation(workspaceId: string, operationId: string, kind: string, payload: Record<string, unknown>): Promise<MutationResult> {
  if (!isWorkspaceId(operationId)) return { ok: false, error: 'Некоректний ключ операції.' };
  try {
    const client = await workspaceClient(workspaceId);
    if (!client) return { ok: false, error: 'Немає доступу. Оновіть сторінку.', accessLost: true };
    if ((kind === 'save_product' || kind === 'delete_product' || kind === 'save_category' || kind === 'delete_category') && payload.id) {
      const session = await client.auth.getClaims();
      const table = kind.endsWith('category') ? 'categories' : 'products';
      const record = await client.from(table).select('created_by').eq('workspace_id',workspaceId).eq('id',String(payload.id)).maybeSingle();
      // A deletion replay can refer to a missing record; the receipt RPC decides that case.
      if (record.error || (record.data && record.data.created_by !== session.data?.claims.sub)) return {ok:false,error:'Змінювати або видаляти запис може лише його автор.'};
    }
    const { data, error } = await client.rpc('apply_operation', { p_workspace_id: workspaceId, p_operation_id: operationId, p_kind: kind, p_payload: payload });
    if (error) {
      const messages: Record<string, string> = {
        '23505': 'Така назва вже існує.',
        '23001': 'Категорія містить продукти й не може бути видалена.',
        '23503': 'Категорія містить продукти або вибрана категорія чи тег недоступні.',
        '23514': 'Перевірте дані. Завершений продукт можна лише видалити.',
        '42501': 'Немає доступу до запису. Оновіть сторінку.',
        '22023': 'Дані або ключ операції некоректні. Повторіть початкову дію.',
        'PGRST202': 'Потрібно застосувати міграцію 008 у Supabase.',
      };
      return { ok: false, error: messages[error.code] ?? 'Результат збереження невідомий. Повторіть з тими самими даними.', accessLost: error.code === '42501' && error.message === 'Workspace access denied', ambiguous: !messages[error.code] };
    }
    if (!data) return { ok: false, error: 'Результат збереження невідомий. Повторіть спробу.', ambiguous: true };
    return { ok: true, data };
  } catch { return { ok: false, error: 'Немає відповіді сервера. Повторіть спробу з тими самими даними.', ambiguous: true }; }
}
