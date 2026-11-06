-- Tests for 0004: idempotent imports, undo, learned categories.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- Two coffees on the same day (different hashes) + one supermarket row
create temp table file_rows as
select jsonb_build_array(
  jsonb_build_object('date','2026-11-03','amount',18,'merchant','קפה לנדוור','merchant_key','קפה לנדוור','external_hash','h-coffee-0','kind','expense'),
  jsonb_build_object('date','2026-11-03','amount',18,'merchant','קפה לנדוור','merchant_key','קפה לנדוור','external_hash','h-coffee-1','kind','expense'),
  jsonb_build_object('date','2026-11-04','amount',412.6,'merchant','שופרסל דיל','merchant_key','שופרסל דיל','external_hash','h-super','kind','expense',
                     'category_id', (select id from public.categories where name = 'סופר'), 'tag','apartment'),
  jsonb_build_object('date','2026-11-10','amount',3400,'merchant','מקס איט פיננסים','merchant_key','מקס איט פיננסים','external_hash','h-bill','kind','card_bill')
) as rows;
grant select on file_rows to authenticated;

-- ---------- 1. first import adds everything ----------
create temp table r1 as
select public.import_transactions((select id from public.accounts limit 1), 'max-nov.xlsx', (select rows from file_rows)) as res;
do $$
declare r jsonb := (select res from r1);
begin
  if (r ->> 'inserted')::int <> 4 or (r ->> 'duplicates')::int <> 0 then
    raise exception 'FAIL i1: expected 4 inserted, got %', r;
  end if;
  raise notice 'PASS i1: first import inserted 4 rows (two identical coffees kept)';
end $$;

-- ---------- 2. same file again adds nothing ----------
create temp table r2 as
select public.import_transactions((select id from public.accounts limit 1), 'max-nov.xlsx', (select rows from file_rows)) as res;
do $$
declare r jsonb := (select res from r2);
begin
  if (r ->> 'inserted')::int <> 0 or (r ->> 'duplicates')::int <> 4 then
    raise exception 'FAIL i2: re-import was not idempotent: %', r;
  end if;
  raise notice 'PASS i2: re-import inserted 0, reported 4 duplicates';
end $$;

-- ---------- 3. imported rows: payer = account owner, splits only on expenses ----------
do $$
declare owner uuid := (select member_id from public.accounts limit 1);
begin
  if exists (select 1 from public.transactions where external_hash like 'h-%' and paid_by <> owner) then
    raise exception 'FAIL i3: paid_by is not the account owner';
  end if;
  if exists (select 1 from public.transaction_splits s join public.transactions t on t.id = s.transaction_id
              where t.external_hash = 'h-bill') then
    raise exception 'FAIL i3b: card bill got a split';
  end if;
  if (select sum(s.amount) from public.transaction_splits s join public.transactions t on t.id = s.transaction_id
       where t.external_hash like 'h-coffee-%') <> 36 then
    raise exception 'FAIL i3c: coffee splits missing';
  end if;
  raise notice 'PASS i3: payer is the account owner; card bill not split; expenses split 100%% on payer';
end $$;

-- ---------- 4. learning a category fills the other rows of that merchant ----------
create temp table r4 as
select public.learn_category('קפה לנדוור', (select id from public.categories where name = 'אוכל בחוץ'), 'personal') as n;
do $$
begin
  if (select n from r4) <> 2 then
    raise exception 'FAIL i4: expected 2 coffees categorized, got %', (select n from r4);
  end if;
  if not exists (select 1 from public.category_rules where pattern = 'קפה לנדוור') then
    raise exception 'FAIL i4b: rule not saved';
  end if;
  raise notice 'PASS i4: learned rule saved and applied to both coffee rows';
end $$;

-- ---------- 5. learning again updates the rule, never overwrites a chosen category ----------
select public.learn_category('קפה לנדוור', (select id from public.categories where name = 'בילויים'), 'personal');
do $$
begin
  if (select count(*) from public.category_rules where pattern = 'קפה לנדוור') <> 1 then
    raise exception 'FAIL i5: duplicate rule';
  end if;
  if exists (select 1 from public.transactions t join public.categories c on c.id = t.category_id
              where t.merchant_key = 'קפה לנדוור' and c.name = 'בילויים') then
    raise exception 'FAIL i5b: already-categorized rows were overwritten';
  end if;
  raise notice 'PASS i5: rule updated in place; existing categories left alone';
end $$;

-- ---------- 6. undo import removes exactly that batch ----------
delete from public.import_batches where id = ((select res from r1) ->> 'batch_id')::uuid;
do $$
begin
  if exists (select 1 from public.transactions where external_hash like 'h-%') then
    raise exception 'FAIL i6: rows of the undone import remain';
  end if;
  if not exists (select 1 from public.transactions where merchant = 'שכר דירה') then
    raise exception 'FAIL i6b: undo removed unrelated rows';
  end if;
  raise notice 'PASS i6: undo deleted the batch and only its rows';
end $$;
reset role;

-- ---------- 7. outsider cannot import ----------
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$
begin
  perform public.import_transactions((select id from public.accounts limit 1), 'x', '[]'::jsonb);
  raise exception 'FAIL i7: outsider import did not fail';
exception when insufficient_privilege then
  raise notice 'PASS i7: outsider import rejected';
end $$;
reset role;

\echo 'ALL IMPORT TESTS PASSED'
