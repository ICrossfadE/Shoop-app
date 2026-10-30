-- Run the whole file after 008. Fixtures and receipts are rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('b8bc6ee0-9ddb-456a-8f41-637ec2718001','shopik-008-a@example.invalid','{"full_name":"Author A"}'),
('b8bc6ee0-9ddb-456a-8f41-637ec2718002','shopik-008-b@example.invalid','{"full_name":"Author B"}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec2718001","role":"authenticated"}',true);
select * from public.ensure_personal_workspace();
select set_config('shopik.optimistic_workspace',(select workspace_id::text from public.workspace_members limit 1),true);

do $$
declare wid uuid := current_setting('shopik.optimistic_workspace')::uuid;
  cid uuid; tid uuid; pid text; payload jsonb; first_result jsonb; result jsonb; before_time timestamptz; link_tid tid;
begin
  select id into cid from public.categories where workspace_id=wid limit 1;
  result := public.apply_operation(wid,'00000000-0000-4000-8000-000000000001','create_tag','{"name":"Weekly","color":"#123456"}');
  tid := (result->'tag'->>'id')::uuid;
  if result <> public.apply_operation(wid,'00000000-0000-4000-8000-000000000001','create_tag','{"name":"Weekly","color":"#123456"}') then raise exception 'Tag retry changed result'; end if;
  payload := jsonb_build_object('id',null,'name','Milk','description','','price',50,'category_id',cid,'tag_ids',jsonb_build_array(tid));
  first_result := public.apply_operation(wid,'00000000-0000-4000-8000-000000000002','save_product',payload);
  pid := first_result->'product'->>'id';
  perform set_config('shopik.optimistic_product',pid,true);
  if pid !~ '^[0-9a-f]{64}$' or first_result->'author'->>'display_name'<>'Author A' then raise exception 'Missing canonical identity/author'; end if;
  result := public.apply_operation(wid,'00000000-0000-4000-8000-000000000002','save_product',payload);
  if result->'product'->>'id'<>pid or (select count(*) from public.products where workspace_id=wid)<>1 then raise exception 'Retry duplicated product'; end if;
  begin
    perform public.apply_operation(wid,'00000000-0000-4000-8000-000000000002','save_product',payload||'{"name":"Changed"}');
    raise exception 'Changed intent reused a receipt';
  exception when invalid_parameter_value then null; end;
  select updated_at into before_time from public.products where id=pid;
  select ctid into link_tid from public.product_tags where product_id=pid;
  payload := payload||jsonb_build_object('id',pid);
  perform public.apply_operation(wid,'00000000-0000-4000-8000-000000000003','save_product',payload);
  if (select updated_at from public.products where id=pid)<>before_time then raise exception 'No-op rewrote product'; end if;
  if (select ctid from public.product_tags where product_id=pid)<>link_tid then raise exception 'Unchanged tag link rewritten'; end if;
  perform public.apply_operation(wid,'00000000-0000-4000-8000-000000000004','save_product',payload||'{"price":60}');
  if (select ctid from public.product_tags where product_id=pid)<>link_tid then raise exception 'Price edit rewrote tag link'; end if;
  result := public.list_snapshot(wid,'products',cid,null,array[tid]);
  if jsonb_array_length(result->'products')<>1 or jsonb_array_length(result->'authors')<>1 then raise exception 'Incorrect filtered snapshot'; end if;
  perform public.apply_operation(wid,'00000000-0000-4000-8000-000000000005','complete_product',jsonb_build_object('id',pid));
  perform public.apply_operation(wid,'00000000-0000-4000-8000-000000000006','complete_product',jsonb_build_object('id',pid));
  if (select count(*) from public.expenses where product_id=pid)<>1 then raise exception 'Completion duplicated expense'; end if;
  result := public.list_snapshot(wid,'expenses',null,date_trunc('month',clock_timestamp() at time zone 'Europe/Kyiv')::date,array[tid]);
  if (result->'expenses'->>'total')::numeric<>60 or jsonb_array_length(result->'expenses'->'items')<>1 then raise exception 'Expense rows/totals disagree'; end if;
  -- Replay reflects current final state, never resurrecting an old active card.
  result := public.apply_operation(wid,'00000000-0000-4000-8000-000000000003','save_product',payload);
  if result->'product'->>'status'<>'completed' then raise exception 'Old receipt resurrected active product'; end if;
  begin
    perform public.apply_operation(wid,gen_random_uuid(),'delete_category',jsonb_build_object('id',cid));
    raise exception 'Nonempty category deleted';
  exception when foreign_key_violation or restrict_violation then null; end;
  perform public.apply_operation(wid,'00000000-0000-4000-8000-000000000007','delete_product',jsonb_build_object('id',pid));
  perform public.apply_operation(wid,'00000000-0000-4000-8000-000000000007','delete_product',jsonb_build_object('id',pid));
  if exists(select 1 from public.expenses where product_id=pid) then raise exception 'Expense deletion failed'; end if;
  result := public.apply_operation(wid,'00000000-0000-4000-8000-000000000003','save_product',payload);
  if result->>'deleted'<>pid then raise exception 'Receipt resurrected deleted product'; end if;
  result := public.apply_operation(wid,gen_random_uuid(),'save_category','{"id":null,"name":"New category"}');
  if result->'category'->>'created_by'<>auth.uid()::text then raise exception 'Category author incorrect'; end if;
end; $$;

select set_config('request.jwt.claims','{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec2718002","role":"authenticated"}',true);
do $$
declare wid uuid := current_setting('shopik.optimistic_workspace')::uuid;
begin
  begin
    perform public.list_snapshot(wid,'products',null,null,'{}');
    raise exception 'Foreign snapshot exposed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.apply_operation(wid,'00000000-0000-4000-8000-000000000007','delete_product',jsonb_build_object('id',current_setting('shopik.optimistic_product')));
    raise exception 'Foreign operation accepted';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from shopik_private.operation_receipts) then raise exception 'Foreign receipts exposed'; end if;
end; $$;

-- A retained receipt cannot bypass revoked membership.
reset role;
delete from public.workspace_members where workspace_id=current_setting('shopik.optimistic_workspace')::uuid;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec2718001","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.apply_operation(current_setting('shopik.optimistic_workspace')::uuid,'00000000-0000-4000-8000-000000000001','create_tag','{"name":"Weekly","color":"#123456"}');
    raise exception 'Revoked membership bypassed';
  exception when insufficient_privilege then null; end;
end; $$;
set local role anon;
do $$ begin
  begin
    perform public.list_snapshot(current_setting('shopik.optimistic_workspace')::uuid,'products',null,null,'{}');
    raise exception 'Anonymous snapshot exposed';
  exception when insufficient_privilege then null; end;
end; $$;
select 'PASS: canonical mutations, replay, no-op writes, tag diff, snapshots, expenses and RLS';
rollback;
