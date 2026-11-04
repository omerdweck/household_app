-- =====================================================================
-- 0001 · Core schema: household members, accounts, transactions, splits,
--        budgets, bills. Every table is protected by Row Level Security.
--
-- Conventions
--   * amount > 0  = money that left the household (an expense)
--   * amount < 0  = money that came back (refund)
--   * all money is numeric(12,2) in ILS unless original_currency says otherwise
-- =====================================================================

-- ---------------------------------------------------------------------
-- Members: the only two people allowed in. Rows are added by hand
-- (SQL editor) with just an e-mail; user_id is filled on first Google login.
-- ---------------------------------------------------------------------
create table public.members (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete set null,
  email         text not null unique check (email = lower(email)),
  display_name  text not null,
  created_at    timestamptz not null default now()
);

-- True when the current request comes from a signed-in household member.
-- SECURITY DEFINER so policies can call it without recursing into members' own RLS.
create function public.is_household_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m where m.user_id = (select auth.uid())
  );
$$;

-- The member row of the current user (null for anyone else).
create function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.members m where m.user_id = (select auth.uid());
$$;

-- Gate at sign-up: a Google account whose e-mail is not in members is rejected,
-- so the auth.users row is never created. Allowed e-mails get linked to their member row.
create function public.link_member_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.members
     set user_id = new.id
   where email = lower(new.email)
     and user_id is null;

  if not found then
    raise exception 'Sign-up rejected: % is not a household member', new.email
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_member_on_signup();

-- ---------------------------------------------------------------------
-- Accounts: bank accounts and credit cards, each owned by one member.
-- No account numbers, IDs or passwords are ever stored here.
-- ---------------------------------------------------------------------
create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members (id),
  provider    text not null check (provider in ('leumi', 'discount', 'max', 'other')),
  type        text not null check (type in ('bank', 'credit_card')),
  label       text not null,                 -- e.g. "מקס של עומר"
  last4       text check (last4 ~ '^[0-9]{4}$'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Categories (two levels: parent → child) and learned classification rules.
-- ---------------------------------------------------------------------
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  parent_id    uuid references public.categories (id) on delete cascade,
  default_tag  text check (default_tag in ('apartment', 'personal')),
  sort_order   int not null default 0,
  unique (parent_id, name)
);

