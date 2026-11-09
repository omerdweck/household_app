-- Tests for 0006: setting, clearing and copying budgets; ownership rules.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

create temp table ids as
select (select id from public.members where email = 'omer@example.com')    as me,
       (select id from public.members where email = 'partner@example.com') as her,
       (select id from public.categories where name = 'אוכל בחוץ')         as food;
grant select on ids to authenticated;

-- ---------- 1. set shared, my personal, and a category cap ----------
select public.set_budget('2026-11-01', null, null, 6000);
select public.set_budget('2026-11-01', (select me from ids), null, 1500);
select public.set_budget('2026-11-01', null, (select food from ids), 800);
do $$
begin
  if (select count(*) from public.budgets where month = '2026-11-01') <> 3 then
    raise exception 'FAIL b1: expected 3 budget lines';
  end if;
  raise notice 'PASS b1: shared, personal and category budgets saved';
end $$;

-- ---------- 2. setting again updates in place (NULL columns still match) ----------
select public.set_budget('2026-11-01', null, null, 6500);
do $$
begin
  if (select count(*) from public.budgets where month = '2026-11-01' and member_id is null and category_id is null) <> 1
     or (select amount from public.budgets where month = '2026-11-01' and member_id is null and category_id is null) <> 6500 then
    raise exception 'FAIL b2: shared budget duplicated or not updated';
  end if;
  raise notice 'PASS b2: shared budget updated in place, no duplicate row';
end $$;

-- ---------- 3. cannot set the partner's personal budget ----------
do $$
begin
  perform public.set_budget('2026-11-01', (select her from ids), null, 99999);
  raise exception 'FAIL b3: set the partner''s budget';
exception when insufficient_privilege then
  raise notice 'PASS b3: only the owner can set a personal budget';
end $$;

-- ---------- 4. amount = null clears the line ----------
select public.set_budget('2026-11-01', null, (select food from ids), null);
do $$
begin
  if exists (select 1 from public.budgets where category_id = (select food from ids)) then
    raise exception 'FAIL b4: category cap not cleared';
  end if;
  raise notice 'PASS b4: null amount clears the line';
end $$;

-- ---------- 5. copy to next month keeps what is already there ----------
select public.set_budget('2026-12-01', null, null, 7000);
create temp table c as select public.copy_budgets('2026-11-01', '2026-12-01') as n;
do $$
begin
  if (select n from c) <> 1 then
    raise exception 'FAIL b5: expected 1 copied line, got %', (select n from c);
  end if;
  if (select amount from public.budgets where month = '2026-12-01' and member_id is null and category_id is null) <> 7000 then
    raise exception 'FAIL b5b: copy overwrote an existing December line';
  end if;
  raise notice 'PASS b5: copied the personal line, kept December''s own shared budget';
end $$;

-- ---------- 6. validation ----------
do $$
begin
  perform public.set_budget('2026-11-15', null, null, 100);
  raise exception 'FAIL b6: mid-month date accepted';
exception when invalid_parameter_value then
  raise notice 'PASS b6: month must start on the 1st';
end $$;
reset role;

-- ---------- 7. partner sees the shared budget but cannot touch mine ----------
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  if (select count(*) from public.budgets where month = '2026-11-01') <> 2 then
    raise exception 'FAIL b7: partner does not see the household budgets';
  end if;
  perform public.set_budget('2026-11-01', (select id from public.members where email = 'omer@example.com'), null, 1);
  raise exception 'FAIL b7b: partner changed my personal budget';
exception when insufficient_privilege then
  raise notice 'PASS b7: partner sees budgets, cannot change mine';
end $$;
reset role;

\echo 'ALL BUDGET TESTS PASSED'
