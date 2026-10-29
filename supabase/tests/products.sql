-- Run this WHOLE file after migration 202610290002_products.sql.
-- Fixture users and products are rolled back, including on a test failure.
begin;
insert into auth.users(id, email) values
  ('b8bc6ee0-9ddb-456a-8f41-637ec271b001', 'shopik-products-a@example.invalid'),
  ('b8bc6ee0-9ddb-456a-8f41-637ec271b002', 'shopik-products-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec271b001","role":"authenticated"}', true);
select * from public.ensure_personal_workspace();
insert into public.products(workspace_id, name, description, price)
  select id, 'Тестовий продукт', '', 12.50 from public.workspaces where owner_id = auth.uid() and is_personal;

-- Owner CRUD, SHA256 format, immutable ownership and monetary constraints.
do $$
declare product_id text; affected integer;
begin
  select id into strict product_id from public.products where created_by = auth.uid();
  if product_id !~ '^[0-9a-f]{64}$' then raise exception 'Invalid SHA256 ID'; end if;
  update public.products set name = 'Оновлений продукт', price = 0, status = 'completed' where id = product_id;
  if not exists(select 1 from public.products where id = product_id and name = 'Оновлений продукт' and price = 0 and status = 'completed' and currency = 'UAH') then
    raise exception 'Product update failed';
  end if;
  update public.products set status = 'active' where id = product_id;
  begin
    update public.products set price = -1 where id = product_id;
    raise exception 'Negative price accepted';
  exception when check_violation then null; end;
  begin
    update public.products set price = 0.001 where id = product_id;
    raise exception 'Price was rounded instead of rejected';
  exception when check_violation then null; end;
  begin
    update public.products set name = ' ' where id = product_id;
    raise exception 'Empty product name accepted';
  exception when check_violation then null; end;
  begin
    update public.products set workspace_id = gen_random_uuid() where id = product_id;
    raise exception 'Workspace reassignment allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.products set created_by = 'b8bc6ee0-9ddb-456a-8f41-637ec271b002' where id = product_id;
    raise exception 'Author spoofing allowed';
  exception when insufficient_privilege then null; end;
  insert into public.products(workspace_id, name, price)
    select workspace_id, 'Видалити', 1 from public.products where id = product_id;
  delete from public.products where created_by = auth.uid() and name = 'Видалити';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Own delete failed'; end if;
end;
$$;

-- Retain the first user's Workspace ID for explicit cross-workspace attacks.
select set_config('shopik.test_workspace_a', (select id::text from public.workspaces where owner_id = auth.uid() and is_personal), true);
select set_config('request.jwt.claims', '{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec271b002","role":"authenticated"}', true);
select * from public.ensure_personal_workspace();
do $$
declare affected integer;
begin
  if exists(select 1 from public.products) then raise exception 'User B can read A products'; end if;
  update public.products set name = 'Атака' where workspace_id = current_setting('shopik.test_workspace_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-workspace update allowed'; end if;
  delete from public.products where workspace_id = current_setting('shopik.test_workspace_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-workspace delete allowed'; end if;
  begin
    insert into public.products(workspace_id, name, price) values(current_setting('shopik.test_workspace_a')::uuid, 'Атака', 1);
    raise exception 'Cross-workspace insert allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

-- A legitimate member can collaborate without impersonating the author.
reset role;
insert into public.workspace_members(workspace_id, user_id, role)
values(current_setting('shopik.test_workspace_a')::uuid, 'b8bc6ee0-9ddb-456a-8f41-637ec271b002', 'member');
set local role authenticated;
do $$
declare affected integer;
begin
  if not exists(select 1 from public.products where name = 'Оновлений продукт') then raise exception 'Member read denied'; end if;
  update public.products set status = 'completed' where name = 'Оновлений продукт';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Member status update denied'; end if;
  insert into public.products(workspace_id, name, price) values(current_setting('shopik.test_workspace_a')::uuid, 'Продукт учасника', 1);
  if not exists(select 1 from public.products where name = 'Продукт учасника' and created_by = auth.uid()) then raise exception 'Member author missing'; end if;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.products;
    raise exception 'Anonymous product read allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.products(workspace_id, name, price) values(current_setting('shopik.test_workspace_a')::uuid, 'Атака', 1);
    raise exception 'Anonymous product insert allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

rollback;
