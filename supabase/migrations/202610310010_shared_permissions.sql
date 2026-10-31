begin;

-- All writes and eviction share one transaction lock per Workspace. Membership is
-- checked AFTER waiting, so a previously started request cannot outlive eviction.
create function public.workspace_write_access(p_workspace_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('shopik-workspace:'||p_workspace_id::text,0));
  perform 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=auth.uid() for key share;
  if auth.uid() is null or not found then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;
  return true;
end; $$;
revoke all on function public.workspace_write_access(uuid) from public,anon;
grant execute on function public.workspace_write_access(uuid) to authenticated;

-- UPDATE also serves shared completion; a trigger restricts non-author writes
-- to status-only completion. No owner override for ordinary edits or deletion.
drop policy products_create_member on public.products;
drop policy products_update_member on public.products;
drop policy products_delete_member on public.products;
create policy products_create_member on public.products for insert to authenticated
  with check(public.workspace_write_access(workspace_id) and created_by=auth.uid());
create policy products_update_member on public.products for update to authenticated
  using(public.workspace_write_access(workspace_id)) with check(public.workspace_write_access(workspace_id));
create policy products_delete_member on public.products for delete to authenticated
  using(public.workspace_write_access(workspace_id) and created_by=auth.uid());

create function public.guard_product_actor() returns trigger
language plpgsql set search_path='' as $$
begin
  -- Internal, narrowly authorized definer cleanup runs as the database owner.
  -- Ordinary clients cannot set current_user through a payload or session GUC.
  if current_user='authenticated' then
    perform public.workspace_write_access(new.workspace_id);
    if old.created_by<>auth.uid() and not (
      new.status='completed' and
      (to_jsonb(new)-'status'-'updated_at')=(to_jsonb(old)-'status'-'updated_at')
    ) then raise exception 'Only product author can edit' using errcode='42501'; end if;
  end if;
  return new;
end; $$;
revoke all on function public.guard_product_actor() from public,anon,authenticated;
create trigger products_actor_guard before update on public.products for each row execute function public.guard_product_actor();

-- Categories can be used/created by every member, but renamed/deleted by author.
drop policy categories_insert on public.categories;
drop policy categories_update on public.categories;
drop policy categories_delete on public.categories;
create policy categories_insert on public.categories for insert to authenticated
  with check(public.workspace_write_access(workspace_id) and created_by=auth.uid());
create policy categories_update on public.categories for update to authenticated
  using(public.workspace_write_access(workspace_id) and created_by=auth.uid())
  with check(public.workspace_write_access(workspace_id) and created_by=auth.uid());
create policy categories_delete on public.categories for delete to authenticated
  using(public.workspace_write_access(workspace_id) and created_by=auth.uid());
drop policy tags_create on public.tags;
create policy tags_create on public.tags for insert to authenticated
  with check(public.workspace_write_access(workspace_id) and created_by=auth.uid());
drop policy product_tags_create on public.product_tags;
drop policy product_tags_delete on public.product_tags;
create policy product_tags_create on public.product_tags for insert to authenticated with check(
  public.workspace_write_access(workspace_id) and exists(select 1 from public.products p
    where p.id=product_id and p.workspace_id=product_tags.workspace_id and p.created_by=auth.uid()));
create policy product_tags_delete on public.product_tags for delete to authenticated using(
  public.workspace_write_access(workspace_id) and exists(select 1 from public.products p
    where p.id=product_id and p.workspace_id=product_tags.workspace_id and p.created_by=auth.uid()));

-- Historical source ID is retained, but no longer cascades to the expense.
-- Ordinary deletion is handled by a trusted trigger; only eviction archives rows.
do $$ declare item record; begin
  for item in select conname from pg_constraint where conrelid='public.expenses'::regclass
    and confrelid='public.products'::regclass and contype='f'
  loop execute format('alter table public.expenses drop constraint %I',item.conname); end loop;
