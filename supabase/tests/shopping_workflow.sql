-- Real member/outsider identities; all changes roll back.
begin;
insert into auth.users(id,email) values
('01900000-0000-4000-8000-000000000001','owner019@example.invalid'),
('01900000-0000-4000-8000-000000000002','member019@example.invalid'),
('01900000-0000-4000-8000-000000000003','other019@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01900000-0000-4000-8000-000000000001"}',true);
select * from public.ensure_personal_workspace();
select set_config('test.w019',(select workspace_id::text from public.workspace_members limit 1),true);
select set_config('test.c019',(select id::text from public.categories limit 1),true);
reset role;
insert into public.workspace_members(workspace_id,user_id,role) values(current_setting('test.w019')::uuid,'01900000-0000-4000-8000-000000000002','member');
set local role authenticated;
insert into public.tags(workspace_id,name,color) values(current_setting('test.w019')::uuid,'A','#123456'),(current_setting('test.w019')::uuid,'B','#654321');

do $$ declare w uuid:=current_setting('test.w019')::uuid; c uuid:=current_setting('test.c019')::uuid;
  a uuid; b uuid; p text; q text; batch jsonb; response jsonb; k uuid:=gen_random_uuid(); e uuid; expected_time timestamptz;
begin
  select id into a from public.tags where name='A'; select id into b from public.tags where name='B';
  response:=public.apply_operation(w,gen_random_uuid(),'save_product',jsonb_build_object('name','Three units','description','','price',70,'quantity',3,'category_id',c,'tag_ids',jsonb_build_array(a,b)));
  p:=response->'product'->>'id';
  if (response->'product'->>'quantity')::integer<>3 then raise exception 'Quantity not saved'; end if;
  q:=public.save_product_tags(w,null,'One unit','',70,c,array[b]);
  if jsonb_array_length(public.filtered_products(w,null,array[a,b]))<>2 then raise exception 'OR double counted or omitted rows'; end if;
  -- A current member edits another member's active product, preserving author identity.
  perform set_config('request.jwt.claims','{"sub":"01900000-0000-4000-8000-000000000002"}',true);
  perform public.save_product_tags(w,p,'Shared edit','',70,c,array[a,b],3);
  if not exists(select 1 from public.products where id=p and quantity=3 and created_by='01900000-0000-4000-8000-000000000001') then raise exception 'Shared edit changed ownership'; end if;
  begin
    perform public.save_product_tags(w,p,'Overflow','',99999999.99,c,'{}',2);
    raise exception 'Total overflow accepted';
  exception when check_violation then null; end;
  -- A stale batch must not finish even its first valid row.
  select jsonb_agg(jsonb_build_object('id',id,'amount',price*quantity,'updated_at',updated_at) order by id) into batch from public.products where id in(p,q);
  update public.products set name='Changed' where id=q;
  begin
    perform public.complete_products(w,k,batch);
    raise exception 'Stale batch accepted';
  exception when serialization_failure then null; end;
  if exists(select 1 from public.expenses where product_id in(p,q)) then raise exception 'Partial batch committed'; end if;
  select jsonb_agg(jsonb_build_object('id',id,'amount',price*quantity,'updated_at',updated_at) order by id) into batch from public.products where id in(p,q);
  perform public.complete_products(w,k,batch); perform public.complete_products(w,k,batch);
  if (select count(*) from public.expenses where product_id in(p,q))<>2 then raise exception 'Completion duplicate'; end if;
  if not exists(select 1 from public.expenses where product_id=p and amount=210 and planned_amount=210) then raise exception 'Plan or total incorrect'; end if;
  select id,occurred_at into e,expected_time from public.expenses where product_id=p;
  perform public.correct_expense_price(w,e,gen_random_uuid(),180,210);
  perform public.correct_expense_price(w,e,gen_random_uuid(),230,180);
  if not exists(select 1 from public.expenses where id=e and planned_amount=210 and amount=230 and occurred_at=expected_time) then raise exception 'Plan/date changed with actual price'; end if;
  -- Snapshot tags and sums survive deleting the tag from the active catalog.
  perform public.delete_workspace_tag(w,b);
  if exists(select 1 from public.tags where id=b) then raise exception 'Deleted tag still visible'; end if;
  if not exists(select 1 from public.expenses where id=e and jsonb_array_length(tags)=2) then raise exception 'Historical tags lost'; end if;
  begin
    perform public.save_product_tags(w,null,'Deleted tag','',1,c,array[b]);
    raise exception 'Deleted tag assigned';
  exception when invalid_parameter_value then null; end;
  delete from public.products where id=p;
  if exists(select 1 from public.expenses where product_id=p) then raise exception 'Shared deletion left expense'; end if;
  perform set_config('request.jwt.claims','{"sub":"01900000-0000-4000-8000-000000000003"}',true);
  begin
    perform public.complete_products(w,gen_random_uuid(),batch);
    raise exception 'Outsider completed batch';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_workspace_tag(w,a);
    raise exception 'Outsider deleted tag';
  exception when insufficient_privilege then null; end;
end; $$;
rollback;
