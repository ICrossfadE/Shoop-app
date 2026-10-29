
import { requireWorkspace } from '@/lib/workspace';
import AppHeader from '../components/AppHeader';
import RetryLoad from '../components/RetryLoad';
import TagManager from './TagManager';

export const dynamic = 'force-dynamic';
// Derive access server-side and keep failures distinct from an empty tag list.
export default async function TagsPage() {
  const { supabase, workspace, account } = await requireWorkspace();
  const { data, error } = await supabase.from('tags').select('*').eq('workspace_id', workspace.workspace_id).order('name').order('id');
  return <div className="flex flex-1 flex-col bg-zinc-50 text-zinc-900">
    {/* Same navigation on all authenticated pages. */}
    <AppHeader account={account} page="tags" />
    <main className="mx-auto w-full max-w-3xl space-y-5 px-5 py-6"><h1 className="text-2xl font-semibold">Теги</h1><p>{workspace.workspace_name}</p>
      {error ? <section role="alert" className="rounded bg-red-50 p-4 text-red-800"><p>Не вдалося завантажити теги.</p><RetryLoad /></section> : <TagManager workspaceId={workspace.workspace_id} tags={data ?? []} />}
    </main>
  </div>;
}