create table public.category_rules (
  id           uuid primary key default gen_random_uuid(),
  pattern      text not null unique,          -- normalized merchant text to match
  category_id  uuid not null references public.categories (id) on delete cascade,
  tag          text check (tag in ('apartment', 'personal')),
  created_by   uuid references public.members (id),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Transactions: one row per real-world money movement.
-- ---------------------------------------------------------------------
create table public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid references public.accounts (id),
  paid_by             uuid not null references public.members (id),  -- who actually paid
  date                date not null,
  processed_date      date,
  amount              numeric(12, 2) not null,
  original_amount     numeric(12, 2),
  original_currency   text check (original_currency ~ '^[A-Z]{3}$'),
  merchant            text not null,
  description         text,
  category_id         uuid references public.categories (id) on delete set null,
  tag                 text check (tag in ('apartment', 'personal')),

  -- expense           : counted in charts and budgets
  -- card_bill         : the monthly credit-card charge on the bank statement (already itemized by the card)
  -- internal_transfer : money moving between the two partners' own accounts
  -- settlement        : a partner paying the other back (Bit / transfer) for a split expense
  -- income            : salary and other money in
  kind                text not null default 'expense'
                        check (kind in ('expense', 'card_bill', 'internal_transfer', 'settlement', 'income')),

  -- provisional : captured live (Apple Pay shortcut / manual), not yet seen in the bank data
  -- pending     : seen at the card company, not final yet
  -- completed   : final
  status              text not null default 'completed'
                        check (status in ('provisional', 'pending', 'completed')),
  source              text not null
                        check (source in ('bank_sync', 'file_import', 'shortcut', 'manual')),

  -- Stable fingerprint from the source (account + date + amount + merchant, or the bank's own id).
  -- Together with the unique constraint below it makes every import idempotent.
  external_hash       text,
  installment_number  int check (installment_number > 0),
  installment_total   int check (installment_total > 0),
  review_match_id     uuid references public.transactions (id) on delete set null,  -- "is this the same purchase?"
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint uniq_source_tx unique (account_id, external_hash),
  constraint installment_pair check ((installment_number is null) = (installment_total is null))
);

create index transactions_date_idx      on public.transactions (date desc);
create index transactions_paid_by_idx   on public.transactions (paid_by, date desc);
create index transactions_category_idx  on public.transactions (category_id);
create index transactions_open_provisional_idx
  on public.transactions (account_id, date) where status = 'provisional';

-- ---------------------------------------------------------------------
-- Splits: who carries each expense. Default = 100% on whoever paid.
-- "חלק שווה" and "עריכת חלוקה" in the app rewrite these rows.
-- ---------------------------------------------------------------------
create table public.transaction_splits (
  transaction_id  uuid not null references public.transactions (id) on delete cascade,
  member_id       uuid not null references public.members (id),
  amount          numeric(12, 2) not null,
  primary key (transaction_id, member_id)
);

create index transaction_splits_member_idx on public.transaction_splits (member_id);

-- A partner's Bit / transfer that pays back (part of) a split expense.
create table public.settlements (
  id               uuid primary key default gen_random_uuid(),
  transfer_tx_id   uuid not null references public.transactions (id) on delete cascade,
  original_tx_id   uuid not null references public.transactions (id) on delete cascade,
  amount           numeric(12, 2) not null check (amount > 0),
  created_at       timestamptz not null default now(),
  unique (transfer_tx_id, original_tx_id)
);

-- ---------------------------------------------------------------------
-- Budgets, recurring charges and apartment bills.
-- ---------------------------------------------------------------------
create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  month        date not null check (extract(day from month) = 1),   -- first day of the month
  member_id    uuid references public.members (id),                 -- null = shared pot
  category_id  uuid references public.categories (id) on delete cascade,  -- null = overall cap
  amount       numeric(12, 2) not null check (amount >= 0),
  unique nulls not distinct (month, member_id, category_id)
);