end; $$;
alter table public.expenses add column archived boolean not null default false;
alter table public.expenses add column created_by uuid;
alter table public.expenses add column author jsonb not null default '{}';
alter table public.expenses add column tags jsonb not null default '[]';
-- Backfill only descriptive snapshots: amounts/dates/category identity stay untouched.
update public.expenses e set created_by=p.created_by,
  author=jsonb_build_object('product_id',p.id,'display_name',coalesce(pr.display_name,''),
    'avatar_url',coalesce(pr.avatar_url,''),'created_at',p.created_at),
  tags=public.product_tag_list(e.workspace_id,e.product_id)
from public.products p left join public.profiles pr on pr.id=p.created_by
where p.id=e.product_id and p.workspace_id=e.workspace_id;
alter table public.expenses alter column created_by set not null;
alter table public.expenses add constraint expenses_tags_array check(jsonb_typeof(tags)='array');

create or replace function public.sync_product_expense() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' then
    delete from public.expenses where product_id=new.id and not archived;
  elsif tg_op='INSERT' or old.status<>'completed' then
    insert into public.expenses(workspace_id,product_id,name,category_id,category_name,amount,currency,occurred_at,created_by,author,tags)
    select new.workspace_id,new.id,new.name,new.category_id,c.name,new.price,new.currency,clock_timestamp(),new.created_by,
      jsonb_build_object('product_id',new.id,'display_name',coalesce(pr.display_name,''),'avatar_url',coalesce(pr.avatar_url,''),'created_at',new.created_at),
      public.product_tag_list(new.workspace_id,new.id)
    from public.categories c left join public.profiles pr on pr.id=new.created_by
    where c.id=new.category_id and c.workspace_id=new.workspace_id
    on conflict(product_id) do nothing;
  end if;
  return new;
end; $$;

create function public.delete_live_product_expense() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.expenses where product_id=old.id and workspace_id=old.workspace_id and not archived;
  return old;
end; $$;
revoke all on function public.delete_live_product_expense() from public,anon,authenticated;
create trigger product_delete_expense before delete on public.products for each row execute function public.delete_live_product_expense();

-- Filtering no longer requires an existing product or its live tag links.
create or replace function public.expense_month_tags(p_workspace_id uuid,p_month date,p_tag_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  perform public.check_tag_filter(p_workspace_id,p_tag_ids);
  if p_month is null or extract(day from p_month)<>1 then raise exception 'Expected first day of month' using errcode='22023'; end if;
  with month_rows as (
    select * from public.expenses e where workspace_id=p_workspace_id
      and occurred_at >= (p_month::timestamp at time zone 'Europe/Kyiv')
      and occurred_at < ((p_month::timestamp+interval '1 month') at time zone 'Europe/Kyiv')
      and not exists(select 1 from unnest(p_tag_ids) requested(id)
        where not exists(select 1 from jsonb_array_elements(e.tags) t where t->>'id'=requested.id::text))
  ), category_totals as (
    select category_id,category_name,sum(amount) total,count(*) count from month_rows group by category_id,category_name
  )
  select jsonb_build_object('total',coalesce((select sum(amount) from month_rows),0),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by category_name,category_id) from category_totals c),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(r) order by occurred_at desc,id) from month_rows r),'[]'::jsonb)) into result;
  return result;
end; $$;

-- Public display metadata only; no emails or access to another profile row.
create function public.workspace_people(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'joined_at',m.created_at,
    'display_name',coalesce(p.display_name,''),'avatar_url',coalesce(p.avatar_url,'')) order by m.role,m.created_at,m.user_id),'[]'::jsonb)
    from public.workspace_members m left join public.profiles p on p.id=m.user_id where m.workspace_id=p_workspace_id);
end; $$;
revoke all on function public.workspace_people(uuid) from public,anon;
grant execute on function public.workspace_people(uuid) to authenticated;

