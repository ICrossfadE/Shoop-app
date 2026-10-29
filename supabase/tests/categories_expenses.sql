-- Run the WHOLE file AFTER ALL current migrations. All fixture data is rolled back.
begin;
insert into auth.users(id, email) values
('b8bc6ee0-9ddb-456a-8f41-637ec271c001', 'shopik-categories-a@example.invalid'),
('b8bc6ee0-9ddb-456a-8f41-637ec271c002', 'shopik-categories-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec271c001","role":"authenticated"}', true);
select * from public.ensure_personal_workspace();
select * from public.ensure_personal_workspace();
select set_config('shopik.test_workspace_a', (select workspace_id::text from public.workspace_members limit 1), true);

-- The default is editable, removable when empty, and never recreated on login.
do $$
begin
  if (select count(*) from public.categories) <> 1 then raise exception 'Default duplicated or missing'; end if;
  if not exists(select 1 from public.categories where name = 'Обов''язкові покупки') then raise exception 'Wrong default name'; end if;
  update public.categories set name = 'Перейменована';
  delete from public.categories;
  perform public.ensure_personal_workspace();
  if exists(select 1 from public.categories) then raise exception 'Deleted default recreated'; end if;
  begin
    insert into public.products(workspace_id, name, price) values(current_setting('shopik.test_workspace_a')::uuid, 'Без категорії', 1);
    raise exception 'Product without category accepted';
  exception when not_null_violation then null; end;
end;
$$;
insert into public.categories(workspace_id, name) values(current_setting('shopik.test_workspace_a')::uuid, 'Їжа');
select set_config('shopik.test_category_a', (select id::text from public.categories where name = 'Їжа'), true);
insert into public.products(workspace_id, category_id, name, price)
values(current_setting('shopik.test_workspace_a')::uuid, current_setting('shopik.test_category_a')::uuid, 'Молоко', 50);

-- Completion is idempotent and final; deletion removes its expense.
do $$
declare pid text;
begin
  select id into strict pid from public.products where name = 'Молоко';
  begin
    delete from public.categories where id = current_setting('shopik.test_category_a')::uuid;
    raise exception 'Nonempty category deleted';
  exception when foreign_key_violation then null; end;
  update public.products set status = 'completed' where id = pid;
  update public.products set status = 'completed' where id = pid;
  if (select count(*) from public.expenses where product_id = pid) <> 1 then raise exception 'Completion duplicated or lost'; end if;
  begin
    update public.products set price = 70, name = 'Молоко нове' where id = pid;
    raise exception 'Completed edit allowed';
  exception when check_violation then null; end;
  update public.categories set name = 'Продукти' where id = current_setting('shopik.test_category_a')::uuid;
  if not exists(select 1 from public.expenses where product_id = pid and amount = 50 and name = 'Молоко' and category_name = 'Їжа') then raise exception 'Snapshot mutated'; end if;
  begin
    update public.products set status = 'active' where id = pid;
    raise exception 'Reactivation allowed';
  exception when check_violation then null; end;
  delete from public.products where id = pid;
  if exists(select 1 from public.expenses where product_id = pid) then raise exception 'Delete kept expense'; end if;
  insert into public.products(workspace_id, category_id, name, price)
  values(current_setting('shopik.test_workspace_a')::uuid, current_setting('shopik.test_category_a')::uuid, 'Активний', 1);
  delete from public.products where name = 'Активний';
  if exists(select 1 from public.expenses) then raise exception 'Active deletion created expense'; end if;
end;
$$;

-- Fixed instants test Kyiv month/year boundaries independently of execution date.
insert into public.products(workspace_id, category_id, name, price)
select current_setting('shopik.test_workspace_a')::uuid, current_setting('shopik.test_category_a')::uuid, name, price
from (values ('Кінець жовтня', 10), ('Початок листопада', 20), ('Новий рік', 30), ('Інший рік', 40)) v(name, price);
update public.products set status = 'completed';
reset role;
update public.expenses set occurred_at = case name
  when 'Кінець жовтня' then timestamptz '2026-10-31 21:59:59+00'
  when 'Початок листопада' then timestamptz '2026-10-31 22:00:00+00'
  when 'Новий рік' then timestamptz '2026-12-31 22:00:00+00'
  when 'Інший рік' then timestamptz '2025-10-15 12:00:00+00'
  end
where workspace_id = current_setting('shopik.test_workspace_a')::uuid;
set local role authenticated;
do $$
declare summary jsonb; wid uuid := current_setting('shopik.test_workspace_a')::uuid;
begin
  summary := public.expense_month(wid, '2026-10-01');
  if (summary->>'total')::numeric <> 10 or jsonb_array_length(summary->'items') <> 1
    or (summary->'categories'->0->>'total')::numeric <> 10 then raise exception 'October aggregation wrong'; end if;
  if (public.expense_month(wid, '2026-11-01')->>'total')::numeric <> 20 then raise exception 'Kyiv November boundary wrong'; end if;
  if (public.expense_month(wid, '2027-01-01')->>'total')::numeric <> 30 then raise exception 'Kyiv year boundary wrong'; end if;
  if (public.expense_month(wid, '2025-10-01')->>'total')::numeric <> 40 then raise exception 'Years merged'; end if;
  if (public.expense_month(wid, '2026-02-01')->>'total')::numeric <> 0 then raise exception 'Empty month not zero'; end if;
  begin
    update public.expenses set amount = 0;
    raise exception 'Direct expense tampering allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

-- User B cannot read, modify or aggregate A's data, nor link products across Workspaces.
select set_config('request.jwt.claims', '{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec271c002","role":"authenticated"}', true);
select * from public.ensure_personal_workspace();
do $$
declare own_workspace uuid; affected integer;
begin
  select workspace_id into strict own_workspace from public.workspace_members;
  if exists(select 1 from public.categories where workspace_id = current_setting('shopik.test_workspace_a')::uuid)
    or exists(select 1 from public.expenses) then raise exception 'Cross-Workspace read allowed'; end if;
  delete from public.categories where workspace_id = current_setting('shopik.test_workspace_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-Workspace category delete allowed'; end if;
  begin
    insert into public.products(workspace_id, category_id, name, price)
    values(own_workspace, current_setting('shopik.test_category_a')::uuid, 'Чужа категорія', 1);
    raise exception 'Cross-Workspace category reference accepted';
  exception when foreign_key_violation then null; end;
  begin
    perform public.expense_month(current_setting('shopik.test_workspace_a')::uuid, '2026-10-01');
    raise exception 'Cross-Workspace aggregation allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.categories;
    raise exception 'Anonymous category read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.expenses;
    raise exception 'Anonymous expense read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.expense_month(current_setting('shopik.test_workspace_a')::uuid, '2026-10-01');
    raise exception 'Anonymous aggregation allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
select 'PASS: categories, expense lifecycle, Kyiv months and RLS' as result;
