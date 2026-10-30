import { readSession } from './server-session';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import { getSupabaseConfig } from './supabase/config';
import { isWorkspaceId } from './products';
import { accountFromClaims } from './identity';

// Every protected page verifies identity and derives Workspace server-side.
export const requireWorkspace = cache(async () => {
  if (!getSupabaseConfig()) redirect('/login');
  const { client: supabase, data, error } = await readSession();
  if (error || !data?.claims.sub) redirect('/login');
  const { data: workspaces, error: workspaceError } = await supabase.rpc('ensure_personal_workspace');
  if (workspaceError || !workspaces?.[0]) throw new Error('Unable to initialize personal workspace.');
  return { supabase, workspace: workspaces[0], email: typeof data.claims.email === 'string' ? data.claims.email : '', userId: data.claims.sub, account: accountFromClaims(data.claims.user_metadata, data.claims.email) };
});

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
