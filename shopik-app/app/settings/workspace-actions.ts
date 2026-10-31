'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { workspaceClient } from '@/lib/workspace';
import { isWorkspaceId } from '@/lib/products';
import { workspaceCookie, type WorkspaceOption, type WorkspacePerson } from '@/lib/members';
import { selectPersonalWorkspace } from '@/lib/server-workspaces';

// Workspace discovery works independently of the currently selected space's people endpoint.
export async function listWorkspaces(): Promise<{ok:true; options: WorkspaceOption[]}|{ok:false; error:string}> {
  try {
    const client = await createClient(true);
    const session = await client.auth.getClaims();
    if (session.error || !session.data?.claims.sub) return {ok:false,error:'Увійдіть знову.'};
    const [members, spaces] = await Promise.all([
      client.from('workspace_members').select('workspace_id,role').eq('user_id',session.data.claims.sub),
      client.from('workspaces').select('id,name,owner_id,is_personal'),
    ]);
    if (members.error || spaces.error) throw new Error('Workspace list unavailable');
    const options = (spaces.data ?? []).flatMap(space => {
      const member = members.data?.find(item => item.workspace_id === space.id);
      return member ? [{id:space.id,name:space.name,role:member.role,personal:space.is_personal && space.owner_id === session.data!.claims.sub}] : [];
    }).sort((a,b)=>Number(b.personal)-Number(a.personal)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
    return {ok:true,options};
  } catch { return {ok:false,error:'Не вдалося завантажити простори. Перевірте підключення.'}; }
}

// Used both to recover missing personal space and explicitly open an existing one.
export async function openPersonalWorkspace(): Promise<{ok:true}|{ok:false;error:string}> {
  try {
    const client = await createClient(true);
    const session = await client.auth.getClaims();
    if (session.error || !session.data?.claims.sub) return {ok:false,error:'Увійдіть знову.'};
    await selectPersonalWorkspace(client);
    return {ok:true};
  } catch { return {ok:false,error:'Не вдалося відкрити особистий простір. Перевірте підключення та міграції Supabase.'}; }
}

// Membership and public people are verified afresh; no role is accepted from the client.
export async function readWorkspacePeople(workspaceId: string): Promise<{ok:true; people:WorkspacePerson[]} | {ok:false; error:string; accessLost?:boolean}> {
  try {
    const client = await workspaceClient(workspaceId);
    if (!client) return {ok:false,error:'Немає доступу до простору.',accessLost:true};
    const people = await client.rpc('workspace_people',{p_workspace_id:workspaceId});
    if (people.error) return {ok:false,error:'Не вдалося завантажити учасників.'};
    return {ok:true,people:people.data ?? []};
  } catch { return {ok:false,error:'Не вдалося оновити простір. Перевірте підключення.'}; }
}

// The expected join timestamp makes retries safe across removal and re-invitation.
export async function removeWorkspaceMember(workspaceId:string,userId:string,joinedAt:string): Promise<{ok:true}|{ok:false;error:string;accessLost?:boolean}> {
  if (!isWorkspaceId(workspaceId)||!isWorkspaceId(userId)||!Number.isFinite(Date.parse(joinedAt))) return {ok:false,error:'Некоректний учасник.'};
  try {
    const client=await workspaceClient(workspaceId);
    if (!client) return {ok:false,error:'Немає доступу до простору.',accessLost:true};
    const result=await client.rpc('remove_workspace_member',{p_workspace_id:workspaceId,p_user_id:userId,p_joined_at:joinedAt});
    if(result.error) return {ok:false,error:result.error.code==='22023'?'Склад учасників змінився. Оновіть список.':'Не вдалося виключити учасника. Дія доступна лише власнику.'};
    return {ok:true};
  } catch {return {ok:false,error:'Результат невідомий. Оновіть список або повторіть виключення.'};}
}

// Persist only a validated choice; the server checks membership on every subsequent read.
export async function selectWorkspace(id:string):Promise<{ok:true}|{ok:false;error:string}> {
  if (!isWorkspaceId(id)) return {ok:false,error:'Некоректний простір.'};
  try {
    const client=await createClient(true);
    const session=await client.auth.getClaims();
    if(session.error||!session.data?.claims.sub) return {ok:false,error:'Увійдіть знову.'};
    const member=await client.from('workspace_members').select('role').eq('workspace_id',id).eq('user_id',session.data.claims.sub).maybeSingle();
    if(member.error||!member.data) return {ok:false,error:'Немає доступу до простору.'};
    (await cookies()).set(workspaceCookie,id,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:31536000});
    revalidatePath('/','layout');
    return {ok:true};
  } catch {return {ok:false,error:'Не вдалося змінити простір.'};}
}
