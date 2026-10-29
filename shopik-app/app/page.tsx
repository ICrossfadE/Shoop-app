import { requireWorkspace } from '@/lib/workspace';
import { isWorkspaceId } from '@/lib/products';
import { readTagFilter } from '@/lib/tags';
import ProductList from './components/ProductList';

export const dynamic = 'force-dynamic';

// All filters are applied in Postgres, including every selected tag (AND).
export default async function Home({ searchParams }: { searchParams: Promise<{ category?: string; tag?: string | string[] }> }) {
  const { supabase, workspace, email, account } = await requireWorkspace();
  const { category, tag } = await searchParams;
  const selectedTags = readTagFilter(tag);
  const [categoryResult, tagResult, authorResult] = await Promise.all([
    supabase.from('categories').select('*').eq('workspace_id', workspace.workspace_id).order('created_at').order('id'),
    supabase.from('tags').select('*').eq('workspace_id', workspace.workspace_id).order('name').order('id'),
    supabase.rpc('workspace_product_authors', { p_workspace_id: workspace.workspace_id }),
  ]);
  const categories = categoryResult.data ?? [];
  const tags = tagResult.data ?? [];
  const invalidTags = selectedTags === null || selectedTags.some((id) => !tags.some((item) => item.id === id));
  const selected = isWorkspaceId(category) && categories.some((item) => item.id === category) ? category : categories[0]?.id ?? '';
  const result = selected && !categoryResult.error && !tagResult.error && !invalidTags
    ? await supabase.rpc('filtered_products', { p_workspace_id: workspace.workspace_id, p_category_id: selected, p_tag_ids: selectedTags ?? [] })
    : { data: [], error: null };
  const loadError = invalidTags ? 'Один із тегів недоступний. Скиньте фільтр і виберіть теги знову.'
    : categoryResult.error || tagResult.error || result.error || authorResult.error ? 'Не вдалося завантажити дані. Спробуйте знову.' : null;
  return <ProductList workspaceId={workspace.workspace_id} workspaceName={workspace.workspace_name}
    categories={categories} tags={tags} selectedTags={selectedTags ?? []} selectedCategory={selected}
    products={result.data ?? []} authors={authorResult.data ?? []} account={account} loadError={loadError} role={workspace.member_role} email={email} />;
}
