begin;
-- Quantity defaults preserve existing prices; all totals stay within the money limit.
alter table public.products add column quantity integer not null default 1 check(quantity between 1 and 1000000);
alter table public.products add constraint products_total_limit check(price * quantity <= 99999999.99);
grant insert(quantity), update(quantity) on public.products to authenticated;
alter table public.expenses add column planned_amount numeric check(planned_amount between 0 and 99999999.99 and planned_amount=round(planned_amount,2));
-- Corrected historical expenses have no trustworthy initial plan: leave NULL.
alter table public.tags add column deleted_at timestamptz;
drop index public.tags_workspace_name;
create unique index tags_workspace_name on public.tags(workspace_id,lower(name)) where deleted_at is null;
drop policy tags_read on public.tags;
create policy tags_read on public.tags for select to authenticated using(public.is_workspace_member(workspace_id) and deleted_at is null);
-- Membership permits shared edits, never writes to protected identity columns.
drop policy products_delete_member on public.products;
create policy products_delete_member on public.products for delete to authenticated using(public.workspace_write_access(workspace_id));
create or replace function public.guard_product_actor() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user='authenticated' then perform public.workspace_write_access(new.workspace_id); end if;
  return new;
end; $$;
drop policy product_tags_create on public.product_tags;
drop policy product_tags_delete on public.product_tags;
create policy product_tags_create on public.product_tags for insert to authenticated with check(public.workspace_write_access(workspace_id) and exists(select 1 from public.tags t where t.workspace_id=product_tags.workspace_id and t.id=tag_id and t.deleted_at is null));
create policy product_tags_delete on public.product_tags for delete to authenticated using(public.workspace_write_access(workspace_id));
-- OR uses EXISTS so each product contributes only once.
create or replace function public.product_matches_tags(p_workspace_id uuid,p_product_id text,p_tag_ids uuid[]) returns boolean
language sql stable security invoker set search_path='' as $$
 select p_tag_ids is not null and (cardinality(p_tag_ids)=0 or exists(select 1 from public.product_tags pt where pt.workspace_id=p_workspace_id and pt.product_id=p_product_id and pt.tag_id=any(p_tag_ids)));
$$;
create or replace function public.save_product_tags(p_workspace_id uuid, p_product_id text, p_name text, p_description text,
  p_price numeric, p_category_id uuid, p_tag_ids uuid[], p_quantity integer) returns text
language plpgsql security invoker set search_path = '' as $$
declare saved_id text; existing public.products;
begin
  perform public.workspace_write_access(p_workspace_id);
  perform public.check_tag_filter(p_workspace_id, p_tag_ids);
  if p_product_id is null then
    insert into public.products(workspace_id, category_id, name, description, price, quantity)
    values(p_workspace_id,p_category_id,p_name,p_description,p_price,p_quantity) returning id into saved_id;
  else
    select * into existing from public.products where workspace_id=p_workspace_id and id=p_product_id for update;
    if not found then raise exception 'Product unavailable' using errcode='42501'; end if;
    if existing.status='completed' then raise exception 'Completed products can only be deleted' using errcode='23514'; end if;
    saved_id := existing.id;
    if (existing.category_id,existing.name,existing.description,existing.price,existing.quantity) is distinct from (p_category_id,p_name,p_description,p_price,p_quantity) then
      update public.products set category_id=p_category_id,name=p_name,description=p_description,price=p_price,quantity=p_quantity
      where workspace_id=p_workspace_id and id=saved_id;
    end if;
  end if;
  delete from public.product_tags where workspace_id=p_workspace_id and product_id=saved_id and not(tag_id=any(p_tag_ids));
  insert into public.product_tags(workspace_id,product_id,tag_id)
    select p_workspace_id,saved_id,q.id from (select distinct unnest(p_tag_ids) id) q
    where not exists(select 1 from public.product_tags pt where pt.workspace_id=p_workspace_id and pt.product_id=saved_id and pt.tag_id=q.id);
  return saved_id;
