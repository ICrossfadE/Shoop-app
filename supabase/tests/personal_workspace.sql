-- Recover legacy invited-only accounts without modifying their shared memberships or data.
begin;
insert into auth.users(id,email) values
('01600000-0000-4000-8000-000000000001','personal-owner@example.invalid'),
('01600000-0000-4000-8000-000000000002','invited-first@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01600000-0000-4000-8000-000000000001"}',true);
select set_config('test.shared',(select workspace_id::text from public.ensure_personal_workspace()),true);
reset role;
insert into public.workspace_members(workspace_id,user_id,role)
values(current_setting('test.shared')::uuid,'01600000-0000-4000-8000-000000000002','member');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01600000-0000-4000-8000-000000000002"}',true);
select set_config('test.personal',(select workspace_id::text from public.ensure_personal_workspace()),true);
do $$ declare again uuid; begin
  select workspace_id into again from public.ensure_personal_workspace();
  if again<>current_setting('test.personal')::uuid or again=current_setting('test.shared')::uuid then raise exception 'Personal selection confused shared membership'; end if;
  if (select count(*) from public.workspaces where owner_id=auth.uid() and is_personal)<>1 then raise exception 'Duplicate personal space'; end if;
  if (select role from public.workspace_members where workspace_id=current_setting('test.shared')::uuid and user_id=auth.uid())<>'member' then raise exception 'Shared role changed'; end if;
end; $$;
-- Simulate an incomplete legacy membership; recovery must affect only the owner's space.
reset role;
delete from public.workspace_members where workspace_id=current_setting('test.personal')::uuid and user_id='01600000-0000-4000-8000-000000000002';
set local role authenticated;
select * from public.ensure_personal_workspace();
do $$ begin
  if (select role from public.workspace_members where workspace_id=current_setting('test.personal')::uuid and user_id=auth.uid())<>'owner' then raise exception 'Missing membership not restored'; end if;
end; $$;
reset role;
update public.workspace_members set role='member' where workspace_id=current_setting('test.personal')::uuid and user_id='01600000-0000-4000-8000-000000000002';
set local role authenticated;
select * from public.ensure_personal_workspace();
do $$ begin
  if (select role from public.workspace_members where workspace_id=current_setting('test.personal')::uuid and user_id=auth.uid())<>'owner' then raise exception 'Personal owner role not repaired'; end if;
  begin
    insert into public.workspace_members(workspace_id,user_id,role) values(current_setting('test.shared')::uuid,auth.uid(),'owner');
    raise exception 'Direct membership mutation allowed';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.ensure_personal_workspace();raise exception 'Anonymous initialization allowed';
  exception when insufficient_privilege then null;end;
end; $$;
reset role;
select 'PASS: invited-first personal initialization, idempotency, membership repair and isolation';
rollback;
