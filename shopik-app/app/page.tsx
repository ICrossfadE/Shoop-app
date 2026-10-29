import { requireWorkspace } from '@/lib/workspace';
import { isWorkspaceId } from '@/lib/products';
import ProductList from './components/ProductList';

export const dynamic = 'force-dynamic';

// Read only the selected category in the server-derived Workspace.
export default async function Home({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { supabase, workspace, email } = await requireWorkspace();
  const { category } = await searchParams;
  const { data: categories, error: categoriesError } = await supabase.from('categories').select('*')
    .eq('workspace_id', workspace.workspace_id).order('created_at').order('id');
  const selected = isWorkspaceId(category) && categories?.some((item) => item.id === category) ? category : categories?.[0]?.id ?? '';
  const result = selected && !categoriesError
    ? await supabase.from('products').select('*').eq('workspace_id', workspace.workspace_id)
      .eq('category_id', selected).order('created_at', { ascending: false }).order('id')
    : { data: [], error: null };
  const loadError = categoriesError || result.error ? 'Не вдалося завантажити категорії або продукти. Оновіть список.' : null;
  return <ProductList workspaceId={workspace.workspace_id} workspaceName={workspace.workspace_name}
    categories={categories ?? []} selectedCategory={selected} products={result.data ?? []} loadError={loadError}
    role={workspace.member_role} email={email} />;
}
