-- Run in Supabase SQL Editor AFTER applying the migration.
-- Everything, including the two fixture users, is rolled back.
begin;

insert into auth.users(id, email) values
  ('b8bc6ee0-9ddb-456a-8f41-637ec271a001', 'shopik-rls-a@example.invalid'),
  ('b8bc6ee0-9ddb-456a-8f41-637ec271a002', 'shopik-rls-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec271a001","role":"authenticated"}', true);
select * from public.ensure_personal_workspace();
select * from public.ensure_personal_workspace();

do $$
begin
  if (select count(*) from public.workspaces) <> 1
    or (select count(*) from public.workspace_members) <> 1
    or (select count(*) from public.profiles) <> 1 then
    raise exception 'Repeated bootstrap created duplicates';
  end if;
  if not exists (select 1 from public.workspace_members where user_id = auth.uid() and role = 'owner') then
    raise exception 'Personal workspace owner missing';
  end if;
  begin
    insert into public.workspace_members(workspace_id, user_id, role)
      select id, 'b8bc6ee0-9ddb-456a-8f41-637ec271a002', 'owner' from public.workspaces;
    raise exception 'Direct membership write was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec271a002","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.workspaces)
    or exists (select 1 from public.workspace_members)
    or exists (select 1 from public.profiles) then
    raise exception 'User B can read user A data';
  end if;
end;
$$;

select * from public.ensure_personal_workspace();
do $$
begin
  if (select count(*) from public.workspaces) <> 1
    or exists (select 1 from public.workspaces where owner_id <> auth.uid())
    or exists (select 1 from public.workspace_members where user_id <> auth.uid()) then
    raise exception 'Workspace isolation failed';
  end if;
end;
$$;

-- An authenticated database role without a subject must not bootstrap data.
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  begin
    perform public.ensure_personal_workspace();
    raise exception 'Bootstrap accepted missing identity';
  exception when invalid_authorization_specification then null;
  end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.ensure_personal_workspace();
    raise exception 'Anonymous bootstrap was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.workspaces;
    raise exception 'Anonymous workspace read was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
