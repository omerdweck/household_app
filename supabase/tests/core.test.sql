-- Tests for 0001/0002: sign-up gate, RLS isolation, split integrity, idempotent imports.
-- Run with: ./scripts/test-db.sh
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

-- ---------- fixtures (as superuser, like the Supabase SQL editor) ----------
insert into public.members (email, display_name) values
  ('omer@example.com',    'עומר'),
  ('partner@example.com', 'בת הזוג');

-- ---------- 1. sign-up gate ----------
do $$
begin
  insert into auth.users (email) values ('stranger@example.com');
  raise exception 'FAIL 1a: stranger was allowed to sign up';
exception when insufficient_privilege then
  raise notice 'PASS 1a: stranger sign-up rejected';
end $$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'Omer@Example.com'),  -- mixed case on purpose
  ('22222222-2222-2222-2222-222222222222', 'partner@example.com');

do $$
begin
  if (select count(*) from public.members where user_id is not null) <> 2 then
    raise exception 'FAIL 1b: members not linked on sign-up';
  end if;
  raise notice 'PASS 1b: both members linked (e-mail match is case-insensitive)';
end $$;

insert into public.accounts (member_id, provider, type, label, last4)
select id, 'max', 'credit_card', 'מקס של עומר', '1234'
from public.members where email = 'omer@example.com';

-- ---------- 2. RLS: anonymous visitor sees nothing ----------
set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.members;
  if n <> 0 then raise exception 'FAIL 2: anon sees % members', n; end if;
  raise notice 'PASS 2: anon sees 0 members';
end $$;
reset role;

-- ---------- 3. RLS: signed-in but not a member sees nothing ----------
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$
declare n int;
begin
  select count(*) into n from public.accounts;
  if n <> 0 then raise exception 'FAIL 3a: outsider sees % accounts', n; end if;
  raise notice 'PASS 3a: outsider sees 0 accounts';
end $$;
do $$
begin
  insert into public.categories (name) values ('hack');
  raise exception 'FAIL 3b: outsider could insert';
exception when insufficient_privilege then
  raise notice 'PASS 3b: outsider insert blocked by RLS';
end $$;
reset role;

-- ---------- 4. member: default split = 100% on the payer ----------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.transactions (id, account_id, paid_by, date, amount, merchant, source, external_hash)
select 'aaaaaaaa-0000-0000-0000-000000000001', a.id, a.member_id, '2026-11-01', 5200, 'שכר דירה', 'manual', 'rent-nov'
from public.accounts a;

do $$
declare s record;
begin
  select count(*) as n, sum(amount) as total into s
    from public.transaction_splits where transaction_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if s.n <> 1 or s.total <> 5200 then
    raise exception 'FAIL 4: expected one split of 5200, got % rows totalling %', s.n, s.total;
  end if;
  raise notice 'PASS 4: member sees data; default split is 5200 on the payer';
end $$;

-- ---------- 5. "חלק שווה": replace splits with 2600 / 2600 ----------
begin;
  delete from public.transaction_splits where transaction_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into public.transaction_splits (transaction_id, member_id, amount)
  select 'aaaaaaaa-0000-0000-0000-000000000001', id, 2600 from public.members;
commit;
do $$
begin
  if (select count(*) from public.transaction_splits
       where transaction_id = 'aaaaaaaa-0000-0000-0000-000000000001' and amount = 2600) <> 2 then
    raise exception 'FAIL 5: equal split not saved';
  end if;
  raise notice 'PASS 5: equal split 2600 / 2600 committed';
end $$;

-- ---------- 6. a split that does not add up is rejected ----------
do $$
begin
  update public.transaction_splits set amount = 1000
   where transaction_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and member_id = (select id from public.members where email = 'partner@example.com');
  set constraints all immediate;   -- force the deferred check now so we can catch it
  raise exception 'FAIL 6: 2600 + 1000 <> 5200 was accepted';
exception when check_violation then
  raise notice 'PASS 6: split total 3600 vs 5200 rejected';
end $$;

-- ---------- 7. changing the amount moves a single split with it ----------
insert into public.transactions (id, account_id, paid_by, date, amount, merchant, source, external_hash)
select 'aaaaaaaa-0000-0000-0000-000000000002', a.id, a.member_id, '2026-11-02', 45.90, 'שופרסל', 'manual', 'super-1'
from public.accounts a;
update public.transactions set amount = 49.90 where id = 'aaaaaaaa-0000-0000-0000-000000000002';
do $$
begin
  if (select amount from public.transaction_splits
       where transaction_id = 'aaaaaaaa-0000-0000-0000-000000000002') <> 49.90 then
    raise exception 'FAIL 7: single split did not follow the new amount';
  end if;
  raise notice 'PASS 7: single split followed amount change 45.90 -> 49.90';
end $$;

-- ---------- 8. same bank row imported twice is rejected (idempotency) ----------
do $$
begin
  insert into public.transactions (account_id, paid_by, date, amount, merchant, source, external_hash)
  select a.id, a.member_id, '2026-11-02', 45.90, 'שופרסל', 'bank_sync', 'super-1'
  from public.accounts a;
  raise exception 'FAIL 8: duplicate external_hash accepted';
exception when unique_violation then
  raise notice 'PASS 8: duplicate import blocked by unique (account_id, external_hash)';
end $$;

-- ---------- 9. monthly card bill on the bank statement gets no split ----------
insert into public.transactions (id, account_id, paid_by, date, amount, merchant, kind, source, external_hash)
select 'aaaaaaaa-0000-0000-0000-000000000003', null, a.member_id, '2026-11-10', 3400, 'מקס איט פיננסים', 'card_bill', 'bank_sync', 'bill-nov'
from public.accounts a;
do $$
begin
  if exists (select 1 from public.transaction_splits
              where transaction_id = 'aaaaaaaa-0000-0000-0000-000000000003') then
    raise exception 'FAIL 9: card_bill got a split (would be double counted)';
  end if;
  raise notice 'PASS 9: card_bill not split, so never counted as an expense';
end $$;

-- ---------- 10. re-marking it as an expense creates the default split ----------
update public.transactions set kind = 'expense' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
do $$
begin
  if (select sum(amount) from public.transaction_splits
       where transaction_id = 'aaaaaaaa-0000-0000-0000-000000000003') <> 3400 then
    raise exception 'FAIL 10: no default split after kind change';
  end if;
  raise notice 'PASS 10: kind change to expense added the default split';
end $$;

-- ---------- 11. categories seeded ----------
do $$
declare n int;
begin
  select count(*) into n from public.categories where name in ('שכר דירה', 'חשמל', 'סופר');
  if n <> 3 then raise exception 'FAIL 11: starter categories missing'; end if;
  raise notice 'PASS 11: starter categories present (% total)', (select count(*) from public.categories);
end $$;
reset role;

\echo 'ALL TESTS PASSED'