end; $$;
create or replace function public.sync_product_expense() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' then
    delete from public.expenses where product_id=new.id and not archived;
  elsif tg_op='INSERT' or old.status<>'completed' then
    insert into public.expenses(workspace_id,product_id,name,category_id,category_name,amount,currency,occurred_at,created_by,author,tags,planned_amount)
    select new.workspace_id,new.id,new.name,new.category_id,c.name,new.price*new.quantity,new.currency,clock_timestamp(),new.created_by,
      jsonb_build_object('product_id',new.id,'display_name',coalesce(pr.display_name,''),'avatar_url',coalesce(pr.avatar_url,''),'created_at',new.created_at),
      public.product_tag_list(new.workspace_id,new.id),new.price*new.quantity
    from public.categories c left join public.profiles pr on pr.id=new.created_by
    where c.id=new.category_id and c.workspace_id=new.workspace_id
    on conflict(product_id) do nothing;
  end if;
  return new;
end; $$;
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
      and (cardinality(p_tag_ids)=0 or exists(select 1 from jsonb_array_elements(e.tags) t where (t->>'id')::uuid=any(p_tag_ids)))
  ), category_totals as (
    select category_id,category_name,sum(amount) total,count(*) count from month_rows group by category_id,category_name
  )
  select jsonb_build_object('total',coalesce((select sum(amount) from month_rows),0),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by category_name,category_id) from category_totals c),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(r) order by occurred_at desc,id) from month_rows r),'[]'::jsonb)) into result;
  return result;
end; $$;
create or replace function public.filtered_products(p_workspace_id uuid, p_category_id uuid, p_tag_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  perform public.check_tag_filter(p_workspace_id, p_tag_ids);
  select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('tags', public.product_tag_list(p.workspace_id, p.id))
    order by p.created_at desc, p.id), '[]'::jsonb) into result
  from public.products p where p.workspace_id = p_workspace_id and (p_category_id is null or p.category_id = p_category_id) and p.status = 'active'
    and public.product_matches_tags(p.workspace_id, p.id, p_tag_ids);
  return result;
end;
$$;