-- Owner-only atomic cleanup. There is no caller-controlled archive flag or
-- privilege elevation on ordinary CRUD. Empty repeats are harmless.
create function public.remove_workspace_member(p_workspace_id uuid,p_user_id uuid,p_joined_at timestamptz) returns void
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
  delete from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id;
end; $$;
revoke all on function public.remove_workspace_member(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.remove_workspace_member(uuid,uuid,timestamptz) to authenticated;

create or replace function public.save_product_tags(p_workspace_id uuid, p_product_id text, p_name text, p_description text,
  p_price numeric, p_category_id uuid, p_tag_ids uuid[]) returns text
language plpgsql security invoker set search_path = '' as $$
declare saved_id text; existing public.products;
begin
  perform public.workspace_write_access(p_workspace_id);
  perform public.check_tag_filter(p_workspace_id, p_tag_ids);
  if p_product_id is null then
    insert into public.products(workspace_id, category_id, name, description, price)
    values(p_workspace_id,p_category_id,p_name,p_description,p_price) returning id into saved_id;
  else
    select * into existing from public.products where workspace_id=p_workspace_id and id=p_product_id for update;
    if not found then raise exception 'Product unavailable' using errcode='42501'; end if;
    if existing.created_by<>auth.uid() then raise exception 'Only product author can edit' using errcode='42501'; end if;
    if existing.status='completed' then raise exception 'Completed products can only be deleted' using errcode='23514'; end if;
    saved_id := existing.id;
    if (existing.category_id,existing.name,existing.description,existing.price) is distinct from (p_category_id,p_name,p_description,p_price) then
      update public.products set category_id=p_category_id,name=p_name,description=p_description,price=p_price
      where workspace_id=p_workspace_id and id=saved_id;
    end if;
  end if;
  delete from public.product_tags where workspace_id=p_workspace_id and product_id=saved_id and not(tag_id=any(p_tag_ids));
  insert into public.product_tags(workspace_id,product_id,tag_id)
    select p_workspace_id,saved_id,q.id from (select distinct unnest(p_tag_ids) id) q
    where not exists(select 1 from public.product_tags pt where pt.workspace_id=p_workspace_id and pt.product_id=saved_id and pt.tag_id=q.id);
  return saved_id;
end; $$;


create or replace function public.apply_operation(p_workspace_id uuid,p_operation_id uuid,p_kind text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare receipt shopik_private.operation_receipts; result jsonb; pid text; cid uuid; tids uuid[]; entity jsonb;
begin
  perform public.workspace_write_access(p_workspace_id);
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  if p_operation_id is null then raise exception 'Operation key required' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||p_workspace_id::text||p_operation_id::text,0));
  select * into receipt from shopik_private.operation_receipts where user_id=auth.uid() and workspace_id=p_workspace_id and operation_id=p_operation_id;
  if found then
    if receipt.kind<>p_kind or receipt.payload_hash<>encode(sha256(convert_to(p_payload::text,'UTF8')),'hex') then raise exception 'Operation key reused with different input' using errcode='22023'; end if;
    if receipt.response ? 'product_id' then
      pid := receipt.response->>'product_id';
      select to_jsonb(p)||jsonb_build_object('tags',public.product_tag_list(p_workspace_id,p.id)) into entity
        from public.products p where p.id=pid and p.workspace_id=p_workspace_id;
      if entity is null then return jsonb_build_object('deleted',pid); end if;
      return jsonb_build_object('product',entity,'author',public.product_authors_for_ids(p_workspace_id,array[pid])->0);
    end if;
    return receipt.response;
  end if;
  if p_kind='save_product' then
    select coalesce(array_agg(value::uuid),'{}') into tids from jsonb_array_elements_text(p_payload->'tag_ids');
    pid := public.save_product_tags(p_workspace_id,p_payload->>'id',p_payload->>'name',p_payload->>'description',(p_payload->>'price')::numeric,(p_payload->>'category_id')::uuid,tids);
    select to_jsonb(p)||jsonb_build_object('tags',public.product_tag_list(p_workspace_id,p.id)) into entity from public.products p where p.id=pid and p.workspace_id=p_workspace_id;
    result := jsonb_build_object('product',entity,'author',public.product_authors_for_ids(p_workspace_id,array[pid])->0);
  elsif p_kind='complete_product' then
    pid := p_payload->>'id';
    perform 1 from public.products where id=pid and workspace_id=p_workspace_id for update;
    if not found then raise exception 'Product unavailable' using errcode='42501'; end if;
    update public.products set status='completed' where id=pid and workspace_id=p_workspace_id and status<>'completed';
    select to_jsonb(p)||jsonb_build_object('tags',public.product_tag_list(p_workspace_id,p.id)) into entity from public.products p where p.id=pid and p.workspace_id=p_workspace_id;
    result := jsonb_build_object('product',entity);
  elsif p_kind='delete_product' then
    pid := p_payload->>'id';
    delete from public.products where id=pid and workspace_id=p_workspace_id returning id into pid;
    if pid is null then raise exception 'Product unavailable' using errcode='42501'; end if;
    result := jsonb_build_object('deleted',pid);
  elsif p_kind='save_category' then
    cid := (p_payload->>'id')::uuid;
    if cid is null then
      insert into public.categories(workspace_id,name) values(p_workspace_id,p_payload->>'name') returning to_jsonb(categories.*) into entity;
    else
      update public.categories set name=p_payload->>'name' where id=cid and workspace_id=p_workspace_id returning to_jsonb(categories.*) into entity;
    end if;
    if entity is null then raise exception 'Category unavailable' using errcode='42501'; end if;
    result := jsonb_build_object('category',entity);
  elsif p_kind='delete_category' then
    delete from public.categories where id=(p_payload->>'id')::uuid and workspace_id=p_workspace_id returning id into cid;
    if cid is null then raise exception 'Category unavailable' using errcode='42501'; end if;
    result := jsonb_build_object('deleted',cid);
  elsif p_kind='create_tag' then
    insert into public.tags(workspace_id,name,color) values(p_workspace_id,p_payload->>'name',p_payload->>'color') returning to_jsonb(tags.*) into entity;
    result := jsonb_build_object('tag',entity);
  else raise exception 'Invalid operation kind' using errcode='22023'; end if;
  insert into shopik_private.operation_receipts(workspace_id,operation_id,kind,payload_hash,response) values(p_workspace_id,p_operation_id,p_kind,encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'),case when result ? 'product' then jsonb_build_object('product_id',pid) else result end);
  return result;
end; $$;
revoke all on function public.apply_operation(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.apply_operation(uuid,uuid,text,jsonb) to authenticated;

create or replace function public.list_snapshot(p_workspace_id uuid,p_kind text,p_category_id uuid,p_month date,p_tag_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare products jsonb := '[]'; expenses jsonb := 'null'; ids text[];
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  if p_kind='products' then
    products := public.filtered_products(p_workspace_id,p_category_id,p_tag_ids);
    select coalesce(array_agg(x->>'id'),'{}') into ids from jsonb_array_elements(products) x;
  elsif p_kind='expenses' then
    expenses := public.expense_month_tags(p_workspace_id,p_month,p_tag_ids);
    select coalesce(array_agg(x->>'product_id'),'{}') into ids from jsonb_array_elements(expenses->'items') x;
  else raise exception 'Invalid list kind' using errcode='22023'; end if;
  return jsonb_build_object('products',products,'expenses',expenses,'authors',case when p_kind='expenses' then coalesce((select jsonb_agg(item->'author') from jsonb_array_elements(expenses->'items') item),'[]'::jsonb) else public.product_authors_for_ids(p_workspace_id,ids) end);
end; $$;
revoke all on function public.list_snapshot(uuid,text,uuid,date,uuid[]) from public,anon;
grant execute on function public.list_snapshot(uuid,text,uuid,date,uuid[]) to authenticated;


notify pgrst,'reload schema';
commit;
