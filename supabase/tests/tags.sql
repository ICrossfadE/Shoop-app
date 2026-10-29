-- Run the WHOLE file after ALL current migrations. Fixtures roll back.
begin;
insert into auth.users(id, email) values
('b8bc6ee0-9ddb-456a-8f41-637ec271d001', 'shopik-tags-a@example.invalid'),
('b8bc6ee0-9ddb-456a-8f41-637ec271d002', 'shopik-tags-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec271d001","role":"authenticated"}', true);
select * from public.ensure_personal_workspace();
select set_config('shopik.tags_workspace_a', (select workspace_id::text from public.workspace_members limit 1), true);
select set_config('shopik.tags_category_a', (select id::text from public.categories limit 1), true);
insert into public.tags(workspace_id, name, color) values
(current_setting('shopik.tags_workspace_a')::uuid, 'Щотижня', '#AABBCC'),
(current_setting('shopik.tags_workspace_a')::uuid, 'Сніданок', '#112233');
select set_config('shopik.tag_one', (select id::text from public.tags where name = 'Щотижня'), true);
select set_config('shopik.tag_two', (select id::text from public.tags where name = 'Сніданок'), true);

-- Two products priced 50 each must contribute 100, not 50 or 200 from joins.
select set_config('shopik.tag_product_a', public.save_product_tags(current_setting('shopik.tags_workspace_a')::uuid, null,
  'Молоко', '', 50, current_setting('shopik.tags_category_a')::uuid,
  array[current_setting('shopik.tag_one')::uuid, current_setting('shopik.tag_two')::uuid, current_setting('shopik.tag_one')::uuid]), true);
select set_config('shopik.tag_product_b', public.save_product_tags(current_setting('shopik.tags_workspace_a')::uuid, null,
  'Хліб', '', 50, current_setting('shopik.tags_category_a')::uuid, array[current_setting('shopik.tag_one')::uuid]), true);
select set_config('shopik.tag_product_c', public.save_product_tags(current_setting('shopik.tags_workspace_a')::uuid, null,
  'Без тегів', '', 25, current_setting('shopik.tags_category_a')::uuid, '{}'::uuid[]), true);

reset role;


-- Inject a failure AFTER product UPDATE, during link insertion, to prove rollback.
create function public.shopik_test_tag_link_failure() returns trigger language plpgsql as $$
begin
  if current_setting('shopik.test_fail_link', true) = 'yes' then raise exception 'Test link failure' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger shopik_test_tag_link_failure before insert on public.product_tags for each row execute function public.shopik_test_tag_link_failure();
set local role authenticated;
do $$
declare wid uuid := current_setting('shopik.tags_workspace_a')::uuid;
  cid uuid := current_setting('shopik.tags_category_a')::uuid;
  t1 uuid := current_setting('shopik.tag_one')::uuid;
  t2 uuid := current_setting('shopik.tag_two')::uuid;
  pid text := current_setting('shopik.tag_product_a'); result jsonb;
begin
  if (select count(*) from public.product_tags where product_id = pid) <> 2 then raise exception 'Tag link duplicates'; end if;
  if jsonb_array_length(public.filtered_products(wid, cid, '{}')) <> 3 then raise exception 'No-filter omitted untagged product'; end if;
  if jsonb_array_length(public.filtered_products(wid, cid, array[t1])) <> 2 then raise exception 'Single tag filter failed'; end if;
  if jsonb_array_length(public.filtered_products(wid, cid, array[t1,t2])) <> 1 then raise exception 'AND tag filter failed'; end if;

  begin
    insert into public.tags(workspace_id, name, color) values(wid, 'щотижня', '#000000');
    raise exception 'Duplicate name accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.tags(workspace_id, name, color) values(wid, 'Invalid color', 'red');
    raise exception 'Invalid color accepted';
  exception when check_violation then null; end;
  begin
    perform public.filtered_products(wid, cid, array[gen_random_uuid()]);
    raise exception 'Unknown filter silently broadened results';
  exception when invalid_parameter_value then null; end;
  perform set_config('shopik.test_fail_link', 'yes', true);
  begin
    perform public.save_product_tags(wid, pid, 'Не зберігати', '', 999, cid, array[t1]);
    raise exception 'Injected link failure did not run';
  exception when check_violation then null; end;
  perform set_config('shopik.test_fail_link', 'no', true);
  if not exists(select 1 from public.products where id = pid and name = 'Молоко' and price = 50)
    or (select count(*) from public.product_tags where product_id = pid) <> 2 then raise exception 'Atomic save rolled back only part of product'; end if;
  -- Active products can still change their tag set.
  perform public.save_product_tags(wid, pid, 'Молоко', '', 50, cid, '{}');
  if jsonb_array_length(public.filtered_products(wid, cid, array[t1])) <> 1 then raise exception 'Active tags not updated'; end if;
  perform public.save_product_tags(wid, pid, 'Молоко', '', 50, cid, array[t1,t2]);
