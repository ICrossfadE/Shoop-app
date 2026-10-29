begin;

-- Categories belong to one Workspace; client writes cannot change their owner.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, id)
);
create unique index categories_unique_name on public.categories(workspace_id, lower(name));
alter table public.categories enable row level security;
revoke all on public.categories from public, anon, authenticated;
grant select, delete on public.categories to authenticated;
grant insert(workspace_id, name) on public.categories to authenticated;
grant update(name) on public.categories to authenticated;
create policy categories_read on public.categories for select to authenticated using(public.is_workspace_member(workspace_id));
create policy categories_insert on public.categories for insert to authenticated
  with check(public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy categories_update on public.categories for update to authenticated
  using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));
create policy categories_delete on public.categories for delete to authenticated using(public.is_workspace_member(workspace_id));
create trigger categories_updated_at before update on public.categories
  for each row execute function public.touch_product_updated_at();

-- Run on Workspace creation, not on login: deleted defaults stay deleted.
create function public.seed_workspace_category() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.categories(workspace_id, name, created_by)
  values(new.id, 'Обов''язкові покупки', new.owner_id);
  return new;
end;
$$;
revoke all on function public.seed_workspace_category() from public, anon, authenticated;
create trigger workspace_initial_category after insert on public.workspaces
  for each row execute function public.seed_workspace_category();

-- Existing Workspaces receive one category; real products are preserved.
insert into public.categories(workspace_id, name, created_by)
  select id, 'Обов''язкові покупки', owner_id from public.workspaces;
alter table public.products add column category_id uuid;
update public.products p set category_id = c.id from public.categories c where c.workspace_id = p.workspace_id;
alter table public.products alter column category_id set not null;
alter table public.products add constraint products_category_workspace_fk
  foreign key(workspace_id, category_id) references public.categories(workspace_id, id) on delete restrict;
create index products_category_idx on public.products(workspace_id, category_id);
grant insert(category_id), update(category_id) on public.products to authenticated;

notify pgrst, 'reload schema';
commit;
