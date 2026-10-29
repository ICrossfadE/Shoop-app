import { redirect } from 'next/navigation';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import ProductList from './components/ProductList';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!getSupabaseConfig()) redirect('/login');
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) redirect('/login');

  // Identity comes from auth.uid() in the RPC, never request parameters.
  const { data: workspaces, error: workspaceError } = await supabase.rpc('ensure_personal_workspace');
  if (workspaceError || !workspaces?.[0]) {
    throw new Error('Unable to initialize personal workspace.');
  }
  const workspace = workspaces[0];
  // Read persisted products only from the authenticated user's Workspace.
  const { data: products, error: productsError } = await supabase.from('products').select('*')
    .eq('workspace_id', workspace.workspace_id).order('created_at', { ascending: false }).order('id');
  const loadError = productsError
    ? 'Не вдалося завантажити продукти. Спробуйте оновити список.'
    : null;
  return <ProductList workspaceId={workspace.workspace_id} workspaceName={workspace.workspace_name}
    products={products ?? []} loadError={loadError} role={workspace.member_role}
    email={typeof data.claims.email === 'string' ? data.claims.email : ''} />;
}
