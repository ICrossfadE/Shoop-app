'use server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { inviteCookie, inviteCookieOptions, isInviteToken, type InviteView } from '@/lib/invites';

// Anonymous preparation is a bounded cookie write only: no metadata lookup or membership mutation.
export async function prepareInvite(token:unknown):Promise<{ok:boolean}> {
  try{
    const store=await cookies();
    if(!isInviteToken(token)){store.set(inviteCookie,'',{...inviteCookieOptions,maxAge:0,secure:process.env.NODE_ENV==='production'});return {ok:false};}
    store.set(inviteCookie,token,{...inviteCookieOptions,secure:process.env.NODE_ENV==='production'});
    return {ok:true};
  }catch{return {ok:false};}
}
// Use the cookie secret exclusively on the server; the browser receives display-only DTOs.
async function visit(accept:boolean):Promise<InviteView> {
  try{
    const store=await cookies();
    const token=store.get(inviteCookie)?.value;
    if(!isInviteToken(token))return {status:'missing'};
    const client=await createClient(true);
    const session=await client.auth.getClaims();
    if(session.error||!session.data?.claims.sub)return {status:'login'};
    const result=await client.rpc(accept?'accept_workspace_invite':'preview_workspace_invite',{p_token:token});
    if(result.error||!result.data)return {status:'error'};
    const view=result.data;
    if(['invalid','expired','revoked','used'].includes(view.status)||(accept&&['accepted','member'].includes(view.status))) {
      store.set(inviteCookie,'',{...inviteCookieOptions,maxAge:0,secure:process.env.NODE_ENV==='production'});
    }
    return view;
  }catch{return {status:'error'};}
}
// Separate POST actions make preview harmless and acceptance explicit.
export async function readInvite():Promise<InviteView>{return visit(false);}
export async function acceptInvite():Promise<InviteView>{return visit(true);}
export async function cancelInvite():Promise<void>{
  (await cookies()).set(inviteCookie,'',{...inviteCookieOptions,maxAge:0,secure:process.env.NODE_ENV==='production'});
}
