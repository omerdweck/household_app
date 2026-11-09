-- Tests for 0007: confirming and dismissing recurring charges.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ---------- 1. confirm a suggestion ----------
insert into public.recurring (merchant_pattern, label, expected_amount, day_of_month, period_months, kind, tag, category_id, created_by)
values ('חברת החשמל', 'חשמל', 380, 14, 2, 'bill', 'apartment',
        (select id from public.categories where name = 'חשמל'),
        (select id from public.members where email = 'omer@example.com'));
do $$
begin
  if (select period_months from public.recurring where merchant_pattern = 'חברת החשמל') <> 2 then
    raise exception 'FAIL rc1: bimonthly period not stored';
  end if;
  raise notice 'PASS rc1: bimonthly bill confirmed';
end $$;

-- ---------- 2. confirming the same merchant again updates instead of duplicating ----------
insert into public.recurring (merchant_pattern, label, expected_amount, day_of_month, period_months, kind)
values ('חברת החשמל', 'חשמל', 410, 14, 2, 'bill')
on conflict (merchant_pattern) do update set expected_amount = excluded.expected_amount;
do $$
begin
  if (select count(*) from public.recurring where merchant_pattern = 'חברת החשמל') <> 1
     or (select expected_amount from public.recurring where merchant_pattern = 'חברת החשמל') <> 410 then
    raise exception 'FAIL rc2: duplicate or not updated';
  end if;
  raise notice 'PASS rc2: one row per merchant, updated in place';
end $$;

-- ---------- 3. invalid period rejected ----------
do $$
begin
  insert into public.recurring (merchant_pattern, label, period_months, kind) values ('x', 'x', 5, 'bill');
  raise exception 'FAIL rc3: period 5 accepted';
exception when check_violation then
  raise notice 'PASS rc3: only 1, 2, 3 or 12 month periods';
end $$;
reset role;

-- ---------- 4. outsider sees nothing ----------
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$
begin
  if exists (select 1 from public.recurring) then
    raise exception 'FAIL rc4: outsider sees recurring charges';
  end if;
  raise notice 'PASS rc4: RLS hides recurring charges from outsiders';
end $$;
reset role;

\echo 'ALL RECURRING TESTS PASSED'
