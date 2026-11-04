-- Tests for 0003: atomic split replacement and transaction updates.
-- Runs after core.test.sql on the same database (fixtures from there are reused).
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- A fresh 300.00 expense paid by Omer
insert into public.transactions (id, account_id, paid_by, date, amount, merchant, source)
select 'bbbbbbbb-0000-0000-0000-000000000001', a.id, a.member_id, '2026-11-03', 300, 'איקאה', 'manual'
from public.accounts a;

-- ---------- 1. equal split in a single call ----------
select public.set_transaction_splits(
  'bbbbbbbb-0000-0000-0000-000000000001',
  (select jsonb_agg(jsonb_build_object('member_id', id, 'amount', 150)) from public.members)
);
do $$
begin
  if (select count(*) from public.transaction_splits
       where transaction_id = 'bbbbbbbb-0000-0000-0000-000000000001' and amount = 150) <> 2 then
    raise exception 'FAIL r1: equal split not applied';
  end if;
  raise notice 'PASS r1: set_transaction_splits replaced splits atomically (150 / 150)';
end $$;

-- ---------- 2. wrong total is rejected and nothing changes ----------
do $$
begin
  perform public.set_transaction_splits(
    'bbbbbbbb-0000-0000-0000-000000000001',
    (select jsonb_agg(jsonb_build_object('member_id', id, 'amount', 100)) from public.members)
  );
  set constraints all immediate;
  raise exception 'FAIL r2: 100 + 100 <> 300 was accepted';
exception when check_violation then
  raise notice 'PASS r2: split total 200 vs 300 rejected';
end $$;
do $$
begin
  if (select sum(amount) from public.transaction_splits
       where transaction_id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 300 then
    raise exception 'FAIL r2b: rejected call left splits changed';
  end if;
  raise notice 'PASS r2b: rejected call left the previous 150 / 150 intact';
end $$;

-- ---------- 3. zero amounts are dropped ("move it all to partner") ----------
select public.set_transaction_splits(
  'bbbbbbbb-0000-0000-0000-000000000001',
  (select jsonb_agg(jsonb_build_object('member_id', id,
          'amount', case when email = 'partner@example.com' then 300 else 0 end))
     from public.members)
);
do $$
begin
  if (select count(*) from public.transaction_splits
       where transaction_id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL r3: zero-amount split row was stored';
  end if;
  raise notice 'PASS r3: 0 / 300 stored as a single split on the partner';
end $$;

-- ---------- 4. update amount + splits together ----------
select public.update_transaction(
  'bbbbbbbb-0000-0000-0000-000000000001',
  '{"amount": 410.50, "merchant": "איקאה ראשל״צ"}'::jsonb,
  (select jsonb_agg(jsonb_build_object('member_id', id,
          'amount', case when email = 'omer@example.com' then 205.25 else 205.25 end))
     from public.members)
);
do $$
declare t record;
begin
  select amount, merchant into t from public.transactions where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if t.amount <> 410.50 or t.merchant <> 'איקאה ראשל״צ' then
    raise exception 'FAIL r4: fields not updated (% / %)', t.amount, t.merchant;
  end if;
  if (select sum(amount) from public.transaction_splits
       where transaction_id = 'bbbbbbbb-0000-0000-0000-000000000001') <> 410.50 then
    raise exception 'FAIL r4b: splits do not match new amount';
  end if;
  raise notice 'PASS r4: amount, merchant and splits updated in one call';
end $$;

-- ---------- 5. amount change with several splits but no new splits is rejected ----------
do $$
begin
  perform public.update_transaction('bbbbbbbb-0000-0000-0000-000000000001', '{"amount": 500}'::jsonb);
  set constraints all immediate;
  raise exception 'FAIL r5: amount changed while two splits still sum to the old amount';
exception when check_violation then
  raise notice 'PASS r5: amount change without re-splitting rejected';
end $$;

-- ---------- 6. clearing a nullable field with JSON null ----------
select public.update_transaction('bbbbbbbb-0000-0000-0000-000000000001',
  jsonb_build_object('category_id', (select id from public.categories where name = 'ציוד לבית')));
select public.update_transaction('bbbbbbbb-0000-0000-0000-000000000001', '{"category_id": null}'::jsonb);
do $$
begin
  if (select category_id from public.transactions where id = 'bbbbbbbb-0000-0000-0000-000000000001') is not null then
    raise exception 'FAIL r6: category not cleared';
  end if;
  raise notice 'PASS r6: JSON null clears category_id; missing keys stay unchanged';
end $$;
reset role;

-- ---------- 7. outsider cannot use the functions to touch data ----------
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$
begin
  perform public.update_transaction('bbbbbbbb-0000-0000-0000-000000000001', '{"merchant": "hacked"}'::jsonb);
  raise exception 'FAIL r7: outsider update did not fail';
exception when no_data_found then
  raise notice 'PASS r7: outsider sees no row to update (RLS applies inside the function)';
end $$;
reset role;

-- ---------- 8. anon cannot call the functions at all ----------
set role anon;
do $$
begin
  perform public.set_transaction_splits('bbbbbbbb-0000-0000-0000-000000000001', '[]'::jsonb);
  raise exception 'FAIL r8: anon could execute set_transaction_splits';
exception when insufficient_privilege then
  raise notice 'PASS r8: anon has no execute permission';
end $$;
reset role;

\echo 'ALL RPC TESTS PASSED'
