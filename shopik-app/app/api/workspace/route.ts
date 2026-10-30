import { NextResponse, type NextRequest } from 'next/server';
import { workspaceClient } from '@/lib/workspace';
import { readTheme } from '@/lib/server-theme';
import { isWorkspaceId } from '@/lib/products';

// Metadata refresh is private and verifies current membership on every request.
export async function GET(request: NextRequest) {
  const wid = request.nextUrl.searchParams.get('workspace');
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (!isWorkspaceId(wid)) return reply({ error: 'Некоректний простір.' }, 400);
  const client = await workspaceClient(wid);
  if (!client) return reply({ error: 'Немає доступу.' }, 403);
  const [categories, tags, theme] = await Promise.all([
    client.from('categories').select('*').eq('workspace_id', wid).order('created_at').order('id'),
    client.from('tags').select('*').eq('workspace_id', wid).order('name').order('id'), readTheme(),
  ]);
  if (categories.error || tags.error || theme.error) return reply({ error: 'Не вдалося оновити довідники.' }, 503);
  return reply({ categories: categories.data, tags: tags.data, theme, userId: theme.userId });
}
