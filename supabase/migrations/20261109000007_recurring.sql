-- =====================================================================
-- 0007 · Fixed costs: recurring charges the household confirmed
--
-- The app SUGGESTS recurring charges from the transaction history; a row
-- lands here only when someone confirms it (is_active = true) or dismisses
-- it (is_active = false, so it is not suggested again).
-- Matching to transactions is by merchant_key (see transactions.merchant_key).
-- =====================================================================

alter table public.recurring
  add column label          text,
  add column period_months  int  not null default 1 check (period_months in (1, 2, 3, 12)),
  add column tag            text check (tag in ('apartment', 'personal')),
  add column created_by     uuid references public.members (id);

update public.recurring set label = merchant_pattern where label is null;
alter table public.recurring alter column label set not null;

-- One row per merchant: confirming twice updates, never duplicates.
alter table public.recurring add constraint recurring_merchant_unique unique (merchant_pattern);

-- Day 29–31 would be skipped in short months; the app reads it as "last day".
comment on column public.recurring.day_of_month is '1–31; days past a short month''s end mean its last day';
comment on column public.recurring.merchant_pattern is 'transactions.merchant_key this charge matches';
