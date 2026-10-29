begin;

alter table public.products add constraint products_workspace_id_unique unique(workspace_id, id);
-- Products own the expense lifecycle: deleting a product removes its expense.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id text not null unique,
  name text not null,
  category_id uuid not null,
  category_name text not null,
  amount numeric not null check(amount >= 0 and amount <= 99999999.99 and amount = round(amount, 2)),
  currency text not null default 'UAH' check(currency = 'UAH'),
  occurred_at timestamptz not null,
  foreign key(workspace_id, product_id) references public.products(workspace_id, id) on delete cascade
);
create index expenses_workspace_date_idx on public.expenses(workspace_id, occurred_at);
alter table public.expenses enable row level security;
revoke all on public.expenses from public, anon, authenticated;
grant select on public.expenses to authenticated;
create policy expenses_read on public.expenses for select to authenticated using(public.is_workspace_member(workspace_id));

-- A trigger keeps status and expense atomic, including direct Data API writes.
create function public.sync_product_expense() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' then
    delete from public.expenses where product_id = new.id;
  elsif tg_op = 'INSERT' or old.status <> 'completed' then
    insert into public.expenses(workspace_id, product_id, name, category_id, category_name, amount, currency, occurred_at)
    select new.workspace_id, new.id, new.name, new.category_id, c.name, new.price, new.currency, clock_timestamp()
    from public.categories c where c.id = new.category_id and c.workspace_id = new.workspace_id
    on conflict(product_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_product_expense() from public, anon, authenticated;
create trigger product_expense_lifecycle after insert or update of status on public.products
  for each row execute function public.sync_product_expense();

-- Existing completed products are real data; use their last known update time.
insert into public.expenses(workspace_id, product_id, name, category_id, category_name, amount, currency, occurred_at)
select p.workspace_id, p.id, p.name, p.category_id, c.name, p.price, p.currency, p.updated_at
from public.products p join public.categories c on c.workspace_id = p.workspace_id and c.id = p.category_id
where p.status = 'completed';

-- Sum numerics in Postgres, with half-open Kyiv month boundaries and RLS.
create function public.expense_month(p_workspace_id uuid, p_month date) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Expected first day of month' using errcode = '22023';
  end if;
  with month_rows as (
    select * from public.expenses where workspace_id = p_workspace_id
      and occurred_at >= (p_month::timestamp at time zone 'Europe/Kyiv')
      and occurred_at < ((p_month::timestamp + interval '1 month') at time zone 'Europe/Kyiv')
  ), category_totals as (
    select category_id, category_name, sum(amount) as total, count(*) as count
      from month_rows group by category_id, category_name
  )
  select jsonb_build_object(
    'total', coalesce((select sum(amount) from month_rows), 0),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by category_name, category_id) from category_totals c), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(r) order by occurred_at desc, id) from month_rows r), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.expense_month(uuid, date) from public, anon;
grant execute on function public.expense_month(uuid, date) to authenticated;
notify pgrst, 'reload schema';
commit;
