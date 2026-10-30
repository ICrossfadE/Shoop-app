-- Run WHOLE file after migration 006. All test users/products/metadata roll back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
('b8bc6ee0-9ddb-456a-8f41-637ec271e001', 'shopik-ui-a@example.invalid', '{"full_name":"Автор A","avatar_url":"https://example.invalid/a.png"}'),
('b8bc6ee0-9ddb-456a-8f41-637ec271e002', 'shopik-ui-b@example.invalid', '{"full_name":"Автор B","avatar_url":"https://example.invalid/b.png"}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec271e001","role":"authenticated"}', true);
select * from public.ensure_personal_workspace();
select set_config('shopik.ui_workspace', (select workspace_id::text from public.workspace_members limit 1), true);
select set_config('shopik.ui_category', (select id::text from public.categories limit 1), true);
insert into public.tags(workspace_id, name, color) values(current_setting('shopik.ui_workspace')::uuid, 'Тест', '#123456');
select set_config('shopik.ui_tag', (select id::text from public.tags limit 1), true);
select set_config('shopik.ui_product', public.save_product_tags(current_setting('shopik.ui_workspace')::uuid, null,
  'Продукт автора A', '', 50, current_setting('shopik.ui_category')::uuid, array[current_setting('shopik.ui_tag')::uuid]), true);
select set_config('shopik.ui_created', (select created_at::text from public.products limit 1), true);

do $$
declare wid uuid := current_setting('shopik.ui_workspace')::uuid;
  cid uuid := current_setting('shopik.ui_category')::uuid;
  pid text := current_setting('shopik.ui_product'); authors jsonb;
begin
  authors := public.workspace_product_authors(wid);
  if jsonb_array_length(authors) <> 1 or authors->0->>'display_name' <> 'Автор A'
    or authors->0->>'avatar_url' <> 'https://example.invalid/a.png' or (authors->0) ? 'email'
    or (authors->0->>'created_at')::timestamptz <> current_setting('shopik.ui_created')::timestamptz then raise exception 'Wrong public author fields'; end if;
  if jsonb_array_length(public.filtered_products(wid,cid,'{}')) <> 1 then raise exception 'Active product not listed'; end if;
  update public.products set status = 'completed' where id = pid;
  update public.products set status = 'completed' where id = pid;
  if jsonb_array_length(public.filtered_products(wid,cid,'{}')) <> 0 then raise exception 'Completed product not hidden'; end if;
  if (select count(*) from public.expenses where product_id = pid) <> 1 then raise exception 'Expense duplicated'; end if;
  if not exists(select 1 from public.products where id = pid and created_at = current_setting('shopik.ui_created')::timestamptz) then raise exception 'Creation date changed'; end if;
  begin
    update public.products set status = 'active' where id = pid;
    raise exception 'Direct reactivation allowed';
  exception when check_violation then null; end;
  begin
    update public.products set name = 'Підміна', price = 999 where id = pid;
    raise exception 'Direct completed edit allowed';
  exception when check_violation then null; end;
  begin
    perform public.save_product_tags(wid,pid,'Продукт автора A','',50,cid,'{}');
    raise exception 'Completed RPC edit allowed';
  exception when check_violation then null; end;
  begin
    delete from public.product_tags where product_id = pid;
    raise exception 'Completed tag removal allowed';
  exception when check_violation then null; end;
  begin
    insert into public.product_tags(workspace_id,product_id,tag_id) values(wid,pid,current_setting('shopik.ui_tag')::uuid);
    raise exception 'Completed tag insertion allowed';
  exception when check_violation then null; end;
  begin
    delete from public.categories where id = cid;
    raise exception 'Category with completed product deleted';
  exception when foreign_key_violation or restrict_violation then null; end;
end;
$$;

-- B cannot read A's public author metadata until explicitly added to A's Workspace.
select set_config('request.jwt.claims', '{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec271e002","role":"authenticated"}', true);
select * from public.ensure_personal_workspace();
do $$
begin
  begin
    perform public.workspace_product_authors(current_setting('shopik.ui_workspace')::uuid);
    raise exception 'Foreign author metadata exposed';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.profiles where id = 'b8bc6ee0-9ddb-456a-8f41-637ec271e001') then raise exception 'Global profile read enabled'; end if;
end;
$$;
reset role;
insert into public.workspace_members(workspace_id,user_id,role)
values(current_setting('shopik.ui_workspace')::uuid,'b8bc6ee0-9ddb-456a-8f41-637ec271e002','member');
set local role authenticated;
select public.save_product_tags(current_setting('shopik.ui_workspace')::uuid,null,'Продукт автора B','',10,current_setting('shopik.ui_category')::uuid,'{}');
do $$
declare authors jsonb;
begin
  authors := public.workspace_product_authors(current_setting('shopik.ui_workspace')::uuid);
  if jsonb_array_length(authors) <> 2 or not exists(select 1 from jsonb_array_elements(authors) a where a->>'display_name' = 'Автор A')
    or not exists(select 1 from jsonb_array_elements(authors) a where a->>'display_name' = 'Автор B') then raise exception 'Shared Workspace authors incorrect'; end if;
  delete from public.products where id = current_setting('shopik.ui_product');
  if exists(select 1 from public.expenses where product_id = current_setting('shopik.ui_product'))
    or exists(select 1 from public.product_tags where product_id = current_setting('shopik.ui_product')) then raise exception 'Completed deletion failed to cascade'; end if;
  if (select count(*) from public.tags) <> 1 then raise exception 'Product deletion removed tag'; end if;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform public.workspace_product_authors(current_setting('shopik.ui_workspace')::uuid);
    raise exception 'Anonymous authors exposed';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
select 'PASS: final completion, active lists, immutable tags, scoped authors and deletion' as result;
