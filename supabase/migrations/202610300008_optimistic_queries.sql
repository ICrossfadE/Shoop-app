begin;

-- Receipts are not exposed through PostgREST's public schema. They commit in the
-- same transaction as the mutation; RLS binds them to the caller and Workspace.
create schema if not exists shopik_private;
revoke all on schema shopik_private from public, anon;
grant usage on schema shopik_private to authenticated;
create table shopik_private.operation_receipts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  operation_id uuid not null,
  kind text not null,
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id, workspace_id, operation_id)
);
alter table shopik_private.operation_receipts enable row level security;
revoke all on shopik_private.operation_receipts from public, anon, authenticated;
grant select, insert on shopik_private.operation_receipts to authenticated;
create policy own_receipts on shopik_private.operation_receipts for select to authenticated
  using(user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy own_receipts_insert on shopik_private.operation_receipts for insert to authenticated
  with check(user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- Keep the existing signature for old clients; write only changed fields/links.
create or replace function public.save_product_tags(p_workspace_id uuid, p_product_id text, p_name text, p_description text,
  p_price numeric, p_category_id uuid, p_tag_ids uuid[]) returns text
language plpgsql security invoker set search_path = '' as $$
declare saved_id text; existing public.products;
begin
  perform public.check_tag_filter(p_workspace_id, p_tag_ids);
  if p_product_id is null then
    insert into public.products(workspace_id, category_id, name, description, price)
    values(p_workspace_id,p_category_id,p_name,p_description,p_price) returning id into saved_id;
  else
    select * into existing from public.products where workspace_id=p_workspace_id and id=p_product_id for update;
    if not found then raise exception 'Product unavailable' using errcode='42501'; end if;
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

-- Scope public author metadata to the actual result, preserving self-only profile RLS.
create function public.product_authors_for_ids(p_workspace_id uuid,p_ids text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('product_id',p.id,'display_name',coalesce(pr.display_name,''),
    'avatar_url',coalesce(pr.avatar_url,''),'created_at',p.created_at)),'[]'::jsonb) into result
    from public.products p left join public.profiles pr on pr.id=p.created_by where p.workspace_id=p_workspace_id and p.id=any(p_ids);
  return result;
end; $$;
revoke all on function public.product_authors_for_ids(uuid,text[]) from public,anon;
grant execute on function public.product_authors_for_ids(uuid,text[]) to authenticated;

-- One snapshot supplies rows and their authors; expense rows/totals stay atomic.
create function public.list_snapshot(p_workspace_id uuid,p_kind text,p_category_id uuid,p_month date,p_tag_ids uuid[]) returns jsonb
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
  return jsonb_build_object('products',products,'expenses',expenses,'authors',public.product_authors_for_ids(p_workspace_id,ids));
end; $$;
revoke all on function public.list_snapshot(uuid,text,uuid,date,uuid[]) from public,anon;
grant execute on function public.list_snapshot(uuid,text,uuid,date,uuid[]) to authenticated;

-- Invoker rights retain all table RLS, constraints and completion triggers.
-- Lock serializes retries from multiple tabs; a reused key cannot change intent.
create function public.apply_operation(p_workspace_id uuid,p_operation_id uuid,p_kind text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare receipt shopik_private.operation_receipts; result jsonb; pid text; cid uuid; tids uuid[]; entity jsonb;
begin
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
create or replace function public.ensure_personal_workspace()
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

  return query select w.id,w.name,m.role from public.workspaces w join public.workspace_members m on m.workspace_id=w.id
    where w.owner_id=current_user_id and w.is_personal and m.user_id=current_user_id;
  if found then return; end if;

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


notify pgrst,'reload schema';
commit;