create table public.recurring (
  id                uuid primary key default gen_random_uuid(),
  merchant_pattern  text not null,
  expected_amount   numeric(12, 2),
  day_of_month      int check (day_of_month between 1 and 31),
  kind              text not null check (kind in ('bill', 'standing_order', 'subscription')),
  category_id       uuid references public.categories (id) on delete set null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create table public.bills (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('rent', 'electricity', 'water', 'arnona', 'internet', 'gas', 'vaad_bayit', 'other')),
  period_start    date not null,
  period_end      date not null check (period_end >= period_start),
  amount          numeric(12, 2) not null,
  due_date        date,
  paid            boolean not null default false,
  transaction_id  uuid references public.transactions (id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now()
);

-- =====================================================================
-- Integrity: splits must always add up to the transaction amount
-- =====================================================================

-- New expense → one split row: 100% on whoever paid.
create function public.default_split()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'expense' then
    insert into public.transaction_splits (transaction_id, member_id, amount)
    values (new.id, new.paid_by, new.amount);
  end if;
  return new;
end;
$$;

create trigger transactions_default_split
  after insert on public.transactions
  for each row execute function public.default_split();

-- Keep splits in step when a transaction changes:
--   * became an expense (e.g. re-marked from card_bill) → add the default split
--   * amount changed and there is a single split → move that split with it
--     (with several splits the app must re-split; the deferred check enforces it)
create function public.sync_single_split()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if new.kind <> 'expense' then
    return new;
  end if;

  select count(*) into n from public.transaction_splits where transaction_id = new.id;

  if n = 0 then
    insert into public.transaction_splits (transaction_id, member_id, amount)
    values (new.id, new.paid_by, new.amount);
  elsif n = 1 and new.amount is distinct from old.amount then
    update public.transaction_splits set amount = new.amount where transaction_id = new.id;
  end if;
  return new;
end;
$$;

create trigger transactions_sync_single_split
  after update of amount, kind on public.transactions
  for each row execute function public.sync_single_split();

-- Deferred check, run at COMMIT: an expense's splits sum exactly to its amount.
-- Deferring lets the app delete + re-insert splits inside one transaction.
create function public.check_split_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tx_id   uuid;
  tx      record;
  total   numeric(12, 2);
begin
  -- The same function guards both tables; the row's shape depends on which one fired.
  if tg_table_name = 'transactions' then
    tx_id := coalesce(new.id, old.id);
  else
    tx_id := coalesce(new.transaction_id, old.transaction_id);
  end if;

  select t.amount, t.kind into tx from public.transactions t where t.id = tx_id;
  if not found or tx.kind <> 'expense' then
    return null;  -- transaction deleted, or not an expense: nothing to check
  end if;

  select coalesce(sum(s.amount), 0) into total
    from public.transaction_splits s where s.transaction_id = tx_id;

  if total <> tx.amount then
    raise exception 'Splits for transaction % add up to %, expected %', tx_id, total, tx.amount
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger splits_sum_matches
  after insert or update or delete on public.transaction_splits
  deferrable initially deferred
  for each row execute function public.check_split_total();

create constraint trigger transactions_sum_matches
  after insert or update of amount, kind on public.transactions
  deferrable initially deferred
  for each row execute function public.check_split_total();

-- updated_at bookkeeping
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transactions_touch
  before update on public.transactions
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Row Level Security
-- Policy for every table: only signed-in household members, nobody else.
-- A table with RLS on and no matching policy returns zero rows.
-- =====================================================================
alter table public.members             enable row level security;
alter table public.accounts            enable row level security;
alter table public.categories          enable row level security;
alter table public.category_rules      enable row level security;
alter table public.transactions        enable row level security;
alter table public.transaction_splits  enable row level security;
alter table public.settlements         enable row level security;
alter table public.budgets             enable row level security;
alter table public.recurring           enable row level security;
alter table public.bills               enable row level security;

-- members: readable by the household; changed only from the SQL editor (service role).
create policy members_read on public.members
  for select to authenticated
  using ((select public.is_household_member()));

-- Everything else: full access for household members.
create policy household_all on public.accounts
  for all to authenticated
  using ((select public.is_household_member()))
  with check ((select public.is_household_member()));

create policy household_all on public.categories
  for all to authenticated
  using ((select public.is_household_member()))
  with check ((select public.is_household_member()));

create policy household_all on public.category_rules
  for all to authenticated
  using ((select public.is_household_member()))
  with check ((select public.is_household_member()));

create policy household_all on public.transactions
  for all to authenticated
  using ((select public.is_household_member()))
  with check ((select public.is_household_member()));

create policy household_all on public.transaction_splits
  for all to authenticated
  using ((select public.is_household_member()))
  with check ((select public.is_household_member()));

create policy household_all on public.settlements
  for all to authenticated
  using ((select public.is_household_member()))
  with check ((select public.is_household_member()));

create policy household_all on public.budgets
  for all to authenticated
  using ((select public.is_household_member()))
  with check ((select public.is_household_member()));

create policy household_all on public.recurring
  for all to authenticated
  using ((select public.is_household_member()))
  with check ((select public.is_household_member()));

create policy household_all on public.bills
  for all to authenticated
  using ((select public.is_household_member()))
  with check ((select public.is_household_member()));

-- The helper functions are for policies, not for anonymous visitors.
revoke execute on function public.is_household_member()   from anon, public;
revoke execute on function public.current_member_id()     from anon, public;
revoke execute on function public.link_member_on_signup() from anon, authenticated, public;
grant  execute on function public.is_household_member()   to authenticated;
grant  execute on function public.current_member_id()     to authenticated;
