-- Whole-file, rollback-only test of invitation RPCs and direct API privileges.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('01500000-0000-4000-8000-000000000001','invite-owner@example.invalid','{"full_name":"Invite owner"}'),
('01500000-0000-4000-8000-000000000002','invite-joiner@example.invalid','{"full_name":"Joiner"}'),
('01500000-0000-4000-8000-000000000003','invite-other@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select * from public.ensure_personal_workspace();
select set_config('invite.wid',(select workspace_id::text from public.workspace_members where user_id=auth.uid()),true);
select set_config('invite.op',gen_random_uuid()::text,true);
do $$ declare result jsonb; begin
  result:=public.create_workspace_invite(current_setting('invite.wid')::uuid,current_setting('invite.op')::uuid,encode(sha256(convert_to(repeat('A',43),'UTF8')),'hex'));
  if result->>'status'<>'created' or result::text like '%token_hash%' or result::text like '%AAAAAAAA%' then raise exception 'Creation leaked secret or failed'; end if;
  perform set_config('invite.id',result->'invite'->>'id',true);
  result:=public.create_workspace_invite(current_setting('invite.wid')::uuid,current_setting('invite.op')::uuid,encode(sha256(convert_to(repeat('B',43),'UTF8')),'hex'));
  if result->>'status'<>'existing' or result->'invite'->>'id'<>current_setting('invite.id') then raise exception 'Creation retry duplicated invite'; end if;
  if public.preview_workspace_invite(repeat('A',43))->>'status'<>'member' then raise exception 'Owner preview failed'; end if;
  if public.accept_workspace_invite(repeat('A',43))->>'status'<>'member' then raise exception 'Owner downgraded or consumed link'; end if;
  result:=public.list_workspace_invites(current_setting('invite.wid')::uuid);
  if result->>'status'<>'ok' or jsonb_array_length(result->'invites')<>1 or result::text like '%token_hash%' then raise exception 'Owner metadata invalid'; end if;
  result:=public.create_workspace_invite(current_setting('invite.wid')::uuid,gen_random_uuid(),encode(sha256(convert_to(repeat('C',43),'UTF8')),'hex'));
  perform set_config('invite.revoke',result->'invite'->>'id',true);
  result:=public.create_workspace_invite(current_setting('invite.wid')::uuid,gen_random_uuid(),encode(sha256(convert_to(repeat('D',43),'UTF8')),'hex'));
  perform set_config('invite.expire',result->'invite'->>'id',true);
  -- Unclaimed before eviction: cannot be reused by the removed account later.
  perform public.create_workspace_invite(current_setting('invite.wid')::uuid,gen_random_uuid(),encode(sha256(convert_to(repeat('E',43),'UTF8')),'hex'));
end; $$;
select public.revoke_workspace_invite(current_setting('invite.revoke')::uuid);
select public.revoke_workspace_invite(current_setting('invite.revoke')::uuid);
reset role;
update public.workspace_invites set created_at=clock_timestamp()-interval '8 days',expires_at=clock_timestamp()-interval '1 day' where id=current_setting('invite.expire')::uuid;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select * from public.ensure_personal_workspace();
select set_config('invite.personal',(select workspace_id::text from public.workspace_members where user_id=auth.uid()),true);
do $$ declare result jsonb; joined timestamptz; begin
  if exists(select 1 from public.workspaces where id=current_setting('invite.wid')::uuid) then raise exception 'Preview gave membership'; end if;
  result:=public.preview_workspace_invite(repeat('A',43));
  if result->>'status'<>'ready' or result->>'owner_name'<>'Invite owner' or result ? 'email' then raise exception 'Preview metadata wrong'; end if;
  if exists(select 1 from public.workspace_members where workspace_id=current_setting('invite.wid')::uuid) then raise exception 'Preview consumed link'; end if;
  if public.preview_workspace_invite(repeat('Z',43)) <> '{"status":"invalid"}'::jsonb then raise exception 'Unknown token leaked workspace'; end if;
  if public.preview_workspace_invite(encode(sha256(convert_to(repeat('A',43),'UTF8')),'hex'))->>'status'<>'invalid' then raise exception 'Hash usable as bearer'; end if;
  if public.accept_workspace_invite(repeat('C',43))->>'status'<>'revoked' then raise exception 'Revoked link accepted'; end if;
  if public.accept_workspace_invite(repeat('D',43))->>'status'<>'expired' then raise exception 'Expired link accepted'; end if;
  result:=public.accept_workspace_invite(repeat('A',43));
  if result->>'status'<>'accepted' then raise exception 'Join failed'; end if;
  select created_at into joined from public.workspace_members where workspace_id=current_setting('invite.wid')::uuid and user_id=auth.uid() and role='member';
  if joined is null then raise exception 'Missing member role'; end if;
  perform set_config('invite.joined',joined::text,true);
  if public.accept_workspace_invite(repeat('A',43))->>'status'<>'accepted' then raise exception 'Lost-response repeat not idempotent'; end if;
  if (select created_at from public.workspace_members where workspace_id=current_setting('invite.wid')::uuid and user_id=auth.uid())<>joined then raise exception 'Repeat changed membership epoch'; end if;
  if public.accept_workspace_invite(repeat('E',43))->>'status'<>'member' then raise exception 'Existing member consumed second link'; end if;
  begin perform public.list_workspace_invites(current_setting('invite.wid')::uuid);raise exception 'Member listed invites';exception when insufficient_privilege then null;end;
  begin perform public.create_workspace_invite(current_setting('invite.wid')::uuid,gen_random_uuid(),repeat('a',64));raise exception 'Member created invite';exception when insufficient_privilege then null;end;
  begin perform public.revoke_workspace_invite(current_setting('invite.id')::uuid);raise exception 'Member revoked invite';exception when insufficient_privilege then null;end;
  begin perform 1 from public.workspace_invites;raise exception 'Direct invite SELECT allowed';exception when insufficient_privilege then null;end;
  begin update public.workspace_invites set revoked_at=null;raise exception 'Direct invite write allowed';exception when insufficient_privilege then null;end;
  begin insert into public.workspace_members(workspace_id,user_id,role) values(current_setting('invite.wid')::uuid,auth.uid(),'owner');raise exception 'Direct member insert allowed';exception when insufficient_privilege then null;end;
end; $$;
select set_config('request.jwt.claims','{"sub":"01500000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare i integer; result jsonb; begin
  if public.accept_workspace_invite(repeat('A',43))<>'{"status":"used"}'::jsonb then raise exception 'Second account reused consumed link'; end if;
  for i in 1..60 loop result:=public.preview_workspace_invite(repeat('Z',43));end loop;
  if public.preview_workspace_invite(repeat('Z',43))->>'status'<>'limited' then raise exception 'Guesses bypassed durable budget'; end if;
end; $$;
select set_config('request.jwt.claims','{"sub":"01500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.revoke_workspace_invite(current_setting('invite.id')::uuid);
do $$ begin
  if not exists(select 1 from public.workspace_members where workspace_id=current_setting('invite.wid')::uuid and user_id='01500000-0000-4000-8000-000000000002') then raise exception 'Revocation removed accepted membership';end if;
end; $$;
select public.remove_workspace_member(current_setting('invite.wid')::uuid,'01500000-0000-4000-8000-000000000002',current_setting('invite.joined')::timestamptz);
select set_config('request.jwt.claims','{"sub":"01500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  if public.accept_workspace_invite(repeat('A',43))->>'status'<>'used' then raise exception 'Consumed link restored revoked member';end if;
  if public.accept_workspace_invite(repeat('E',43))->>'status'<>'invalid' then raise exception 'Older unclaimed link bypassed eviction';end if;
  if not exists(select 1 from public.workspace_members where workspace_id=current_setting('invite.personal')::uuid and user_id=auth.uid() and role='owner') then raise exception 'Personal space changed';end if;
end; $$;
select set_config('request.jwt.claims','{"sub":"01500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_workspace_invite(current_setting('invite.wid')::uuid,gen_random_uuid(),encode(sha256(convert_to(repeat('F',43),'UTF8')),'hex'));
select set_config('request.jwt.claims','{"sub":"01500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  if public.accept_workspace_invite(repeat('F',43))->>'status'<>'accepted' then raise exception 'Fresh invitation did not permit rejoining';end if;
  if (select created_at from public.workspace_members where workspace_id=current_setting('invite.wid')::uuid and user_id=auth.uid())<=current_setting('invite.joined')::timestamptz then raise exception 'Join epoch not renewed';end if;
  if public.accept_workspace_invite(repeat('A',43))->>'status'<>'used' then raise exception 'Old accepted receipt became valid after rejoin';end if;
end; $$;
-- An old pending link must remain manageable even behind more than 100 accepted rows.
reset role;
insert into public.workspace_invites(workspace_id,created_by,operation_id,token_hash,accepted_at,accepted_by,accepted_membership_created_at)
select current_setting('invite.wid')::uuid,'01500000-0000-4000-8000-000000000001',gen_random_uuid(),encode(sha256(convert_to('history-'||n,'UTF8')),'hex'),clock_timestamp(),'01500000-0000-4000-8000-000000000002',clock_timestamp() from generate_series(1,105) n;
insert into public.workspace_invites(workspace_id,created_by,operation_id,token_hash)
select current_setting('invite.wid')::uuid,'01500000-0000-4000-8000-000000000001',gen_random_uuid(),encode(sha256(convert_to('capacity-'||n,'UTF8')),'hex') from generate_series(1,9) n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare result jsonb; i integer; begin
  result:=public.list_workspace_invites(current_setting('invite.wid')::uuid);
  if jsonb_array_length(result->'invites')<>100 or (select count(*) from jsonb_array_elements(result->'invites') x where x->>'state'='pending')<>10 then raise exception 'Pending links disappeared behind history';end if;
  result:=public.create_workspace_invite(current_setting('invite.wid')::uuid,gen_random_uuid(),repeat('7',64));
  if result->>'status'<>'capacity' then raise exception 'Pending capacity limit bypassed';end if;
  for i in 1..30 loop result:=public.create_workspace_invite(current_setting('invite.wid')::uuid,gen_random_uuid(),repeat('7',64));end loop;
  if result->>'status'<>'limited' then raise exception 'Creation budget bypassed';end if;
end; $$;
set local role anon;
do $$ begin
  begin perform public.preview_workspace_invite(repeat('A',43));raise exception 'Anon preview exposed details';exception when insufficient_privilege then null;end;
  begin perform public.accept_workspace_invite(repeat('A',43));raise exception 'Anon acceptance allowed';exception when insufficient_privilege then null;end;
end; $$;
rollback;
select 'PASS: invite ownership, hash-only secrets, preview, one-use, expiry, revocation, budgets and rejoin safety' as result;
