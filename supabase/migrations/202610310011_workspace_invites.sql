begin;

-- Invitation secrets never leave this table: no direct client grants, including SELECT.
create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  operation_id uuid not null,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp()+interval '7 days'),
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  accepted_membership_created_at timestamptz,
  unique(workspace_id,created_by,operation_id),
  check(expires_at>created_at),
  check((accepted_at is null and accepted_by is null and accepted_membership_created_at is null)
    or (accepted_at is not null and accepted_by is not null and accepted_membership_created_at is not null))
);
create index workspace_invites_owner_idx on public.workspace_invites(workspace_id,created_at desc);
alter table public.workspace_invites enable row level security;
revoke all on public.workspace_invites from public,anon,authenticated;

-- Durable, atomic rate budgets work across serverless instances. Invalid guesses
-- return a status (not an exception), so budget increments commit too.
create table shopik_private.invite_rate_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start bigint not null,
  hits integer not null,
  primary key(user_id,action,window_start)
);
alter table shopik_private.invite_rate_buckets enable row level security;
revoke all on shopik_private.invite_rate_buckets from public,anon,authenticated;
create index invite_rate_window_idx on shopik_private.invite_rate_buckets(window_start);
create function shopik_private.invite_budget(p_action text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare bucket bigint; count_hits integer;
begin
  if auth.uid() is null then return false; end if;
  bucket:=floor(extract(epoch from clock_timestamp())/p_seconds)::bigint*p_seconds;
  delete from shopik_private.invite_rate_buckets where window_start<extract(epoch from clock_timestamp())-172800;
  insert into shopik_private.invite_rate_buckets(user_id,action,window_start,hits)
    values(auth.uid(),p_action,bucket,1)
    on conflict(user_id,action,window_start) do update set hits=shopik_private.invite_rate_buckets.hits+1
      where shopik_private.invite_rate_buckets.hits<p_limit returning hits into count_hits;
  return count_hits is not null;
end; $$;
revoke all on function shopik_private.invite_budget(text,integer,integer) from public,anon,authenticated;

-- A removed member cannot reuse an older, still-unclaimed bearer link either.
create table shopik_private.workspace_departures (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  removed_at timestamptz not null,
  primary key(workspace_id,user_id)
);
alter table shopik_private.workspace_departures enable row level security;
revoke all on shopik_private.workspace_departures from public,anon,authenticated;

create function shopik_private.invite_metadata(i public.workspace_invites) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',i.id,'operation_id',i.operation_id,'created_at',i.created_at,'expires_at',i.expires_at,
    'state',case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked'
      when i.expires_at<=statement_timestamp() then 'expired' else 'pending' end);
$$;
revoke all on function shopik_private.invite_metadata(public.workspace_invites) from public,anon,authenticated;