-- Keep snapshots and completed tag links while hiding deleted tags from the catalog.
create function public.delete_workspace_tag(p_workspace_id uuid,p_tag_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.workspace_write_access(p_workspace_id);
 if not exists(select 1 from public.tags where workspace_id=p_workspace_id and id=p_tag_id) then raise exception 'Tag unavailable' using errcode='22023'; end if;
 update public.tags set deleted_at=coalesce(deleted_at,clock_timestamp()) where workspace_id=p_workspace_id and id=p_tag_id;
 delete from public.product_tags pt using public.products p where pt.workspace_id=p_workspace_id and pt.tag_id=p_tag_id and p.workspace_id=pt.workspace_id and p.id=pt.product_id and p.status='active';
end; $$;
revoke all on function public.delete_workspace_tag(uuid,uuid) from public,anon;
grant execute on function public.delete_workspace_tag(uuid,uuid) to authenticated;
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
    pid := public.save_product_tags(p_workspace_id,p_payload->>'id',p_payload->>'name',p_payload->>'description',(p_payload->>'price')::numeric,(p_payload->>'category_id')::uuid,tids,coalesce((p_payload->>'quantity')::integer,1));
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
  elsif p_kind='delete_tag' then
    perform public.delete_workspace_tag(p_workspace_id,(p_payload->>'id')::uuid);
    result := jsonb_build_object('deletedTag',p_payload->>'id');
  elsif p_kind='create_tag' then
    insert into public.tags(workspace_id,name,color) values(p_workspace_id,p_payload->>'name',p_payload->>'color') returning to_jsonb(tags.*) into entity;
    result := jsonb_build_object('tag',entity);
  else raise exception 'Invalid operation kind' using errcode='22023'; end if;
  insert into shopik_private.operation_receipts(workspace_id,operation_id,kind,payload_hash,response) values(p_workspace_id,p_operation_id,p_kind,encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'),case when result ? 'product' then jsonb_build_object('product_id',pid) else result end);
  return result;
end; $$;
create or replace function public.correct_expense_price(p_workspace_id uuid, p_expense_id uuid,
  p_operation_id uuid, p_amount numeric, p_expected_amount numeric) returns numeric
language plpgsql security definer set search_path = '' as $$
declare expense public.expenses; previous_hash text; input_hash text;
begin
  perform public.workspace_write_access(p_workspace_id);
  if p_operation_id is null or p_expense_id is null or p_amount is null
    or p_amount < 0 or p_amount > 99999999.99 or p_amount <> round(p_amount, 2)
    or p_expected_amount is null then
    raise exception 'Invalid expense price' using errcode='22023';
  end if;
  select * into expense from public.expenses
    where workspace_id=p_workspace_id and id=p_expense_id for update;
  if not found or expense.archived then
    raise exception 'Only live expenses can be corrected' using errcode='42501';
  end if;
  input_hash := encode(sha256(convert_to(jsonb_build_array(p_expense_id, p_amount, p_expected_amount)::text, 'UTF8')), 'hex');
  select payload_hash into previous_hash from shopik_private.expense_price_receipts
    where user_id=auth.uid() and workspace_id=p_workspace_id and operation_id=p_operation_id;
  if found then
    if previous_hash <> input_hash then
      raise exception 'Operation key reused' using errcode='22023';
    end if;
    return expense.amount;
  end if;
  if expense.amount <> p_expected_amount then
    raise exception 'Expense price changed; reload' using errcode='40001';
  end if;
  update public.expenses set amount=p_amount where id=expense.id and workspace_id=p_workspace_id;
  insert into shopik_private.expense_price_receipts(user_id, workspace_id, operation_id, payload_hash)
    values(auth.uid(), p_workspace_id, p_operation_id, input_hash);
  return p_amount;
end;
$$;

-- A confirmed selection has a single atomic commit and a retained retry receipt.
create function public.complete_products(p_workspace_id uuid,p_operation_id uuid,p_items jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare receipt shopik_private.operation_receipts; input_hash text; item jsonb; product public.products; ids text[] := '{}';
begin
 perform public.workspace_write_access(p_workspace_id);
 if p_operation_id is null or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception 'Invalid selection' using errcode='22023'; end if;
 input_hash := encode(sha256(convert_to(p_items::text,'UTF8')),'hex');
 select * into receipt from shopik_private.operation_receipts where user_id=auth.uid() and workspace_id=p_workspace_id and operation_id=p_operation_id;
 if found then
  if receipt.kind<>'complete_products' or receipt.payload_hash<>input_hash then raise exception 'Operation key reused' using errcode='22023'; end if;
  return receipt.response;
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if (item->>'id')=any(ids) then raise exception 'Duplicate selection' using errcode='22023'; end if;
  select * into product from public.products where workspace_id=p_workspace_id and id=item->>'id' for update;
  if not found then raise exception 'Selection changed' using errcode='40001'; end if;
  if item->>'updated_at' is null or product.price*product.quantity is distinct from (item->>'amount')::numeric or (product.status='active' and product.updated_at is distinct from (item->>'updated_at')::timestamptz) then raise exception 'Selection changed' using errcode='40001'; end if;
  ids := array_append(ids,product.id);
 end loop;
 update public.products set status='completed' where workspace_id=p_workspace_id and id=any(ids) and status='active';
 insert into shopik_private.operation_receipts(workspace_id,operation_id,kind,payload_hash,response) values(p_workspace_id,p_operation_id,'complete_products',input_hash,jsonb_build_object('completed',to_jsonb(ids)));
 return jsonb_build_object('completed',to_jsonb(ids));
end; $$;
revoke all on function public.complete_products(uuid,uuid,jsonb) from public,anon;
grant execute on function public.complete_products(uuid,uuid,jsonb) to authenticated;
-- The legacy RPC delegates to the same shared authorization path.
create or replace function public.save_product_tags(p_workspace_id uuid,p_product_id text,p_name text,p_description text,p_price numeric,p_category_id uuid,p_tag_ids uuid[]) returns text
language sql security invoker set search_path='' as $$
 select public.save_product_tags(p_workspace_id,p_product_id,p_name,p_description,p_price,p_category_id,p_tag_ids,1);
$$;
revoke all on function public.save_product_tags(uuid,text,text,text,numeric,uuid,uuid[],integer) from public,anon;
grant execute on function public.save_product_tags(uuid,text,text,text,numeric,uuid,uuid[],integer) to authenticated;
notify pgrst,'reload schema';
commit;
