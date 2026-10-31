import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { accountFromClaims } from '@/lib/identity';
import InvitePanel from './InvitePanel';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Запрошення до простору — Shopik',robots:{index:false,follow:false},referrer:'no-referrer'};
// GET never inspects/consumes the link. Private preview is a separate authenticated action.
export default async function InvitePage({searchParams}:{searchParams:Promise<{error?:string}>}){
  let account='';
  const configured=!!getSupabaseConfig();
  if(configured){
    try{const client=await createClient();const session=await client.auth.getClaims();if(!session.error&&session.data?.claims.sub){const name=accountFromClaims(session.data.claims.user_metadata,session.data.claims.email).name;account=typeof session.data.claims.email==='string'?`${name} (${session.data.claims.email})`:name;}}catch{/* The login/retry state remains usable during an Auth outage. */}
  }
  const params=await searchParams;
  return <main className="flex flex-1 items-center justify-center bg-page px-5 py-10 text-foreground">
    {/* Token fragments and cookies are intentionally absent from server-rendered props. */}
    <section className="w-full max-w-lg space-y-5 rounded-[22px] border border-line bg-surface p-6 shadow">
      <h1 className="text-2xl font-semibold">Запрошення до простору</h1>
      <InvitePanel account={account} configured={configured} oauthError={params.error==='oauth'}/>
    </section>
  </main>;
}
