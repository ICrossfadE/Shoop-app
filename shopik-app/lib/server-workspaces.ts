import 'server-only';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase/database.types';
import { workspaceCookie } from './members';

// The RPC derives the owner from auth.uid(), never from a submitted user ID.
export async function selectPersonalWorkspace(client: SupabaseClient<Database>) {
  const result = await client.rpc('ensure_personal_workspace');
  const personal = result.data?.[0];
  if (result.error || !personal || personal.member_role !== 'owner') throw new Error('Personal workspace unavailable');
  (await cookies()).set(workspaceCookie, personal.workspace_id, {
    path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 31536000,
  });
}
