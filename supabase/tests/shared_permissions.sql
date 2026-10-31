-- Four identities and two Workspaces. Always execute the whole file; fixtures roll back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('01100000-0000-4000-8000-000000000001','owner011@example.invalid','{"full_name":"Owner"}'),
('01100000-0000-4000-8000-000000000002','target011@example.invalid','{"full_name":"Removed author"}'),
('01100000-0000-4000-8000-000000000003','member011@example.invalid','{"full_name":"Other member"}'),
('01100000-0000-4000-8000-000000000004','outsider011@example.invalid','{}');
create function pg_temp.blocked(statement text) returns boolean language plpgsql as $$
declare affected bigint;
begin
  execute statement; get diagnostics affected=row_count;
  return affected=0;
exception when insufficient_privilege or check_violation or invalid_parameter_value then return true;
end; $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select * from public.ensure_personal_workspace();
select set_config('test.w1',(select workspace_id::text from public.workspace_members where user_id=auth.uid()),true);
select set_config('test.c1',(select id::text from public.categories limit 1),true);
select set_config('test.owner_product',public.save_product_tags(current_setting('test.w1')::uuid,null,'Owner purchase','',11,current_setting('test.c1')::uuid,'{}'),true);
reset role;
insert into public.workspace_members(workspace_id,user_id,role) values
(current_setting('test.w1')::uuid,'01100000-0000-4000-8000-000000000002','member'),
(current_setting('test.w1')::uuid,'01100000-0000-4000-8000-000000000003','member');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select * from public.ensure_personal_workspace();
select set_config('test.w2',(select workspace_id::text from public.workspace_members where user_id=auth.uid() and workspace_id<>current_setting('test.w1')::uuid),true);
insert into public.categories(workspace_id,name) values(current_setting('test.w1')::uuid,'Target shared'),(current_setting('test.w1')::uuid,'Target empty');
select set_config('test.target_category',(select id::text from public.categories where name='Target shared'),true);
insert into public.tags(workspace_id,name,color) values(current_setting('test.w1')::uuid,'Historical tag','#123456');
select set_config('test.tag',(select id::text from public.tags where name='Historical tag'),true);
select set_config('test.target_completed',public.save_product_tags(current_setting('test.w1')::uuid,null,'Historical purchase','',50,current_setting('test.target_category')::uuid,array[current_setting('test.tag')::uuid]),true);
select set_config('test.target_active',public.save_product_tags(current_setting('test.w1')::uuid,null,'Unbought purchase','',999,current_setting('test.target_category')::uuid,'{}'),true);
select set_config('test.target_personal',public.save_product_tags(current_setting('test.w2')::uuid,null,'Keep personal','',30,(select id from public.categories where workspace_id=current_setting('test.w2')::uuid limit 1),'{}'),true);
select set_config('test.operation',gen_random_uuid()::text,true);
select public.apply_operation(current_setting('test.w1')::uuid,current_setting('test.operation')::uuid,'complete_product',jsonb_build_object('id',current_setting('test.target_completed')));
-- Shared completion is permitted, but editing another author's fields/tags is not.
update public.products set status='completed' where id=current_setting('test.owner_product');
do $$ declare wid uuid:=current_setting('test.w1')::uuid; begin
  if not pg_temp.blocked(format('update public.products set price=999 where id=%L',current_setting('test.owner_product'))) then raise exception 'Foreign price edit accepted'; end if;
  if not pg_temp.blocked(format('delete from public.products where id=%L',current_setting('test.owner_product'))) then raise exception 'Foreign deletion accepted'; end if;
  if not pg_temp.blocked(format('update public.categories set name=''Attack'' where id=%L',current_setting('test.c1'))) then raise exception 'Foreign category renamed'; end if;
  if not pg_temp.blocked(format('insert into public.product_tags(workspace_id,product_id,tag_id) values(%L,%L,%L)',wid,current_setting('test.owner_product'),current_setting('test.tag'))) then raise exception 'Foreign tags accepted'; end if;
  if not pg_temp.blocked(format('select public.remove_workspace_member(%L,%L,now())',wid,'01100000-0000-4000-8000-000000000003')) then raise exception 'Member evicted member'; end if;
