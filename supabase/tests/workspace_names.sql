-- Exercise actual column grants and RLS with owner, invited member and anonymous callers.
begin;
insert into auth.users(id,email) values
('01800000-0000-4000-8000-000000000001','rename-owner@example.invalid'),
('01800000-0000-4000-8000-000000000002','rename-member@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01800000-0000-4000-8000-000000000001"}',true);
select set_config('test.rename_space',(select workspace_id::text from public.ensure_personal_workspace()),true);
update public.workspaces set name='Наша оселя' where id=current_setting('test.rename_space')::uuid;
do $$ begin
  if (select workspace_name from public.ensure_personal_workspace()) <> 'Наша оселя' then raise exception 'Name not persisted'; end if;
  begin
    update public.workspaces set owner_id=auth.uid() where id=current_setting('test.rename_space')::uuid;
    raise exception 'Non-name column writable';
  exception when insufficient_privilege then null; end;
  begin
    update public.workspaces set name='   ' where id=current_setting('test.rename_space')::uuid;
    raise exception 'Blank name accepted';
  exception when check_violation then null; end;
  begin
    update public.workspaces set name=repeat('a',101) where id=current_setting('test.rename_space')::uuid;
    raise exception 'Long name accepted';
  exception when check_violation then null; end;
end; $$;
reset role;
insert into public.workspace_members(workspace_id,user_id,role)
values(current_setting('test.rename_space')::uuid,'01800000-0000-4000-8000-000000000002','member');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01800000-0000-4000-8000-000000000002"}',true);
do $$ declare affected integer; begin
  update public.workspaces set name='Attack' where id=current_setting('test.rename_space')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Member renamed owner space'; end if;
  if (select name from public.workspaces where id=current_setting('test.rename_space')::uuid) <> 'Наша оселя' then raise exception 'Member sees wrong name'; end if;
end; $$;
reset role;
set local role anon;
do $$ begin
  begin
    update public.workspaces set name='Anonymous' where id=current_setting('test.rename_space')::uuid;
    raise exception 'Anonymous rename allowed';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
