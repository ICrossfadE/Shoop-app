import { requireWorkspace } from '@/lib/workspace';
import { readTheme } from '@/lib/server-theme';
import AppHeader from '../components/AppHeader';
import Avatar from '../components/Avatar';
import SignOutButton from '../components/SignOutButton';
import RetryLoad from '../components/RetryLoad';
import CategoryManager from '../components/CategoryManager';
import TagManager from '../tags/TagManager';
import ThemePicker from './ThemePicker';

export const dynamic = 'force-dynamic';
// Sections fail independently, leaving session controls accessible on errors.
export default async function SettingsPage() {
  const { supabase, workspace, account, email } = await requireWorkspace();
  const [tags, categories, theme] = await Promise.all([
    supabase.from('tags').select('*').eq('workspace_id', workspace.workspace_id).order('name').order('id'),
    supabase.from('categories').select('*').eq('workspace_id', workspace.workspace_id).order('created_at').order('id'),
    readTheme(),
  ]);
  return <div className="flex flex-1 flex-col bg-page text-foreground">
    <AppHeader account={account} page="settings" />
    <main className="mx-auto w-full max-w-3xl space-y-6 px-5 py-6">
      <h1 className="text-2xl font-semibold">Налаштування акаунта</h1>
      {/* Personal account and logout, separate from shared Workspace management. */}
      <section id="account" aria-labelledby="account-title" className="space-y-4 rounded-lg bg-surface p-5 shadow-sm">
        <h2 id="account-title" className="text-lg font-semibold">Акаунт</h2>
        <div className="flex min-w-0 items-center gap-3"><Avatar name={account.name} url={account.avatar_url} /><div className="min-w-0"><p className="break-words font-medium">{account.name}</p><p className="break-all text-sm text-muted">{email}</p></div></div>
        <SignOutButton />
      </section>
      <section id="appearance" aria-labelledby="appearance-title" className="space-y-4 rounded-lg bg-surface p-5 shadow-sm">
        <h2 id="appearance-title" className="text-lg font-semibold">Колірна тема</h2>
        {theme.error ? <div role="alert"><p>Не вдалося завантажити особисту тему.</p><RetryLoad /></div> : <ThemePicker key={theme.userId} initial={theme.theme} />}
      </section>
      {/* These sections manage shared data in the current Workspace. */}
      <section id="tags" aria-labelledby="settings-tags-title" className="scroll-mt-4 space-y-3">
        <h2 id="settings-tags-title" className="text-lg font-semibold">Теги</h2><p className="text-sm text-muted">Простір: {workspace.workspace_name}</p>
        {tags.error ? <div role="alert"><p>Не вдалося завантажити теги.</p><RetryLoad /></div> : <TagManager workspaceId={workspace.workspace_id} tags={tags.data ?? []} />}
      </section>
      <section id="categories" aria-labelledby="settings-categories-title" className="scroll-mt-4 space-y-3">
        <h2 id="settings-categories-title" className="text-lg font-semibold">Категорії</h2><p className="text-sm text-muted">Простір: {workspace.workspace_name}</p>
        {categories.error ? <div role="alert"><p>Не вдалося завантажити категорії.</p><RetryLoad /></div> : <CategoryManager workspaceId={workspace.workspace_id} categories={categories.data ?? []} />}
      </section>
    </main>
  </div>;
}
