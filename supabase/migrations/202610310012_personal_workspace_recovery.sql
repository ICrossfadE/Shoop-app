begin;

-- Restore only the caller's personal owner membership, including legacy incomplete accounts.
create or replace function public.ensure_personal_workspace()
returns table(workspace_id uuid, workspace_name text, member_role text)
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  personal_id uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('personal:' || caller::text, 0));

  return query select w.id, w.name, m.role from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
    where w.owner_id = caller and w.is_personal and m.user_id = caller and m.role = 'owner';
  if found then return; end if;

  insert into public.profiles(id, display_name)
    values(caller, left(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), 200))
    on conflict (id) do nothing;
  insert into public.workspaces(name, owner_id, is_personal)
    values('Мій простір', caller, true)
    on conflict (owner_id) where is_personal do nothing;
  select w.id into strict personal_id from public.workspaces w where w.owner_id = caller and w.is_personal;
  insert into public.workspace_members(workspace_id, user_id, role)
    values(personal_id, caller, 'owner')
    on conflict on constraint workspace_members_pkey do update set role = 'owner';
  return query select w.id, w.name, m.role from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
    where w.id = personal_id and m.user_id = caller;
end;
$$;
revoke all on function public.ensure_personal_workspace() from public, anon;
grant execute on function public.ensure_personal_workspace() to authenticated;
notify pgrst, 'reload schema';
commit;
