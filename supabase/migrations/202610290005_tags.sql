begin;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check(name = btrim(name) and char_length(name) between 1 and 120),
  color text not null check(color ~ '^#[0-9A-F]{6}$'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, id)
);
create unique index tags_workspace_name on public.tags(workspace_id, lower(name));
create table public.product_tags (
  workspace_id uuid not null,
  product_id text not null,
  tag_id uuid not null,
  primary key(workspace_id, product_id, tag_id),
  foreign key(workspace_id, product_id) references public.products(workspace_id, id) on delete cascade,
  foreign key(workspace_id, tag_id) references public.tags(workspace_id, id) on delete cascade
);
create index product_tags_tag_idx on public.product_tags(workspace_id, tag_id, product_id);
alter table public.tags enable row level security;
alter table public.product_tags enable row level security;
revoke all on public.tags, public.product_tags from public, anon, authenticated;
grant select on public.tags to authenticated;
grant insert(workspace_id, name, color) on public.tags to authenticated;
grant select, insert, delete on public.product_tags to authenticated;
create policy tags_read on public.tags for select to authenticated using(public.is_workspace_member(workspace_id));
create policy tags_create on public.tags for insert to authenticated
  with check(public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy product_tags_read on public.product_tags for select to authenticated using(public.is_workspace_member(workspace_id));
create policy product_tags_create on public.product_tags for insert to authenticated with check(public.is_workspace_member(workspace_id));
create policy product_tags_delete on public.product_tags for delete to authenticated using(public.is_workspace_member(workspace_id));

-- Reject unknown/foreign filters rather than silently dropping them.
create function public.check_tag_filter(p_workspace_id uuid, p_tag_ids uuid[]) returns void
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  if p_tag_ids is null or exists(
    select 1 from unnest(p_tag_ids) q(id) where not exists(
      select 1 from public.tags t where t.workspace_id = p_workspace_id and t.id = q.id
    )
  ) then raise exception 'Unknown tag' using errcode = '22023'; end if;
end;
$$;

-- AND semantics: every requested tag must be attached to the product.
create function public.product_matches_tags(p_workspace_id uuid, p_product_id text, p_tag_ids uuid[]) returns boolean
language sql stable security invoker set search_path = '' as $$
  select p_tag_ids is not null and not exists(
    select 1 from unnest(p_tag_ids) q(id) where not exists(
      select 1 from public.product_tags pt where pt.workspace_id = p_workspace_id and pt.product_id = p_product_id and pt.tag_id = q.id
    )
  );
$$;

-- Reuse one color/name representation across cards, filters and expense items.
create function public.product_tag_list(p_workspace_id uuid, p_product_id text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.name, t.id), '[]'::jsonb)
  from public.tags t join public.product_tags pt on pt.workspace_id = t.workspace_id and pt.tag_id = t.id
  where pt.workspace_id = p_workspace_id and pt.product_id = p_product_id;
$$;

-- Product fields and all tag links commit together. UPDATE locks the row, so
-- simultaneous editors cannot interleave two sets of tags on the same product.
create function public.save_product_tags(p_workspace_id uuid, p_product_id text, p_name text, p_description text,
  p_price numeric, p_category_id uuid, p_tag_ids uuid[]) returns text
language plpgsql security invoker set search_path = '' as $$
declare saved_id text;
begin
  perform public.check_tag_filter(p_workspace_id, p_tag_ids);
  if p_product_id is null then
    insert into public.products(workspace_id, category_id, name, description, price)
    values(p_workspace_id, p_category_id, p_name, p_description, p_price) returning id into saved_id;
  else
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

create function public.filtered_products(p_workspace_id uuid, p_category_id uuid, p_tag_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  perform public.check_tag_filter(p_workspace_id, p_tag_ids);
  select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('tags', public.product_tag_list(p.workspace_id, p.id))
    order by p.created_at desc, p.id), '[]'::jsonb) into result
  from public.products p where p.workspace_id = p_workspace_id and p.category_id = p_category_id
    and public.product_matches_tags(p.workspace_id, p.id, p_tag_ids);
  return result;
end;
$$;

-- Filter before summing: never join tag rows into the amount aggregation.
create function public.expense_month_tags(p_workspace_id uuid, p_month date, p_tag_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  perform public.check_tag_filter(p_workspace_id, p_tag_ids);
  if p_month is null or extract(day from p_month) <> 1 then raise exception 'Expected first day of month' using errcode = '22023'; end if;
  with month_rows as (
    select * from public.expenses where workspace_id = p_workspace_id
      and occurred_at >= (p_month::timestamp at time zone 'Europe/Kyiv')
      and occurred_at < ((p_month::timestamp + interval '1 month') at time zone 'Europe/Kyiv')
      and public.product_matches_tags(workspace_id, product_id, p_tag_ids)
  ), category_totals as (
    select category_id, category_name, sum(amount) as total, count(*) as count from month_rows group by category_id, category_name
  )
  select jsonb_build_object(
    'total', coalesce((select sum(amount) from month_rows), 0),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by category_name, category_id) from category_totals c), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('tags', public.product_tag_list(r.workspace_id, r.product_id))
      order by occurred_at desc, id) from month_rows r), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
-- Keep the old RPC and existing consumers/tests working with no tag filter.
create or replace function public.expense_month(p_workspace_id uuid, p_month date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select public.expense_month_tags(p_workspace_id, p_month, '{}'::uuid[]);
$$;

revoke all on function public.check_tag_filter(uuid, uuid[]), public.product_matches_tags(uuid, text, uuid[]),
  public.product_tag_list(uuid, text), public.save_product_tags(uuid, text, text, text, numeric, uuid, uuid[]),
  public.filtered_products(uuid, uuid, uuid[]), public.expense_month_tags(uuid, date, uuid[]) from public, anon;
grant execute on function public.check_tag_filter(uuid, uuid[]), public.product_matches_tags(uuid, text, uuid[]),
  public.product_tag_list(uuid, text), public.save_product_tags(uuid, text, text, text, numeric, uuid, uuid[]),
  public.filtered_products(uuid, uuid, uuid[]), public.expense_month_tags(uuid, date, uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
