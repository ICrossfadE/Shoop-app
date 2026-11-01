-- All fixtures roll back; exercise RPC rights rather than privileged UPDATE alone.
begin;
insert into auth.users(id,email) values
('01700000-0000-4000-8000-000000000001','owner017@example.invalid'),
('01700000-0000-4000-8000-000000000002','author017@example.invalid'),
('01700000-0000-4000-8000-000000000003','outsider017@example.invalid');
create function pg_temp.price_blocked(statement text) returns boolean language plpgsql as $$
declare affected bigint;
begin execute statement; get diagnostics affected=row_count; return affected=0;
exception when insufficient_privilege or invalid_parameter_value or serialization_failure or check_violation then return true;
end; $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01700000-0000-4000-8000-000000000001"}',true);
select * from public.ensure_personal_workspace();
select set_config('test.price_workspace',(select workspace_id::text from public.workspace_members where user_id=auth.uid()),true);
select set_config('test.price_category',(select id::text from public.categories limit 1),true);
reset role;
insert into public.workspace_members(workspace_id,user_id,role) values(current_setting('test.price_workspace')::uuid,'01700000-0000-4000-8000-000000000002','member');
select set_config('test.price_joined',(select created_at::text from public.workspace_members where workspace_id=current_setting('test.price_workspace')::uuid and user_id='01700000-0000-4000-8000-000000000002'),true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01700000-0000-4000-8000-000000000002"}',true);
select set_config('test.price_product',public.save_product_tags(current_setting('test.price_workspace')::uuid,null,'Actual purchase','Original details',12.50,current_setting('test.price_category')::uuid,'{}'),true);
update public.products set status='completed' where id=current_setting('test.price_product');
select set_config('test.price_expense',(select id::text from public.expenses where product_id=current_setting('test.price_product')),true);
select set_config('test.price_snapshot',(select (to_jsonb(e)-'amount')::text from public.expenses e where id=current_setting('test.price_expense')::uuid),true);
select set_config('test.price_operation',gen_random_uuid()::text,true);
select public.correct_expense_price(current_setting('test.price_workspace')::uuid,current_setting('test.price_expense')::uuid,current_setting('test.price_operation')::uuid,19.99,12.50);
-- Replaying the same intent succeeds and never reapplies it over a newer correction.
select public.correct_expense_price(current_setting('test.price_workspace')::uuid,current_setting('test.price_expense')::uuid,current_setting('test.price_operation')::uuid,19.99,12.50);
do $$ declare w uuid:=current_setting('test.price_workspace')::uuid; e uuid:=current_setting('test.price_expense')::uuid; k uuid:=current_setting('test.price_operation')::uuid; result jsonb;
begin
  if (select amount from public.expenses where id=e)<>19.99 then raise exception 'Amount not corrected'; end if;
  if (select price from public.products where id=current_setting('test.price_product'))<>12.50 then raise exception 'Product changed'; end if;
  if (select (to_jsonb(x)-'amount')::text from public.expenses x where id=e)<>current_setting('test.price_snapshot') then raise exception 'Historical metadata changed'; end if;
  result:=public.expense_month_tags(w,date_trunc('month',now() at time zone 'Europe/Kyiv')::date,'{}');
  if (result->>'total')::numeric<>19.99 or jsonb_array_length(result->'items')<>1 then raise exception 'Totals or uniqueness broken'; end if;
  if not pg_temp.price_blocked(format('select public.correct_expense_price(%L,%L,%L,20,12.50)',w,e,k)) then raise exception 'Reused key accepted new input'; end if;
  if not pg_temp.price_blocked(format('select public.correct_expense_price(%L,%L,gen_random_uuid(),20,12.50)',w,e)) then raise exception 'Stale price overwrote newer data'; end if;
  if not pg_temp.price_blocked(format('select public.correct_expense_price(%L,%L,gen_random_uuid(),-1,19.99)',w,e)) then raise exception 'Negative accepted'; end if;
  if not pg_temp.price_blocked(format('select public.correct_expense_price(%L,%L,gen_random_uuid(),1.001,19.99)',w,e)) then raise exception 'Precision accepted'; end if;
  if not pg_temp.price_blocked(format('select public.correct_expense_price(%L,%L,gen_random_uuid(),100000000,19.99)',w,e)) then raise exception 'Overflow accepted'; end if;
  if not pg_temp.price_blocked(format('update public.expenses set amount=5 where id=%L',e)) then raise exception 'Direct update accepted'; end if;
  if not pg_temp.price_blocked('select * from shopik_private.expense_price_receipts') then raise exception 'Private receipts exposed'; end if;
  perform public.correct_expense_price(w,e,gen_random_uuid(),0,19.99);
  if public.correct_expense_price(w,e,k,19.99,12.50)<>0 then raise exception 'Old replay returned stale price'; end if;
end; $$;
select set_config('request.jwt.claims','{"sub":"01700000-0000-4000-8000-000000000001"}',true);
do $$ begin
  if not pg_temp.price_blocked(format('select public.correct_expense_price(%L,%L,gen_random_uuid(),77,0)',current_setting('test.price_workspace'),current_setting('test.price_expense'))) then raise exception 'Owner edited foreign expense'; end if;
end; $$;
select set_config('request.jwt.claims','{"sub":"01700000-0000-4000-8000-000000000003"}',true);
do $$ begin
  if not pg_temp.price_blocked(format('select public.correct_expense_price(%L,%L,gen_random_uuid(),77,0)',current_setting('test.price_workspace'),current_setting('test.price_expense'))) then raise exception 'Outsider edited expense'; end if;
end; $$;
select set_config('request.jwt.claims','{"sub":"01700000-0000-4000-8000-000000000001"}',true);
select public.remove_workspace_member(current_setting('test.price_workspace')::uuid,'01700000-0000-4000-8000-000000000002',current_setting('test.price_joined')::timestamptz);
select set_config('request.jwt.claims','{"sub":"01700000-0000-4000-8000-000000000002"}',true);
do $$ begin
  if not pg_temp.price_blocked(format('select public.correct_expense_price(%L,%L,%L,19.99,12.50)',current_setting('test.price_workspace'),current_setting('test.price_expense'),current_setting('test.price_operation'))) then raise exception 'Removed author replay accepted'; end if;
end; $$;
reset role;
insert into public.workspace_members(workspace_id,user_id,role) values(current_setting('test.price_workspace')::uuid,'01700000-0000-4000-8000-000000000002','member');
set local role authenticated;
do $$ begin
  if not pg_temp.price_blocked(format('select public.correct_expense_price(%L,%L,gen_random_uuid(),77,0)',current_setting('test.price_workspace'),current_setting('test.price_expense'))) then raise exception 'Rejoined author edited archive'; end if;
end; $$;
set local role anon;
do $$ begin
  if not pg_temp.price_blocked(format('select public.correct_expense_price(%L,%L,gen_random_uuid(),77,0)',current_setting('test.price_workspace'),current_setting('test.price_expense'))) then raise exception 'Anon edited expense'; end if;
end; $$;
rollback;
