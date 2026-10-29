import Link from 'next/link';
import { requireWorkspace } from '@/lib/workspace';
import SignOutButton from '../components/SignOutButton';
import TagManager from './TagManager';

export const dynamic = 'force-dynamic';
// Derive access server-side and keep failures distinct from an empty tag list.
export default async function TagsPage() {
  const { supabase, workspace } = await requireWorkspace();
  const { data, error } = await supabase.from('tags').select('*').eq('workspace_id', workspace.workspace_id).order('name').order('id');
  return <div className="flex flex-1 flex-col bg-zinc-50 text-zinc-900">
    {/* Same navigation on all authenticated pages. */}
    <header className="bg-zinc-900 text-white"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-4"><Link href="/" className="text-2xl font-bold">Shopik</Link><nav aria-label="Основна навігація" className="flex flex-wrap gap-4"><Link href="/">Продукти</Link><Link href="/expenses">Витрати</Link><Link href="/tags" aria-current="page">Теги</Link></nav><SignOutButton /></div></header>
    <main className="mx-auto w-full max-w-3xl space-y-5 px-5 py-6"><h1 className="text-2xl font-semibold">Теги</h1><p>{workspace.workspace_name}</p>
      {error ? <section role="alert" className="rounded bg-red-50 p-4 text-red-800"><p>Не вдалося завантажити теги.</p><Link className="underline" href="/tags">Спробувати знову</Link></section> : <TagManager workspaceId={workspace.workspace_id} tags={data ?? []} />}
    </main>
  </div>;
}
