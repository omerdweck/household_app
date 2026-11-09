-- =====================================================================
-- 0006 · Setting and copying monthly budgets
--
-- Rules enforced here, not only in the app:
--   * the shared pot and category caps can be set by either partner
--   * a personal budget can be set only by its owner
-- =====================================================================

-- Set (or clear, with amount = null) one budget line.
create function public.set_budget(p_month date, p_member_id uuid, p_category_id uuid, p_amount numeric)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me uuid := public.current_member_id();
begin
  if v_me is null then
    raise exception 'Not a household member' using errcode = 'insufficient_privilege';
  end if;
  if p_member_id is not null and p_member_id <> v_me then
    raise exception 'Only the owner can set a personal budget' using errcode = 'insufficient_privilege';
  end if;
  if p_member_id is not null and p_category_id is not null then
    raise exception 'Category caps are shared, not per person' using errcode = 'invalid_parameter_value';
  end if;
  if extract(day from p_month) <> 1 then
    raise exception 'p_month must be the first day of a month' using errcode = 'invalid_parameter_value';
  end if;

  if p_amount is null then
    delete from public.budgets
     where month = p_month
       and member_id is not distinct from p_member_id
       and category_id is not distinct from p_category_id;
    return;
  end if;

  if p_amount < 0 then
    raise exception 'Budget cannot be negative' using errcode = 'check_violation';
  end if;

  insert into public.budgets (month, member_id, category_id, amount)
  values (p_month, p_member_id, p_category_id, p_amount)
  on conflict (month, member_id, category_id) do update set amount = excluded.amount;
end;
$$;

-- Copy every line of one month into another, keeping anything already set there.
create function public.copy_budgets(p_from date, p_to date)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  if public.current_member_id() is null then
    raise exception 'Not a household member' using errcode = 'insufficient_privilege';
  end if;

  insert into public.budgets (month, member_id, category_id, amount)
  select p_to, b.member_id, b.category_id, b.amount
  from public.budgets b
  where b.month = p_from
  on conflict (month, member_id, category_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.set_budget(date, uuid, uuid, numeric) from anon, public;
revoke execute on function public.copy_budgets(date, date)              from anon, public;
grant  execute on function public.set_budget(date, uuid, uuid, numeric) to authenticated;
grant  execute on function public.copy_budgets(date, date)              to authenticated;
