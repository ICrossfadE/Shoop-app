import { loadWorkspaceApp } from '@/lib/load-workspace-app';
export const dynamic = 'force-dynamic';
// Direct expense URLs use the same shell and server-validated snapshot.
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; tag?: string | string[] }> }) {
  return loadWorkspaceApp('expenses', await searchParams);
}
