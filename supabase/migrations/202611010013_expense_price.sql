begin;

-- Private receipts make transport retries idempotent without letting clients
-- fabricate acknowledgements through the general operation receipt table.
create table shopik_private.expense_price_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  operation_id uuid not null,
  payload_hash text not null,
  primary key (user_id, workspace_id, operation_id)
);
alter table shopik_private.expense_price_receipts enable row level security;
revoke all on shopik_private.expense_price_receipts from public, anon, authenticated;

-- Only this narrow RPC can change the historical amount. Product price and all
-- descriptive snapshots remain unchanged; eviction shares the workspace lock.
create function public.correct_expense_price(p_workspace_id uuid, p_expense_id uuid,
  p_operation_id uuid, p_amount numeric, p_expected_amount numeric) returns numeric
language plpgsql security definer set search_path = '' as $$
declare expense public.expenses; previous_hash text; input_hash text;
begin
  perform public.workspace_write_access(p_workspace_id);
  if p_operation_id is null or p_expense_id is null or p_amount is null
    or p_amount < 0 or p_amount > 99999999.99 or p_amount <> round(p_amount, 2)
    or p_expected_amount is null then
    raise exception 'Invalid expense price' using errcode='22023';
  end if;
  select * into expense from public.expenses
    where workspace_id=p_workspace_id and id=p_expense_id for update;
  if not found or expense.created_by <> auth.uid() or expense.archived then
    raise exception 'Only author can correct a live expense' using errcode='42501';
  end if;
  input_hash := encode(sha256(convert_to(jsonb_build_array(p_expense_id, p_amount, p_expected_amount)::text, 'UTF8')), 'hex');
  select payload_hash into previous_hash from shopik_private.expense_price_receipts
    where user_id=auth.uid() and workspace_id=p_workspace_id and operation_id=p_operation_id;
  if found then
    if previous_hash <> input_hash then
      raise exception 'Operation key reused' using errcode='22023';
    end if;
    return expense.amount;
  end if;
  if expense.amount <> p_expected_amount then
    raise exception 'Expense price changed; reload' using errcode='40001';
  end if;
  update public.expenses set amount=p_amount where id=expense.id and workspace_id=p_workspace_id;
  insert into shopik_private.expense_price_receipts(user_id, workspace_id, operation_id, payload_hash)
    values(auth.uid(), p_workspace_id, p_operation_id, input_hash);
  return p_amount;
end;
$$;
revoke all on function public.correct_expense_price(uuid, uuid, uuid, numeric, numeric) from public, anon;
grant execute on function public.correct_expense_price(uuid, uuid, uuid, numeric, numeric) to authenticated;

commit;
