import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import { getSupabaseConfig } from './supabase/config';
import { isWorkspaceId } from './products';

// Every protected page verifies identity and derives Workspace server-side.
export async function requireWorkspace() {
  if (!getSupabaseConfig()) redirect('/login');
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) redirect('/login');
  const { data: workspaces, error: workspaceError } = await supabase.rpc('ensure_personal_workspace');
  if (workspaceError || !workspaces?.[0]) throw new Error('Unable to initialize personal workspace.');
  return { supabase, workspace: workspaces[0], email: typeof data.claims.email === 'string' ? data.claims.email : '' };
}

// Server Actions verify membership independently of UI controls, in addition to RLS.
export async function workspaceClient(workspaceId: unknown) {
  if (!isWorkspaceId(workspaceId)) return null;
  const supabase = await createClient(true);
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return null;
  const { data: membership, error: memberError } = await supabase.from('workspace_members')
    .select('role').eq('workspace_id', workspaceId).eq('user_id', data.claims.sub).maybeSingle();
  return !memberError && membership ? supabase : null;
}
