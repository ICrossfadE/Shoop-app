import { NextResponse, type NextRequest } from 'next/server';
import { workspaceClient } from '@/lib/workspace';
import { isWorkspaceId } from '@/lib/products';
import { readTagFilter } from '@/lib/tags';
import { isExpenseMonth } from '@/lib/expenses';

// Each private read checks current membership and RLS; HTTP caching is disabled.
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const wid = p.get('workspace') ?? '', kind = p.get('kind'), category = p.get('category'), month = p.get('month');
  const tags = readTagFilter(p.getAll('tag'));
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (!isWorkspaceId(wid) || !tags || (kind !== 'products' && kind !== 'expenses') || (kind === 'products' && !isWorkspaceId(category)) || (kind === 'expenses' && !isExpenseMonth(month))) return reply({ error: 'Некоректний фільтр.' }, 400);
  const client = await workspaceClient(wid);
  if (!client) return reply({ error: 'Немає доступу.' }, 403);
  const { data, error } = await client.rpc('list_snapshot', { p_workspace_id: wid, p_kind: kind, p_category_id: kind === 'products' ? category : null, p_month: kind === 'expenses' ? month+'-01' : null, p_tag_ids: tags });
  if (error || !data) return reply({ error: 'Не вдалося завантажити дані.' }, error?.code === '42501' ? 403 : 503);
  return reply(data);
}
