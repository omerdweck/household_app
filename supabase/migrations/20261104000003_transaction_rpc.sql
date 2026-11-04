-- =====================================================================
-- 0003 · Atomic edits of a transaction and its splits
--
-- supabase-js sends one HTTP request per statement, so "delete the old
-- splits, insert the new ones" from the app would be two separate DB
-- transactions — and the deferred split-total check would fail between them.
-- These functions do the whole change inside ONE database transaction.
--
-- SECURITY INVOKER: they run as the calling user, so RLS still applies.
-- =====================================================================

-- Replace all splits of a transaction.
-- p_splits: [{"member_id": "<uuid>", "amount": 2600.00}, ...]; zero amounts are skipped.
create function public.set_transaction_splits(p_transaction_id uuid, p_splits jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_splits) <> 'array' then
    raise exception 'p_splits must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  delete from public.transaction_splits where transaction_id = p_transaction_id;

  insert into public.transaction_splits (transaction_id, member_id, amount)
  select p_transaction_id, (s ->> 'member_id')::uuid, (s ->> 'amount')::numeric(12, 2)
  from jsonb_array_elements(p_splits) as s
  where (s ->> 'amount')::numeric <> 0;
  -- The deferred constraint trigger checks the total when this call commits.
end;
$$;

-- Update a transaction's editable fields and (optionally) its splits together.
-- p_patch holds only the keys to change; a key with a JSON null clears that column.
-- p_splits = null keeps the splits as the triggers leave them.
create function public.update_transaction(p_id uuid, p_patch jsonb, p_splits jsonb default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.transactions t set
    date        = case when p_patch ? 'date'        then (p_patch ->> 'date')::date               else t.date        end,
    amount      = case when p_patch ? 'amount'      then (p_patch ->> 'amount')::numeric(12, 2)   else t.amount      end,
    merchant    = case when p_patch ? 'merchant'    then  p_patch ->> 'merchant'                  else t.merchant    end,
    category_id = case when p_patch ? 'category_id' then (p_patch ->> 'category_id')::uuid        else t.category_id end,
    tag         = case when p_patch ? 'tag'         then  p_patch ->> 'tag'                       else t.tag         end,
    kind        = case when p_patch ? 'kind'        then  p_patch ->> 'kind'                      else t.kind        end,
    paid_by     = case when p_patch ? 'paid_by'     then (p_patch ->> 'paid_by')::uuid            else t.paid_by     end,
    notes       = case when p_patch ? 'notes'       then  p_patch ->> 'notes'                     else t.notes       end
  where t.id = p_id;

  if not found then
    raise exception 'Transaction % not found', p_id using errcode = 'no_data_found';
  end if;

  if p_splits is not null then
    perform public.set_transaction_splits(p_id, p_splits);
  end if;
end;
$$;

revoke execute on function public.set_transaction_splits(uuid, jsonb)        from anon, public;
revoke execute on function public.update_transaction(uuid, jsonb, jsonb)     from anon, public;
grant  execute on function public.set_transaction_splits(uuid, jsonb)        to authenticated;
grant  execute on function public.update_transaction(uuid, jsonb, jsonb)     to authenticated;
