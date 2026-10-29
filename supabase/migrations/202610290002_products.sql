begin;

-- New products only: no fixtures or imports from the old JSON list.
create table public.products (
  id text primary key default encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex')
    check (id ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  price numeric not null check (price >= 0 and price <= 99999999.99 and price = round(price, 2)),
  currency text not null default 'UAH' check (currency = 'UAH'),
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_workspace_created_idx on public.products(workspace_id, created_at desc, id);

-- Keep audit timestamps on the database, including direct Data API updates.
create function public.touch_product_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.touch_product_updated_at() from public, anon, authenticated;
create trigger products_updated_at before update on public.products
  for each row execute function public.touch_product_updated_at();

alter table public.products enable row level security;
revoke all on public.products from public, anon, authenticated;
grant select, delete on public.products to authenticated;
grant insert(workspace_id, name, description, price) on public.products to authenticated;
grant update(name, description, price, status) on public.products to authenticated;

create policy products_read_member on public.products for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy products_create_member on public.products for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy products_update_member on public.products for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy products_delete_member on public.products for delete to authenticated
  using (public.is_workspace_member(workspace_id));

notify pgrst, 'reload schema';
commit;
