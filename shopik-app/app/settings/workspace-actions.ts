'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { workspaceClient } from '@/lib/workspace';
import { isWorkspaceId } from '@/lib/products';
import { workspaceCookie, type WorkspaceOption, type WorkspacePerson } from '@/lib/members';

// Membership and public people are verified afresh; no role is accepted from the client.
export async function readWorkspacePeople(workspaceId: string): Promise<{ok:true; people:WorkspacePerson[]; options:WorkspaceOption[]} | {ok:false; error:string; accessLost?:boolean}> {
  try {
    const client = await workspaceClient(workspaceId);
    if (!client) return {ok:false,error:'Немає доступу до простору.',accessLost:true};
    const session = await client.auth.getClaims();
    const [people, memberships, spaces] = await Promise.all([
      client.rpc('workspace_people',{p_workspace_id:workspaceId}),
      client.from('workspace_members').select('workspace_id,role').eq('user_id',session.data!.claims.sub!),
      client.from('workspaces').select('id,name'),
    ]);
    if (people.error || memberships.error || spaces.error) return {ok:false,error:'Не вдалося завантажити учасників і простори.'};
    const options = (spaces.data ?? []).flatMap((space) => {
      const membership=memberships.data?.find((item)=>item.workspace_id===space.id);
      return membership ? [{...space,role:membership.role}] : [];
    });
    return {ok:true,people:people.data ?? [],options};
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
