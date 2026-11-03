begin;

-- Migration 015 can replace the correction RPC even when 013 was skipped.
-- Restore only its missing private dependency; preserve all existing receipts.
create table if not exists shopik_private.expense_price_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  operation_id uuid not null,
  payload_hash text not null,
  primary key (user_id, workspace_id, operation_id)
);
alter table shopik_private.expense_price_receipts enable row level security;
revoke all on shopik_private.expense_price_receipts from public, anon, authenticated;

-- CREATE OR REPLACE in 015 may have created a fresh RPC with default grants.
-- Keep the same authenticated-only contract as migration 013.
revoke all on function public.correct_expense_price(uuid, uuid, uuid, numeric, numeric) from public, anon;
grant execute on function public.correct_expense_price(uuid, uuid, uuid, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
commit;