end; $$;
select set_config('request.jwt.claims','{"sub":"01100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('test.other_active',public.save_product_tags(current_setting('test.w1')::uuid,null,'Other active','',40,current_setting('test.target_category')::uuid,'{}'),true);
select set_config('test.other_completed',public.save_product_tags(current_setting('test.w1')::uuid,null,'Other completed','',20,current_setting('test.target_category')::uuid,array[current_setting('test.tag')::uuid]),true);
update public.products set status='completed' where id=current_setting('test.other_completed');
do $$ declare pid text; begin
  pid:=public.save_product_tags(current_setting('test.w1')::uuid,null,'Disposable','',10,current_setting('test.target_category')::uuid,'{}');
  update public.products set status='completed' where id=pid;
  delete from public.products where id=pid;
  if exists(select 1 from public.expenses where product_id=pid) then raise exception 'Ordinary expense leaked'; end if;
end; $$;
select set_config('request.jwt.claims','{"sub":"01100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('test.month',date_trunc('month',clock_timestamp() at time zone 'Europe/Kyiv')::date::text,true);
select set_config('test.before',public.expense_month(current_setting('test.w1')::uuid,current_setting('test.month')::date)::text,true);
select set_config('test.filtered_before',public.expense_month_tags(current_setting('test.w1')::uuid,current_setting('test.month')::date,array[current_setting('test.tag')::uuid])::text,true);
select set_config('test.joined',(select created_at::text from public.workspace_members where workspace_id=current_setting('test.w1')::uuid and user_id='01100000-0000-4000-8000-000000000002'),true);
do $$ declare wid uuid:=current_setting('test.w1')::uuid; begin
  if not pg_temp.blocked(format('select public.save_product_tags(%L,%L,''Other active'','''',40,%L,ARRAY[]::uuid[])',wid,current_setting('test.other_active'),current_setting('test.target_category'))) then raise exception 'Owner no-op RPC edit bypassed author'; end if;
  if not pg_temp.blocked(format('update public.products set status=''completed'',price=999 where id=%L',current_setting('test.other_active'))) then raise exception 'Completion smuggled price edit'; end if;
  if not pg_temp.blocked(format('delete from public.products where id=%L',current_setting('test.target_active'))) then raise exception 'Owner deleted foreign product'; end if;
  if not pg_temp.blocked(format('update public.expenses set archived=true where product_id=%L',current_setting('test.target_completed'))) then raise exception 'Caller controlled archive flag'; end if;
  if not pg_temp.blocked(format('select public.remove_workspace_member(%L,%L,now())',wid,auth.uid())) then raise exception 'Owner removed self'; end if;
end; $$;
-- A late cleanup failure must roll back archive flags, products and membership together.
reset role;
create function pg_temp.fail_eviction() returns trigger language plpgsql as $$ begin
  if current_setting('test.inject_failure',true)='yes' then raise exception 'Injected eviction failure'; end if;
  return old;
end; $$;
create trigger test_fail_eviction before delete on public.categories for each row execute function pg_temp.fail_eviction();
set local role authenticated;
select set_config('test.inject_failure','yes',true);
do $$ begin
  begin
    perform public.remove_workspace_member(current_setting('test.w1')::uuid,'01100000-0000-4000-8000-000000000002',current_setting('test.joined')::timestamptz);
    raise exception 'Expected injected failure';
  exception when raise_exception then
    if sqlerrm<>'Injected eviction failure' then raise; end if;
  end;
  if not exists(select 1 from public.products where id=current_setting('test.target_completed'))
    or exists(select 1 from public.expenses where archived)
    or not exists(select 1 from public.workspace_members where workspace_id=current_setting('test.w1')::uuid and user_id='01100000-0000-4000-8000-000000000002') then raise exception 'Partial eviction committed'; end if;
end; $$;
select set_config('test.inject_failure','no',true);
select public.remove_workspace_member(current_setting('test.w1')::uuid,'01100000-0000-4000-8000-000000000002',current_setting('test.joined')::timestamptz);
select public.remove_workspace_member(current_setting('test.w1')::uuid,'01100000-0000-4000-8000-000000000002',current_setting('test.joined')::timestamptz);
do $$ declare after_all jsonb; after_tags jsonb; before_all jsonb:=current_setting('test.before')::jsonb; snap jsonb; begin
  after_all:=public.expense_month(current_setting('test.w1')::uuid,current_setting('test.month')::date);
  after_tags:=public.expense_month_tags(current_setting('test.w1')::uuid,current_setting('test.month')::date,array[current_setting('test.tag')::uuid]);
  if after_all->'total'<>before_all->'total' or after_all->'categories'<>before_all->'categories'
    or after_tags->'total'<>(current_setting('test.filtered_before')::jsonb)->'total'
    or after_tags->'categories'<>(current_setting('test.filtered_before')::jsonb)->'categories' then raise exception 'Historical totals changed'; end if;
  if (select jsonb_agg(i-'archived') from jsonb_array_elements(after_all->'items') i) <> (select jsonb_agg(i-'archived') from jsonb_array_elements(before_all->'items') i) then raise exception 'Historical details or dates changed'; end if;
  if exists(select 1 from public.products where workspace_id=current_setting('test.w1')::uuid and created_by='01100000-0000-4000-8000-000000000002') then raise exception 'Removed products remain'; end if;
  if not exists(select 1 from public.categories where id=current_setting('test.target_category')::uuid and created_by=auth.uid()) then raise exception 'Occupied category not transferred'; end if;
  if exists(select 1 from public.categories where name='Target empty') then raise exception 'Empty category remains'; end if;
  if not exists(select 1 from public.products where id=current_setting('test.other_active') and category_id=current_setting('test.target_category')::uuid and created_by='01100000-0000-4000-8000-000000000003') then raise exception 'Other product moved/deleted'; end if;
  if not exists(select 1 from public.expenses where product_id=current_setting('test.target_completed') and archived and amount=50 and author->>'display_name'='Removed author' and jsonb_array_length(tags)=1) then raise exception 'Missing independent archive'; end if;
  if (select count(*) from public.tags where id=current_setting('test.tag')::uuid)<>1 then raise exception 'Shared tag deleted'; end if;
  snap:=public.list_snapshot(current_setting('test.w1')::uuid,'expenses',null,current_setting('test.month')::date,'{}');
  if not exists(select 1 from jsonb_array_elements(snap->'authors') a where a->>'display_name'='Removed author') then raise exception 'Archived author missing'; end if;
  if not pg_temp.blocked('delete from public.expenses where archived') then raise exception 'Owner deleted archived expense'; end if;
end; $$;
select set_config('request.jwt.claims','{"sub":"01100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.products where workspace_id=current_setting('test.w1')::uuid) or exists(select 1 from public.expenses where workspace_id=current_setting('test.w1')::uuid) then raise exception 'Revoked member reads workspace'; end if;
  if not exists(select 1 from public.products where id=current_setting('test.target_personal')) then raise exception 'Other workspace affected'; end if;
  if not pg_temp.blocked(format('select public.apply_operation(%L,%L,''complete_product'',jsonb_build_object(''id'',%L))',current_setting('test.w1'),current_setting('test.operation'),current_setting('test.target_completed'))) then raise exception 'Old receipt bypassed revocation'; end if;
  if not pg_temp.blocked(format('select public.workspace_people(%L)',current_setting('test.w1'))) then raise exception 'Revoked people access'; end if;
  if not pg_temp.blocked(format('select public.save_product_tags(%L,null,''Queued'','''',1,%L,ARRAY[]::uuid[])',current_setting('test.w1'),current_setting('test.target_category'))) then raise exception 'Stale queue recreated product'; end if;
end; $$;
-- Rejoining grants history access, never restores products. An old eviction cannot remove a new membership.
reset role;
insert into public.workspace_members(workspace_id,user_id,role,created_at) values(current_setting('test.w1')::uuid,'01100000-0000-4000-8000-000000000002','member',clock_timestamp()+interval '1 second');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  if not pg_temp.blocked(format('select public.remove_workspace_member(%L,%L,%L)',current_setting('test.w1'),'01100000-0000-4000-8000-000000000002',current_setting('test.joined'))) then raise exception 'Old retry removed new membership'; end if;
end; $$;
select set_config('request.jwt.claims','{"sub":"01100000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
  if not pg_temp.blocked(format('select public.expense_month(%L,%L)',current_setting('test.w1'),current_setting('test.month'))) then raise exception 'Outsider read archive'; end if;
  if not pg_temp.blocked(format('select public.remove_workspace_member(%L,%L,now())',current_setting('test.w1'),'01100000-0000-4000-8000-000000000002')) then raise exception 'Outsider evicted'; end if;
end; $$;
set local role anon;
do $$ begin
  if not pg_temp.blocked(format('select public.workspace_people(%L)',current_setting('test.w1'))) then raise exception 'Anonymous people access'; end if;
end; $$;
rollback;
select 'PASS: author rules, shared completion, atomic eviction, snapshots, RLS, retries and category transfer' as result;
