-- Run WHOLE file after migration 009. Fixtures and settings roll back.
begin;
insert into auth.users(id,email) values
('b8bc6ee0-9ddb-456a-8f41-637ec271f001','shopik-theme-a@example.invalid'),
('b8bc6ee0-9ddb-456a-8f41-637ec271f002','shopik-theme-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec271f001","role":"authenticated"}',true);
do $$
declare affected integer;
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and theme = 'light') then raise exception 'Wrong initial theme'; end if;
  -- Every new value must pass the CHECK before testing account isolation.
  update public.profiles set theme = 'pink' where id = auth.uid();
  update public.profiles set theme = 'light-blue' where id = auth.uid();
  update public.profiles set theme = 'light-green' where id = auth.uid();
  update public.profiles set theme = 'light-pink' where id = auth.uid();
  update public.profiles set theme = 'dark' where id = auth.uid();
  if not exists(select 1 from public.profiles where id = auth.uid() and theme = 'dark') then raise exception 'Own theme not saved'; end if;
  update public.profiles set theme = 'dark' where id = 'b8bc6ee0-9ddb-456a-8f41-637ec271f002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign preference modified'; end if;
  if exists(select 1 from public.profiles where id <> auth.uid()) then raise exception 'Foreign profile exposed'; end if;
  begin
    update public.profiles set theme = 'system' where id = auth.uid();
    raise exception 'Unsupported theme accepted';
  exception when check_violation then null; end;
  begin
    update public.profiles set avatar_url = 'https://example.invalid/a.png' where id = auth.uid();
    raise exception 'Theme grant widened avatar write access';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
update auth.users set raw_user_meta_data = '{"full_name":"Оновлений профіль"}' where id = 'b8bc6ee0-9ddb-456a-8f41-637ec271f001';
set local role authenticated;
do $$
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and theme = 'dark') then raise exception 'Metadata sync reset theme'; end if;
end;
$$;
select set_config('request.jwt.claims','{"sub":"b8bc6ee0-9ddb-456a-8f41-637ec271f002","role":"authenticated"}',true);
do $$
declare affected integer;
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and theme = 'light') then raise exception 'Account B inherited A theme'; end if;
  update public.profiles set theme = 'light' where id = 'b8bc6ee0-9ddb-456a-8f41-637ec271f001';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Account B changed A theme'; end if;
end;
$$;
set local role anon;
do $$
begin
  begin
    update public.profiles set theme = 'dark';
    raise exception 'Anonymous preference write allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
select 'PASS: personal themes, validation, profile isolation and metadata sync' as result;
