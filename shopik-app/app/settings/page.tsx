import { loadWorkspaceApp } from '@/lib/load-workspace-app';
export const dynamic = 'force-dynamic';
// Settings and the other screens share one authenticated bootstrap.
export default async function SettingsPage() { return loadWorkspaceApp('settings'); }
