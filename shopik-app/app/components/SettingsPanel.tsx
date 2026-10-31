'use client';
import type { WorkspaceBoot } from '@/lib/workspace-boot';
import type { MutationData } from '@/lib/list-model';
import WorkspaceMembers from './WorkspaceMembers';
import Avatar from './Avatar';
import SignOutButton from './SignOutButton';
import RetryLoad from './RetryLoad';
import CategoryManager from './CategoryManager';
import TagManager from '../tags/TagManager';
import ThemePicker from '../settings/ThemePicker';

// Shared bootstrap makes settings available without a page roundtrip.
export default function SettingsPanel({ boot, onChange, active=true }: { active?:boolean; boot: WorkspaceBoot; onChange: (change: MutationData) => void }) {
  const { workspace, account, email, theme } = boot;
  const tags = { data: boot.tags, error: boot.tagsError };
  const categories = { data: boot.categories, error: boot.categoriesError };
  return <div className="flex flex-1 flex-col bg-page text-foreground">
    <main className="app-main settings-grid">
      <h1 className="settings-wide font-semibold">Налаштування акаунта</h1>
      {/* Personal account and logout, separate from shared Workspace management. */}
      <section id="account" aria-labelledby="account-title" className="space-y-4 rounded-lg bg-surface p-5 shadow-sm">
        <h2 id="account-title" className="text-lg font-semibold">Акаунт</h2>
        <div className="flex min-w-0 items-center gap-3"><Avatar name={account.name} url={account.avatar_url} /><div className="min-w-0"><p className="break-words font-medium">{account.name}</p><p className="break-all text-sm text-muted">{email}</p></div></div>
        <SignOutButton />
      </section>
      <section id="appearance" aria-labelledby="appearance-title" className="space-y-4 rounded-lg bg-surface p-5 shadow-sm">
        <h2 id="appearance-title" className="text-lg font-semibold">Колірна тема</h2>
        {theme.error ? <div role="alert"><p>Не вдалося завантажити особисту тему.</p><RetryLoad /></div> : <ThemePicker />}
      </section>
      {/* These sections manage shared data in the current Workspace. */}
      <section id="tags" aria-labelledby="settings-tags-title" className="settings-wide scroll-mt-4 space-y-3 rounded-lg bg-surface p-5 shadow-sm">
        <h2 id="settings-tags-title" className="text-lg font-semibold">Теги</h2><p className="text-sm text-muted">Простір: {workspace.workspace_name}</p>
        {tags.error ? <div role="alert"><p>Не вдалося завантажити теги.</p><RetryLoad /></div> : <TagManager onChange={onChange} workspaceId={workspace.workspace_id} tags={tags.data ?? []} />}
      </section>
      <section id="categories" aria-labelledby="settings-categories-title" className="settings-wide scroll-mt-4 space-y-3 rounded-lg bg-surface p-5 shadow-sm">
        <h2 id="settings-categories-title" className="text-lg font-semibold">Категорії</h2><p className="text-sm text-muted">Простір: {workspace.workspace_name}</p>
        {categories.error ? <div role="alert"><p>Не вдалося завантажити категорії.</p><RetryLoad /></div> : <CategoryManager userId={boot.userId} onChange={onChange} workspaceId={workspace.workspace_id} categories={categories.data ?? []} />}
      </section>
      {/* Existing Workspace members and owner-only removal are distinct from account logout. */}
      <section id="members" className="settings-wide space-y-3 rounded-lg bg-surface p-5 shadow-sm" aria-labelledby="members-title">
        <h2 id="members-title" className="text-lg font-semibold">Учасники простору</h2><p className="text-sm text-muted">{workspace.workspace_name}</p>
        <WorkspaceMembers active={active} workspaceId={workspace.workspace_id} userId={boot.userId} onRemoved={()=>onChange({workspaceChanged:true})}/>
      </section>
    </main>
  </div>;
}
