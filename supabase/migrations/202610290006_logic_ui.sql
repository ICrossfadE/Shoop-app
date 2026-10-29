begin;

-- Completed products are final. Harmless repeated completion is idempotent;
-- the audit timestamp trigger is ignored when comparing editable fields.
create function public.guard_completed_product() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'completed' and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'Completed products can only be deleted' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_completed_product() from public, anon, authenticated;
create trigger products_completed_guard before update on public.products
  for each row execute function public.guard_completed_product();

-- Serialize tag writes against completion. Cascading deletion is still allowed.
create function public.guard_completed_product_tags() returns trigger
language plpgsql set search_path = '' as $$
declare target_workspace uuid; target_product text; product_status text;
begin
  if tg_op = 'DELETE' then target_workspace := old.workspace_id; target_product := old.product_id;
  else target_workspace := new.workspace_id; target_product := new.product_id; end if;
  select status into product_status from public.products
    where workspace_id = target_workspace and id = target_product for update;
  if product_status = 'completed' then
    raise exception 'Completed product tags are immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_completed_product_tags() from public, anon, authenticated;
create trigger product_tags_completed_guard before insert or delete on public.product_tags
  for each row execute function public.guard_completed_product_tags();

-- Freeze edits even when an RPC sends unchanged product fields before tag writes.
create or replace function public.save_product_tags(p_workspace_id uuid, p_product_id text, p_name text, p_description text,
  p_price numeric, p_category_id uuid, p_tag_ids uuid[]) returns text
language plpgsql security invoker set search_path = '' as $$
declare saved_id text; product_status text;
begin
  perform public.check_tag_filter(p_workspace_id, p_tag_ids);
  if p_product_id is null then
    insert into public.products(workspace_id, category_id, name, description, price)
    values(p_workspace_id, p_category_id, p_name, p_description, p_price) returning id into saved_id;
  else
    select status into product_status from public.products where workspace_id = p_workspace_id and id = p_product_id for update;
    if product_status = 'completed' then raise exception 'Completed products can only be deleted' using errcode = '23514'; end if;
    update public.products set category_id = p_category_id, name = p_name, description = p_description, price = p_price
    where workspace_id = p_workspace_id and id = p_product_id returning id into saved_id;
    if saved_id is null then raise exception 'Product unavailable' using errcode = '42501'; end if;
  end if;
  delete from public.product_tags where workspace_id = p_workspace_id and product_id = saved_id;
  insert into public.product_tags(workspace_id, product_id, tag_id)
    select p_workspace_id, saved_id, id from (select distinct unnest(p_tag_ids) as id) q;
  return saved_id;
end;
$$;

create or replace function public.filtered_products(p_workspace_id uuid, p_category_id uuid, p_tag_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  perform public.check_tag_filter(p_workspace_id, p_tag_ids);
  select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('tags', public.product_tag_list(p.workspace_id, p.id))
    order by p.created_at desc, p.id), '[]'::jsonb) into result
  from public.products p where p.workspace_id = p_workspace_id and p.category_id = p_category_id and p.status = 'active'
    and public.product_matches_tags(p.workspace_id, p.id, p_tag_ids);
  return result;
end;
$$;

-- Synchronize public Google display fields without changing profile read policies.
alter table public.profiles add column avatar_url text not null default '';
create function public.sync_google_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name, avatar_url)
  values(new.id, left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),200),
    left(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),2048))
  on conflict(id) do update set
    avatar_url = excluded.avatar_url,
    display_name = case when public.profiles.display_name = '' then excluded.display_name else public.profiles.display_name end;
  return new;
end;
$$;
revoke all on function public.sync_google_profile() from public, anon, authenticated;
create trigger auth_google_profile after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.sync_google_profile();
insert into public.profiles(id, display_name, avatar_url)
select id, left(coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name',''),200),
  left(coalesce(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture',''),2048) from auth.users
on conflict(id) do update set avatar_url = excluded.avatar_url,
  display_name = case when public.profiles.display_name = '' then excluded.display_name else public.profiles.display_name end;

-- Return only display fields of authors of products in a member's Workspace.
-- Neither auth.users nor global profile SELECT becomes available to clients.
create function public.workspace_product_authors(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'display_name', coalesce(pr.display_name,''),
    'avatar_url', coalesce(pr.avatar_url,''), 'created_at', p.created_at) order by p.id), '[]'::jsonb)
  into result from public.products p left join public.profiles pr on pr.id = p.created_by
    where p.workspace_id = p_workspace_id;
  return result;
end;
$$;
revoke all on function public.workspace_product_authors(uuid) from public, anon;
grant execute on function public.workspace_product_authors(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
