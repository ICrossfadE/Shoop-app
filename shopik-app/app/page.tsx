import { loadWorkspaceApp } from '@/lib/load-workspace-app';
export const dynamic = 'force-dynamic';
// Preserve authenticated SSR and category/tag deep links.
export default async function Home({ searchParams }: { searchParams: Promise<{ category?: string; tag?: string | string[] }> }) {
  return loadWorkspaceApp('products', await searchParams);
}
