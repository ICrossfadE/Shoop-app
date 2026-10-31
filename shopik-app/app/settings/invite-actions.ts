'use server';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { isWorkspaceId } from '@/lib/products';
import type { InviteSummary } from '@/lib/invites';

// Database RPC repeats owner authorization; only the initial response contains the secret.
export async function createInvite(workspaceId:string,operationId:string):Promise<{ok:true;invite:InviteSummary;token?:string}|{ok:false;error:string}> {
  if(!isWorkspaceId(workspaceId)||!isWorkspaceId(operationId))return {ok:false,error:'Некоректний простір або ключ запрошення.'};
  try{
    const client=await createClient(true);
    const session=await client.auth.getClaims();
    if(session.error||!session.data?.claims.sub)return {ok:false,error:'Увійдіть знову.'};
    const token=randomBytes(32).toString('base64url');
    const result=await client.rpc('create_workspace_invite',{p_workspace_id:workspaceId,p_operation_id:operationId,p_token_hash:createHash('sha256').update(token).digest('hex')});
    if(result.error||!result.data)return {ok:false,error:'Не вдалося створити запрошення. Оновіть список перед повтором.'};
    if(result.data.status==='created'||result.data.status==='existing')return {ok:true,invite:result.data.invite,...(result.data.status==='created'?{token}:{})};
    return {ok:false,error:result.data.status==='capacity'?'Є вже 10 активних запрошень. Відкличте зайві.':'Ліміт запитів вичерпано. Спробуйте пізніше.'};
  }catch{return {ok:false,error:'Результат невідомий. Оновіть список запрошень або повторіть запит.'};}
}

// Return only safe metadata; token_hash never enters client component props.
export async function listInvites(workspaceId:string):Promise<{ok:true;invites:InviteSummary[]}|{ok:false;error:string}> {
  if(!isWorkspaceId(workspaceId))return {ok:false,error:'Некоректний простір.'};
  try{
    const client=await createClient(true);
    const session=await client.auth.getClaims();
    if(session.error||!session.data?.claims.sub)return {ok:false,error:'Увійдіть знову.'};
    const result=await client.rpc('list_workspace_invites',{p_workspace_id:workspaceId});
    if(result.error||!result.data)return {ok:false,error:'Не вдалося завантажити запрошення. Керування доступне лише власнику.'};
    return result.data.status==='ok'?{ok:true,invites:result.data.invites}:{ok:false,error:'Ліміт запитів вичерпано. Спробуйте за хвилину.'};
  }catch{return {ok:false,error:'Не вдалося оновити запрошення. Перевірте підключення.'};}
}

// Revoking a link does not remove a membership that was already accepted.
export async function revokeInvite(id:string):Promise<{ok:true}|{ok:false;error:string}> {
  if(!isWorkspaceId(id))return {ok:false,error:'Некоректне запрошення.'};
  try{
    const client=await createClient(true);
    const session=await client.auth.getClaims();
    if(session.error||!session.data?.claims.sub)return {ok:false,error:'Увійдіть знову.'};
    const result=await client.rpc('revoke_workspace_invite',{p_invite_id:id});
    return !result.error&&result.data?.status==='ok'?{ok:true}:{ok:false,error:'Не вдалося відкликати запрошення. Оновіть список або спробуйте пізніше.'};
  }catch{return {ok:false,error:'Не вдалося відкликати запрошення. Перевірте підключення.'};}
}
