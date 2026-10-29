begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 200),
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid not null references auth.users(id) on delete cascade,
  is_personal boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index one_personal_workspace_per_owner
  on public.workspaces(owner_id) where is_personal;

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_id_idx on public.workspace_members(user_id);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Avoid recursive membership RLS. The caller cannot choose a user identity.
create function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;

create policy profiles_read_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy workspaces_read_member on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));
create policy workspace_members_read_member on public.workspace_members
  for select to authenticated using (public.is_workspace_member(workspace_id));

revoke all on public.profiles, public.workspaces, public.workspace_members from public, anon, authenticated;
grant select on public.profiles, public.workspaces, public.workspace_members to authenticated;
grant update(display_name) on public.profiles to authenticated;

create function public.ensure_personal_workspace()
returns table(workspace_id uuid, workspace_name text, member_role text)
language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  personal_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  insert into public.profiles(id, display_name)
  values (current_user_id, left(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), 200))
  on conflict (id) do nothing;

  insert into public.workspaces(name, owner_id, is_personal)
  values ('Мій простір', current_user_id, true)
  on conflict (owner_id) where is_personal do nothing;

  select w.id into strict personal_workspace_id from public.workspaces w
    where w.owner_id = current_user_id and w.is_personal;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (personal_workspace_id, current_user_id, 'owner')
  on conflict on constraint workspace_members_pkey do nothing;

  return query
    select w.id, w.name, m.role
    from public.workspaces w join public.workspace_members m on m.workspace_id = w.id
    where w.id = personal_workspace_id and m.user_id = current_user_id;
end;
$$;

revoke all on function public.ensure_personal_workspace() from public, anon;
grant execute on function public.ensure_personal_workspace() to authenticated;

commit;
