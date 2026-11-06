-- =====================================================================
-- 0004 · File imports, undo, and learned categories
-- =====================================================================

-- One row per imported file: what came in, what was a duplicate.
create table public.import_batches (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  imported_by   uuid not null references public.members (id),
  file_name     text not null,
  rows_in_file  int  not null check (rows_in_file >= 0),
  inserted      int  not null default 0,
  duplicates    int  not null default 0,
  date_from     date,
  date_to       date,
  created_at    timestamptz not null default now()
);

alter table public.import_batches enable row level security;
create policy household_all on public.import_batches
  for all to authenticated
  using ((select public.is_household_member()))
  with check ((select public.is_household_member()));

-- "ביטול ייבוא" deletes the batch and, through the cascade, every row it added.
alter table public.transactions
  add column import_batch_id uuid references public.import_batches (id) on delete cascade,
  -- normalized merchant (computed in the app) — the key category rules match on
  add column merchant_key text;

update public.transactions set merchant_key = lower(trim(merchant)) where merchant_key is null;

create index transactions_merchant_key_idx on public.transactions (merchant_key);
create index transactions_import_batch_idx on public.transactions (import_batch_id);

-- ---------------------------------------------------------------------
-- import_transactions: one call, one DB transaction.
-- Rows whose (account_id, external_hash) already exist are skipped, so
-- importing the same file twice — or two overlapping months — adds nothing twice.
--
-- p_rows: [{ date, processed_date, amount, merchant, merchant_key, external_hash,
--            kind, category_id, tag, original_amount, original_currency,
--            installment_number, installment_total, description }, ...]
-- ---------------------------------------------------------------------
create function public.import_transactions(p_account_id uuid, p_file_name text, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner     uuid;
  v_member    uuid := public.current_member_id();
  v_batch     uuid;
  v_total     int  := jsonb_array_length(p_rows);
  v_inserted  int;
begin
  if v_member is null then
    raise exception 'Not a household member' using errcode = 'insufficient_privilege';
  end if;

  select a.member_id into v_owner from public.accounts a where a.id = p_account_id;
  if v_owner is null then
    raise exception 'Account % not found', p_account_id using errcode = 'no_data_found';
  end if;

  insert into public.import_batches (account_id, imported_by, file_name, rows_in_file, date_from, date_to)
  select p_account_id, v_member, p_file_name, v_total,
         min((r ->> 'date')::date), max((r ->> 'date')::date)
  from jsonb_array_elements(p_rows) r
  returning id into v_batch;

  with ins as (
    insert into public.transactions (
      account_id, paid_by, date, processed_date, amount, original_amount, original_currency,
      merchant, merchant_key, description, category_id, tag, kind, status, source,
      external_hash, installment_number, installment_total, import_batch_id
    )
    select
      p_account_id,
      v_owner,                                   -- the account owner paid
      (r ->> 'date')::date,
      nullif(r ->> 'processed_date', '')::date,
      (r ->> 'amount')::numeric(12, 2),
      nullif(r ->> 'original_amount', '')::numeric(12, 2),
      nullif(r ->> 'original_currency', ''),
      r ->> 'merchant',
      r ->> 'merchant_key',
      nullif(r ->> 'description', ''),
      nullif(r ->> 'category_id', '')::uuid,
      nullif(r ->> 'tag', ''),
      coalesce(r ->> 'kind', 'expense'),
      'completed',
      'file_import',
      r ->> 'external_hash',
      nullif(r ->> 'installment_number', '')::int,
      nullif(r ->> 'installment_total', '')::int,
      v_batch
    from jsonb_array_elements(p_rows) r
    on conflict (account_id, external_hash) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  update public.import_batches
     set inserted = v_inserted, duplicates = v_total - v_inserted
   where id = v_batch;

  return jsonb_build_object(
    'batch_id',   v_batch,
    'total',      v_total,
    'inserted',   v_inserted,
    'duplicates', v_total - v_inserted
  );
end;
$$;

-- ---------------------------------------------------------------------
-- learn_category: remember "this merchant → this category" and apply it to
-- every other uncategorized row of the same merchant. Returns how many changed.
-- ---------------------------------------------------------------------
create function public.learn_category(p_merchant_key text, p_category_id uuid, p_tag text)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated int;
begin
  if p_merchant_key is null or p_merchant_key = '' then
    return 0;
  end if;

  insert into public.category_rules (pattern, category_id, tag, created_by)
  values (p_merchant_key, p_category_id, p_tag, public.current_member_id())
  on conflict (pattern) do update
    set category_id = excluded.category_id, tag = excluded.tag;

  update public.transactions
     set category_id = p_category_id,
         tag = coalesce(tag, p_tag)
   where merchant_key = p_merchant_key
     and category_id is null;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.import_transactions(uuid, text, jsonb) from anon, public;
revoke execute on function public.learn_category(text, uuid, text)       from anon, public;
grant  execute on function public.import_transactions(uuid, text, jsonb) to authenticated;
grant  execute on function public.learn_category(text, uuid, text)       to authenticated;
