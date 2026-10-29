begin;
-- A preference belongs to the account, not to a shared Workspace.
alter table public.profiles add column theme text not null default 'light' check(theme in ('light','dark'));
grant update(theme) on public.profiles to authenticated;
-- Existing self-only SELECT/UPDATE RLS continues to protect this column.
notify pgrst, 'reload schema';
commit;
