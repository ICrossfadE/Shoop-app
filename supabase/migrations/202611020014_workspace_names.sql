begin;

-- Owners may rename their spaces; other workspace columns remain read-only.
grant update(name) on public.workspaces to authenticated;
create policy workspaces_rename_owner on public.workspaces
  for update to authenticated
  using (owner_id = (select auth.uid()) and public.is_workspace_member(id))
  with check (owner_id = (select auth.uid()) and public.is_workspace_member(id));

-- Match the form validation even for callers bypassing the application.
alter table public.workspaces add constraint workspace_name_valid
  check (char_length(btrim(name)) between 1 and 100 and name !~ '[[:cntrl:]]') not valid;

commit;