end;
$$;

-- Complete only after active editing/filter tests; completed rows are now final.
reset role;
update public.products set status = 'completed' where workspace_id = current_setting('shopik.tags_workspace_a')::uuid;
update public.expenses set occurred_at = '2026-10-15 12:00:00+00' where workspace_id = current_setting('shopik.tags_workspace_a')::uuid;
set local role authenticated;
do $$
declare wid uuid := current_setting('shopik.tags_workspace_a')::uuid;
  cid uuid := current_setting('shopik.tags_category_a')::uuid;
  t1 uuid := current_setting('shopik.tag_one')::uuid;
  t2 uuid := current_setting('shopik.tag_two')::uuid;
  pid text := current_setting('shopik.tag_product_a'); result jsonb;
begin
  if jsonb_array_length(public.filtered_products(wid, cid, '{}')) <> 0 then raise exception 'Completed products visible in category'; end if;
  result := public.expense_month_tags(wid, '2026-10-01', array[t1]);
  if (result->>'total')::numeric <> 100 or jsonb_array_length(result->'items') <> 2
    or (result->'categories'->0->>'total')::numeric <> 100 then raise exception 'Filtered totals duplicated/lost purchases'; end if;
  if (public.expense_month_tags(wid, '2026-10-01', array[t1,t2])->>'total')::numeric <> 50 then raise exception 'AND expense filter failed'; end if;
  if (public.expense_month(wid, '2026-10-01')->>'total')::numeric <> 125 then raise exception 'Old unfiltered RPC regressed'; end if;
  if (public.expense_month_tags(wid, '2026-11-01', array[t1])->>'total')::numeric <> 0 then raise exception 'Filter escaped month'; end if;
  begin
    perform public.save_product_tags(wid, pid, 'Молоко', '', 99, cid, '{}');
    raise exception 'Completed edit accepted';
  exception when check_violation then null; end;
  if not exists(select 1 from public.expenses where product_id = pid and amount = 50) then raise exception 'Historical amount changed'; end if;
  delete from public.products where id = pid;
  if (select count(*) from public.tags) <> 2 or exists(select 1 from public.product_tags where product_id = pid)
    or not exists(select 1 from public.product_tags where product_id = current_setting('shopik.tag_product_b')) then raise exception 'Product deletion removed shared tags'; end if;
end;
$$;

-- B can neither read A's tags nor bind them to B's own product.
select set_config('request.jwt.claims', '{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec271d002","role":"authenticated"}', true);
select * from public.ensure_personal_workspace();
do $$
declare wid uuid; cid uuid; own_tag uuid; own_product text;
begin
  select workspace_id into strict wid from public.workspace_members;
  select id into strict cid from public.categories;
  if exists(select 1 from public.tags) or exists(select 1 from public.product_tags) then raise exception 'Tag RLS leak'; end if;
  begin
    perform public.save_product_tags(wid, null, 'Атака', '', 1, cid, array[current_setting('shopik.tag_one')::uuid]);
    raise exception 'Foreign tag assigned';
  exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.products) then raise exception 'Rejected creation left product behind'; end if;
  begin
    perform public.filtered_products(current_setting('shopik.tags_workspace_a')::uuid, current_setting('shopik.tags_category_a')::uuid, '{}');
    raise exception 'Foreign product RPC accessible';
  exception when insufficient_privilege then null; end;
  begin
    perform public.expense_month_tags(current_setting('shopik.tags_workspace_a')::uuid, '2026-10-01', '{}');
    raise exception 'Foreign summary accessible';
  exception when insufficient_privilege then null; end;
  insert into public.tags(workspace_id, name, color) values(wid, 'Свій тег', '#FFFFFF') returning id into own_tag;
  own_product := public.save_product_tags(wid, null, 'Свій продукт', '', 1, cid, '{}');
  begin
    insert into public.product_tags(workspace_id, product_id, tag_id) values(wid, own_product, current_setting('shopik.tag_one')::uuid);
    raise exception 'Composite FK allowed foreign tag';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.product_tags(workspace_id, product_id, tag_id) values(wid, current_setting('shopik.tag_product_b'), own_tag);
    raise exception 'Composite FK allowed foreign product';
  exception when foreign_key_violation then null; end;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform 1 from public.tags;
    raise exception 'Anonymous tags exposed';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.product_tags;
    raise exception 'Anonymous links exposed';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
select 'PASS: tags, atomic save, AND filters, expense totals and RLS' as result;
