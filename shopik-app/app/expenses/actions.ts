'use server';
import { workspaceClient } from '@/lib/workspace';
import { isWorkspaceId } from '@/lib/products';
import { parsePrice } from '@/lib/money';
import type { MutationResult } from '@/lib/list-model';

// RPC checks membership, authorship and archive status after obtaining its lock.
export async function correctExpensePrice(workspaceId: string, expenseId: string, operationId: string, price: string, expected: number): Promise<MutationResult> {
  const amount = parsePrice(price);
  if (!isWorkspaceId(workspaceId) || !isWorkspaceId(expenseId) || !isWorkspaceId(operationId) || amount === null || !Number.isFinite(expected)) return { ok: false, error: 'Вкажіть ціну від 0 до 99 999 999,99 грн, до двох знаків після коми.' };
  try {
    const client = await workspaceClient(workspaceId);
    if (!client) return { ok: false, error: 'Немає доступу до простору.', accessLost: true };
    const result = await client.rpc('correct_expense_price', { p_workspace_id: workspaceId, p_expense_id: expenseId, p_operation_id: operationId, p_amount: amount, p_expected_amount: expected });
    if (result.error) {
      const messages: Record<string, string> = {
        '40001': 'Ціна вже змінилася. Закрийте форму й оновіть витрати.',
        '42501': 'Змінювати можна лише власні неархівні витрати.',
        '22023': 'Некоректна ціна або ключ повторної операції.',
        'PGRST202': 'Потрібно застосувати міграцію 013 у Supabase.',
      };
      return { ok: false, error: messages[result.error.code] ?? 'Результат невідомий. Повторіть з тими самими даними.', ambiguous: !messages[result.error.code], accessLost: result.error.message === 'Workspace access denied' };
    }
    return { ok: true, data: { expense: { id: expenseId, amount: result.data } } };
  } catch { return { ok: false, error: 'Немає відповіді. Повторіть з тими самими даними.', ambiguous: true }; }
}
