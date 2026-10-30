import { requireWorkspace } from './workspace';
import { readTheme } from './server-theme';
import { isWorkspaceId } from './products';
import { readTagFilter } from './tags';
import { currentKyivMonth, isExpenseMonth } from './expenses';
import type { Screen, WorkspaceBoot } from './workspace-boot';
import WorkspaceApp from '@/app/components/WorkspaceApp';

// Every direct URL remains authenticated and server-rendered. The same client
// shell subsequently switches views without requesting another server page.
export async function loadWorkspaceApp(screen: Screen, requested: { category?: string; month?: string; tag?: string | string[] } = {}) {
  const { supabase, workspace, account, email, userId } = await requireWorkspace();
  const [categories, tags, theme] = await Promise.all([
    supabase.from('categories').select('*').eq('workspace_id', workspace.workspace_id).order('created_at').order('id'),
    supabase.from('tags').select('*').eq('workspace_id', workspace.workspace_id).order('name').order('id'), readTheme(),
  ]);
  const selected = isWorkspaceId(requested.category) && categories.data?.some((item) => item.id === requested.category) ? requested.category : categories.data?.[0]?.id ?? '';
  const selectedTags = readTagFilter(requested.tag);
  const invalid = selectedTags === null || selectedTags.some((id) => !tags.data?.some((tag) => tag.id === id));
  const month = isExpenseMonth(requested.month) ? requested.month : currentKyivMonth();
  const kind = screen === 'expenses' ? 'expenses' : 'products';
  const result = screen !== 'settings' && !invalid && !tags.error && !categories.error && (kind === 'expenses' || selected)
    ? await supabase.rpc('list_snapshot', { p_workspace_id: workspace.workspace_id, p_kind: kind, p_category_id: kind === 'products' ? selected : null, p_month: kind === 'expenses' ? month+'-01' : null, p_tag_ids: selectedTags ?? [] })
    : { data: null, error: null };
  const boot: WorkspaceBoot = { userId, workspace, account, email, categories: categories.data ?? [], tags: tags.data ?? [], categoriesError: !!categories.error, tagsError: !!tags.error, theme,
    initialFilter: { kind, category: selected, month: kind === 'expenses' ? month : '', tags: selectedTags ?? [] }, initial: result.data ?? undefined, loadError: invalid || !!result.error || !!categories.error || !!tags.error };
  return <WorkspaceApp key={userId+':'+workspace.workspace_id+':'+Date.now()} boot={boot} />;
}