create function public.create_workspace_invite(p_workspace_id uuid,p_operation_id uuid,p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invite public.workspace_invites;
begin
  perform public.workspace_write_access(p_workspace_id);
  if not exists(select 1 from public.workspaces w join public.workspace_members m on m.workspace_id=w.id
      where w.id=p_workspace_id and w.owner_id=auth.uid() and m.user_id=auth.uid() and m.role='owner') then
    raise exception 'Owner required' using errcode='42501';
  end if;
  if p_operation_id is null or p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' then
    return jsonb_build_object('status','invalid');
  end if;
  if not shopik_private.invite_budget('create',30,3600) then return jsonb_build_object('status','limited'); end if;
  select * into invite from public.workspace_invites where workspace_id=p_workspace_id and created_by=auth.uid() and operation_id=p_operation_id;
  if found then return jsonb_build_object('status','existing','invite',shopik_private.invite_metadata(invite)); end if;
  if (select count(*) from public.workspace_invites where workspace_id=p_workspace_id and accepted_at is null and revoked_at is null and expires_at>clock_timestamp())>=10 then
    return jsonb_build_object('status','capacity');
  end if;
  insert into public.workspace_invites(workspace_id,created_by,operation_id,token_hash) values(p_workspace_id,auth.uid(),p_operation_id,p_token_hash) returning * into invite;
  return jsonb_build_object('status','created','invite',shopik_private.invite_metadata(invite));
end; $$;

create function public.list_workspace_invites(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.workspace_write_access(p_workspace_id);
  if not exists(select 1 from public.workspaces w join public.workspace_members m on m.workspace_id=w.id
      where w.id=p_workspace_id and w.owner_id=auth.uid() and m.user_id=auth.uid() and m.role='owner') then
    raise exception 'Owner required' using errcode='42501';
  end if;
  if not shopik_private.invite_budget('list',60,60) then return jsonb_build_object('status','limited'); end if;
  return jsonb_build_object('status','ok','invites',(select coalesce(jsonb_agg(shopik_private.invite_metadata(i) order by (i.accepted_at is null and i.revoked_at is null and i.expires_at>statement_timestamp()) desc,i.created_at desc,i.id),'[]'::jsonb)
    from (select * from public.workspace_invites where workspace_id=p_workspace_id order by (accepted_at is null and revoked_at is null and expires_at>statement_timestamp()) desc,created_at desc,id limit 100) i));
end; $$;

create function public.revoke_workspace_invite(p_invite_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invite public.workspace_invites;
begin
  select * into invite from public.workspace_invites where id=p_invite_id;
  if not found then return jsonb_build_object('status','invalid'); end if;
  perform public.workspace_write_access(invite.workspace_id);
  if not exists(select 1 from public.workspaces w join public.workspace_members m on m.workspace_id=w.id
      where w.id=invite.workspace_id and w.owner_id=auth.uid() and m.user_id=auth.uid() and m.role='owner') then
    raise exception 'Owner required' using errcode='42501';
  end if;
  if not shopik_private.invite_budget('revoke',30,60) then return jsonb_build_object('status','limited'); end if;
  select * into invite from public.workspace_invites where id=p_invite_id for update;
  if invite.accepted_at is null and invite.revoked_at is null then
    update public.workspace_invites set revoked_at=clock_timestamp() where id=p_invite_id returning * into invite;
  end if;
  return jsonb_build_object('status','ok','invite',shopik_private.invite_metadata(invite));
end; $$;

-- Only this narrowly scoped definer path can grant membership to a non-member.
-- Lock order is Workspace then invite, identical to create/revoke/eviction.
create function shopik_private.visit_invite(p_token text,p_accept boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invite public.workspace_invites; joined timestamptz; info jsonb; wid uuid;
begin
  if auth.uid() is null then return jsonb_build_object('status','login'); end if;
  if not shopik_private.invite_budget(case when p_accept then 'accept' else 'preview' end,case when p_accept then 10 else 60 end,60) then
    return jsonb_build_object('status','limited');
  end if;
  if p_token is null or p_token!~'^[A-Za-z0-9_-]{43}$' then return jsonb_build_object('status','invalid'); end if;
  select workspace_id into wid from public.workspace_invites where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found then return jsonb_build_object('status','invalid'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('shopik-workspace:'||wid::text,0));
  select * into invite from public.workspace_invites where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if not found or not exists(select 1 from public.workspaces w join public.workspace_members m on m.workspace_id=w.id
      where w.id=wid and w.owner_id=invite.created_by and m.user_id=invite.created_by and m.role='owner') then
    return jsonb_build_object('status','invalid');
  end if;
  select created_at into joined from public.workspace_members where workspace_id=wid and user_id=auth.uid();
  if invite.accepted_at is not null then
    if invite.accepted_by=auth.uid() and joined=invite.accepted_membership_created_at then
      select jsonb_build_object('status','accepted','workspace_id',w.id,'workspace_name',w.name,'owner_name',coalesce(p.display_name,'')) into info
        from public.workspaces w left join public.profiles p on p.id=w.owner_id where w.id=wid;
      return info;
    end if;
    return jsonb_build_object('status','used');
  end if;
  if invite.revoked_at is not null then return jsonb_build_object('status','revoked'); end if;
  if invite.expires_at<=clock_timestamp() then return jsonb_build_object('status','expired'); end if;
  if exists(select 1 from shopik_private.workspace_departures d where d.workspace_id=wid and d.user_id=auth.uid() and invite.created_at<=d.removed_at) then
    return jsonb_build_object('status','invalid');
  end if;
  select jsonb_build_object('workspace_id',w.id,'workspace_name',w.name,'owner_name',coalesce(p.display_name,'')) into info
    from public.workspaces w left join public.profiles p on p.id=w.owner_id where w.id=wid;
  if joined is not null then return info||jsonb_build_object('status','member'); end if;
  if not p_accept then return info||jsonb_build_object('status','ready'); end if;
  insert into public.workspace_members(workspace_id,user_id,role,created_at) values(wid,auth.uid(),'member',clock_timestamp())
    on conflict(workspace_id,user_id) do nothing returning created_at into joined;
  if joined is null then return info||jsonb_build_object('status','member'); end if;
  update public.workspace_invites set accepted_at=clock_timestamp(),accepted_by=auth.uid(),accepted_membership_created_at=joined where id=invite.id;
  return info||jsonb_build_object('status','accepted');
end; $$;
revoke all on function shopik_private.visit_invite(text,boolean) from public,anon,authenticated;

create function public.preview_workspace_invite(p_token text) returns jsonb
language sql security definer set search_path='' as $$ select shopik_private.visit_invite(p_token,false); $$;
create function public.accept_workspace_invite(p_token text) returns jsonb
language sql security definer set search_path='' as $$ select shopik_private.visit_invite(p_token,true); $$;
revoke all on function public.create_workspace_invite(uuid,uuid,text),public.list_workspace_invites(uuid),public.revoke_workspace_invite(uuid),
  public.preview_workspace_invite(text),public.accept_workspace_invite(text) from public,anon;
grant execute on function public.create_workspace_invite(uuid,uuid,text),public.list_workspace_invites(uuid),public.revoke_workspace_invite(uuid),
  public.preview_workspace_invite(text),public.accept_workspace_invite(text) to authenticated;

create or replace function public.remove_workspace_member(p_workspace_id uuid,p_user_id uuid,p_joined_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare workspace_owner uuid;
begin
  perform public.workspace_write_access(p_workspace_id);
  select owner_id into workspace_owner from public.workspaces where id=p_workspace_id;
  if workspace_owner is distinct from auth.uid() or not exists(select 1 from public.workspace_members
      where workspace_id=p_workspace_id and user_id=auth.uid() and role='owner') then
    raise exception 'Only workspace owner can remove members' using errcode='42501';
  end if;
  if p_user_id is null or p_user_id=workspace_owner then raise exception 'Cannot remove owner' using errcode='22023'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id) then return; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and created_at=p_joined_at) then
    raise exception 'Membership changed; refresh before removing' using errcode='22023';
  end if;
  update public.expenses e set archived=true where e.workspace_id=p_workspace_id and exists(
    select 1 from public.products p where p.id=e.product_id and p.workspace_id=e.workspace_id and p.created_by=p_user_id);
  delete from public.products where workspace_id=p_workspace_id and created_by=p_user_id;
  -- Preserve categories containing anybody else's products, transferring only ownership.
  update public.categories c set created_by=workspace_owner where c.workspace_id=p_workspace_id and c.created_by=p_user_id
    and exists(select 1 from public.products p where p.workspace_id=c.workspace_id and p.category_id=c.id);
  delete from public.categories where workspace_id=p_workspace_id and created_by=p_user_id;
  -- Membership is removed last, within this same transaction and write lock.
  insert into shopik_private.workspace_departures(workspace_id,user_id,removed_at) values(p_workspace_id,p_user_id,clock_timestamp())
    on conflict(workspace_id,user_id) do update set removed_at=excluded.removed_at;
  delete from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id;
end; $$;
revoke all on function public.remove_workspace_member(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.remove_workspace_member(uuid,uuid,timestamptz) to authenticated;


notify pgrst,'reload schema';
commit;
