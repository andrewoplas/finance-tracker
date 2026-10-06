-- Target: financial-tracker-brain (nbssibquqrkwuyhxzbyg)
-- Authorized legacy reset/install. Coordinator must verify target and private backup before execution.
-- No credentials, API exposure, auth provider settings or auth account rows are changed.
begin;
set local search_path=public,pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='120s';
-- Refuse to replace unrelated pre-existing application names or a previously installed tracker.
do $preflight$ begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','accounts','budgets','recurring_transactions','financial_audit','financial_requests','retro_plans','ledger_account_balances','ledger_wallet_balances','import_batches','installment_plans','installment_items','installment_payments','receivables','receivable_collections','balance_reconciliations','workflow_transactions','finance_report_rows','receivable_balances','installment_balances')) then raise exception 'Unexpected existing tracker relation; abort reset'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('handle_new_user','update_account_balance','update_wallet_balance','validate_financial_owner','immutable_financial_owner','transaction_revision','audit_transaction','commit_financial_operation','capture_opening_balance','audit_opening_balance','guard_balance_edit','finance_amount','validate_workflow_entry','commit_financial_operation_base','finance_shift_date','protect_balance_history')) then raise exception 'Unexpected existing tracker function; abort reset'; end if;
 if exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='on_auth_user_created') then raise exception 'Existing profile signup trigger; abort reset'; end if;
end $preflight$;
-- RESTRICT makes unknown catalog dependencies fail and roll back the entire transaction.
drop trigger create_wallets_on_signup on auth.users;
drop function public.create_user_wallets() restrict;
drop table public.transactions restrict;
drop table public.wallets restrict;
drop table public.categories restrict;
-- Retain harmless update_updated_at_column(): it may serve unrelated tables.
-- Source 001_initial_schema
-- Profiles (extends Supabase Auth)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  currency text default 'PHP',
  created_at timestamptz default now()
);

-- Enable RLS
alter table profiles enable row level security;

-- Profiles policies
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Accounts
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('cash', 'bank', 'e-wallet', 'credit-card', 'savings', 'investment')),
  balance decimal(12,2) default 0,
  icon text,
  color text,
  is_archived boolean default false,
  created_at timestamptz default now()
);

alter table accounts enable row level security;

create policy "Users can manage own accounts" on accounts
  for all using (auth.uid() = user_id);

-- Categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  icon text,
  color text,
  is_system boolean default false,
  created_at timestamptz default now()
);

alter table categories enable row level security;

create policy "Users can manage own categories" on categories
  for all using (auth.uid() = user_id);

-- Transactions
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  account_id uuid references accounts(id) on delete cascade not null,
  category_id uuid references categories(id) on delete set null,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount decimal(12,2) not null,
  description text,
  date date not null,
  time time,
  to_account_id uuid references accounts(id) on delete set null,
  receipt_url text,
  is_recurring boolean default false,
  recurring_id uuid,
  created_at timestamptz default now()
);

alter table transactions enable row level security;

create policy "Users can manage own transactions" on transactions
  for all using (auth.uid() = user_id);

-- Indexes for transactions
create index if not exists idx_transactions_user_date on transactions(user_id, date desc);
create index if not exists idx_transactions_account on transactions(account_id);
create index if not exists idx_transactions_category on transactions(category_id);

-- Budgets
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  category_id uuid references categories(id) on delete cascade not null,
  amount decimal(12,2) not null,
  period text not null check (period in ('weekly', 'monthly', 'yearly')),
  start_date date,
  rollover boolean default false,
  created_at timestamptz default now()
);

alter table budgets enable row level security;

create policy "Users can manage own budgets" on budgets
  for all using (auth.uid() = user_id);

-- Recurring Transactions
create table if not exists recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  account_id uuid references accounts(id) on delete cascade not null,
  category_id uuid references categories(id) on delete set null,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount decimal(12,2) not null,
  description text,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  next_date date not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table recurring_transactions enable row level security;

create policy "Users can manage own recurring transactions" on recurring_transactions
  for all using (auth.uid() = user_id);

-- Function to update account balance after transaction
create or replace function update_account_balance()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    -- Update source account
    if NEW.type = 'expense' or NEW.type = 'transfer' then
      update accounts set balance = balance - NEW.amount where id = NEW.account_id;
    elsif NEW.type = 'income' then
      update accounts set balance = balance + NEW.amount where id = NEW.account_id;
    end if;
    
    -- Update destination account for transfers
    if NEW.type = 'transfer' and NEW.to_account_id is not null then
      update accounts set balance = balance + NEW.amount where id = NEW.to_account_id;
    end if;
    
  elsif TG_OP = 'DELETE' then
    -- Reverse the transaction
    if OLD.type = 'expense' or OLD.type = 'transfer' then
      update accounts set balance = balance + OLD.amount where id = OLD.account_id;
    elsif OLD.type = 'income' then
      update accounts set balance = balance - OLD.amount where id = OLD.account_id;
    end if;
    
    if OLD.type = 'transfer' and OLD.to_account_id is not null then
      update accounts set balance = balance - OLD.amount where id = OLD.to_account_id;
    end if;
  end if;
  
  return coalesce(NEW, OLD);
end;
$$ language plpgsql security definer;

create or replace trigger on_transaction_change
  after insert or delete on transactions
  for each row execute procedure update_account_balance();

-- Source 002_add_wallets
-- Wallets table
create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  icon text,
  color text,
  target_percentage decimal(5,2), -- e.g., 50.00 for 50%
  balance decimal(12,2) default 0,
  created_at timestamptz default now()
);

alter table wallets enable row level security;

create policy "Users can manage own wallets" on wallets
  for all using (auth.uid() = user_id);

-- Add wallet_id to transactions
alter table transactions add column wallet_id uuid references wallets(id) on delete set null;

create index if not exists idx_transactions_wallet on transactions(wallet_id);

-- Function to update wallet balance after transaction
create or replace function update_wallet_balance()
returns trigger as $$
begin
  if TG_OP = 'INSERT' and NEW.wallet_id is not null then
    -- Update wallet balance
    if NEW.type = 'expense' then
      update wallets set balance = balance - NEW.amount where id = NEW.wallet_id;
    elsif NEW.type = 'income' then
      update wallets set balance = balance + NEW.amount where id = NEW.wallet_id;
    end if;
    
  elsif TG_OP = 'DELETE' and OLD.wallet_id is not null then
    -- Reverse the transaction
    if OLD.type = 'expense' then
      update wallets set balance = balance + OLD.amount where id = OLD.wallet_id;
    elsif OLD.type = 'income' then
      update wallets set balance = balance - OLD.amount where id = OLD.wallet_id;
    end if;
  end if;
  
  return coalesce(NEW, OLD);
end;
$$ language plpgsql security definer;

create or replace trigger on_transaction_wallet_change
  after insert or delete on transactions
  for each row execute procedure update_wallet_balance();

-- Source 003_ledger_integrity
-- Review on a database copy before applying. This does not repair historical drift.
begin;
-- Reject cross-owner references even when invoked by privileged triggers.
create or replace function public.validate_financial_owner() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if TG_OP = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'Owner is immutable';
  end if;
  if TG_TABLE_NAME in ('transactions', 'recurring_transactions') then
    if not exists(select 1 from public.accounts where id = new.account_id and user_id = new.user_id) then
      raise exception 'Invalid account';
    end if;
  end if;
  if new.category_id is not null and not exists(select 1 from public.categories where id = new.category_id and user_id = new.user_id) then
    raise exception 'Invalid category';
  end if;
  if new.amount is null or not (new.amount > 0 and new.amount < 10000000000) then raise exception 'Amount must be finite and positive'; end if;
  if TG_TABLE_NAME = 'transactions' then
    if new.to_account_id is not null and not exists(select 1 from public.accounts where id = new.to_account_id and user_id = new.user_id) then
      raise exception 'Invalid destination';
    end if;
    if new.wallet_id is not null and not exists(select 1 from public.wallets where id = new.wallet_id and user_id = new.user_id) then
      raise exception 'Invalid wallet';
    end if;
    if new.recurring_id is not null and not exists(select 1 from public.recurring_transactions where id = new.recurring_id and user_id = new.user_id) then raise exception 'Invalid recurring source'; end if;
    if new.type = 'transfer' and (new.to_account_id is null or new.to_account_id = new.account_id) then
      raise exception 'Transfer needs distinct accounts';
    end if;
    if new.type <> 'transfer' and new.to_account_id is not null then raise exception 'Unexpected destination'; end if;
  end if;
  return new;
end $$;
create trigger validate_transaction_owner before insert or update on public.transactions for each row execute function public.validate_financial_owner();
create trigger validate_recurring_owner before insert or update on public.recurring_transactions for each row execute function public.validate_financial_owner();
create trigger validate_budget_owner before insert or update on public.budgets for each row execute function public.validate_financial_owner();

create or replace function public.update_account_balance() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Stable lock ordering prevents opposite transfers deadlocking.
  perform 1 from public.accounts where id in (
    case when TG_OP <> 'INSERT' then old.account_id end,
    case when TG_OP <> 'INSERT' then old.to_account_id end,
    case when TG_OP <> 'DELETE' then new.account_id end,
    case when TG_OP <> 'DELETE' then new.to_account_id end
  ) order by id for update;
  if TG_OP <> 'INSERT' then
    update public.accounts set balance = balance + case when old.type = 'income' then -old.amount else old.amount end
    where id = old.account_id and user_id = old.user_id;
    if old.type = 'transfer' then
      update public.accounts set balance = balance - old.amount where id = old.to_account_id and user_id = old.user_id;
    end if;
  end if;
  if TG_OP <> 'DELETE' then
    update public.accounts set balance = balance + case when new.type = 'income' then new.amount else -new.amount end
    where id = new.account_id and user_id = new.user_id;
    if new.type = 'transfer' then
      update public.accounts set balance = balance + new.amount where id = new.to_account_id and user_id = new.user_id;
    end if;
  end if;
  return coalesce(new, old);
end $$;
create or replace trigger on_transaction_change after insert or update or delete on public.transactions
for each row execute function public.update_account_balance();

create or replace function public.update_wallet_balance() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.wallets where id in (
    case when TG_OP <> 'INSERT' then old.wallet_id end,
    case when TG_OP <> 'DELETE' then new.wallet_id end
  ) order by id for update;
  if TG_OP <> 'INSERT' and old.type <> 'transfer' then
    update public.wallets set balance = balance + case when old.type = 'income' then -old.amount else old.amount end
    where id = old.wallet_id and user_id = old.user_id;
  end if;
  if TG_OP <> 'DELETE' and new.type <> 'transfer' then
    update public.wallets set balance = balance + case when new.type = 'income' then new.amount else -new.amount end
    where id = new.wallet_id and user_id = new.user_id;
  end if;
  return coalesce(new, old);
end $$;
create or replace trigger on_transaction_wallet_change after insert or update or delete on public.transactions
for each row execute function public.update_wallet_balance();
create or replace function public.immutable_financial_owner() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
 if new.user_id <> old.user_id then raise exception 'Owner is immutable'; end if;
 return new;
end $$;
create trigger immutable_account_owner before update on public.accounts for each row execute function public.immutable_financial_owner();
create trigger immutable_category_owner before update on public.categories for each row execute function public.immutable_financial_owner();
create trigger immutable_wallet_owner before update on public.wallets for each row execute function public.immutable_financial_owner();
alter function public.handle_new_user() set search_path = public, pg_temp;
commit;

-- Source 004_financial_operations
begin;
alter table public.recurring_transactions add column anchor_day integer check(anchor_day between 1 and 31);
alter table public.transactions add column revision integer not null default 1,
  add column bill_date date, add column paid_date date,
  add column report_month text,
  add column attribution text not null default 'personal' check(attribution in ('personal','shared','reimbursable')),
  add column personal_amount numeric(12,2) not null default 0 check(personal_amount >= 0 and personal_amount <= amount),
  add constraint valid_personal_share check(type='expense' or personal_amount=0),
  add column review_status text not null default 'pending' check(review_status in ('pending','reviewed'));
update public.transactions set report_month = to_char(date, 'YYYY-MM');
alter table public.transactions alter column report_month set not null;
alter table public.transactions add constraint valid_report_month check(report_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

create table public.financial_audit (
 id bigint generated always as identity primary key, user_id uuid not null references public.profiles(id),
 transaction_id uuid not null, before_row jsonb, after_row jsonb, created_at timestamptz not null default now()
);
alter table public.financial_audit enable row level security;
create policy own_audit_read on public.financial_audit for select using(auth.uid() = user_id);
create index on public.financial_audit(user_id, transaction_id, id desc);

create or replace function public.transaction_revision() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if TG_OP = 'UPDATE' then new.revision := old.revision + 1; end if;
  new.report_month := coalesce(new.report_month, to_char(new.date, 'YYYY-MM'));
  return new;
end $$;
create trigger transaction_revision before insert or update on public.transactions for each row execute function public.transaction_revision();
create or replace function public.audit_transaction() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
 insert into public.financial_audit(user_id,transaction_id,before_row,after_row)
 values(coalesce(new.user_id,old.user_id), coalesce(new.id,old.id),
 case when TG_OP <> 'INSERT' then to_jsonb(old) end, case when TG_OP <> 'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
create trigger audit_transaction after insert or update or delete on public.transactions for each row execute function public.audit_transaction();

create table public.financial_requests (
 user_id uuid not null references public.profiles(id), request_id uuid not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(), primary key(user_id,request_id)
);
alter table public.financial_requests enable row level security;
create policy own_request_read on public.financial_requests for select using(auth.uid() = user_id);

-- Only this RPC writes request records; it validates the session and every target owner.
create or replace function public.commit_financial_operation(request_id uuid, operation jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 actor uuid := auth.uid(); previous public.financial_requests; current_row public.transactions;
 result_row public.transactions; entry jsonb; result jsonb := '[]'; kind text := operation->>'action';
 audit_row public.financial_audit; recurring public.recurring_transactions; next_day date; month_start date;
begin
 if actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
 -- Serialize per owner so retries and overlapping batches cannot race.
 perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
 select * into previous from public.financial_requests r where r.user_id = actor and r.request_id = commit_financial_operation.request_id;
 if found then
   if previous.payload <> operation then raise exception 'Idempotency key reused with different payload'; end if;
   return previous.result;
 end if;
 if kind = 'create' then
   if jsonb_typeof(operation->'entries') <> 'array' or jsonb_array_length(operation->'entries') not between 1 and 100 then raise exception 'Invalid batch'; end if;
   for entry in select value from jsonb_array_elements(operation->'entries') loop
     if entry->>'amount' is null or not ((entry->>'amount') ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$') then raise exception 'Exact decimal amount required'; end if;
     insert into public.transactions(user_id,account_id,category_id,wallet_id,type,amount,description,date,to_account_id,bill_date,paid_date,report_month,attribution,personal_amount,review_status)
     values(actor,(entry->>'account_id')::uuid,(entry->>'category_id')::uuid,(entry->>'wallet_id')::uuid,entry->>'type',(entry->>'amount')::numeric,
       entry->>'description',(entry->>'date')::date,(entry->>'to_account_id')::uuid,(entry->>'bill_date')::date,(entry->>'paid_date')::date,
       entry->>'report_month',coalesce(entry->>'attribution','personal'),coalesce((entry->>'personal_amount')::numeric,0),coalesce(entry->>'review_status','pending')) returning * into result_row;
     result := result || jsonb_build_array(to_jsonb(result_row));
   end loop;
 elsif kind = 'post_recurring' then
   select * into recurring from public.recurring_transactions where id=(operation->>'id')::uuid and user_id=actor for update;
   if not found or not recurring.is_active or recurring.next_date is distinct from (operation->>'expected_next_date')::date then raise exception 'Schedule conflict' using errcode='40001'; end if;
   if recurring.type='transfer' then raise exception 'Recurring transfers require destination mapping'; end if;
   insert into public.transactions(user_id,account_id,category_id,type,amount,description,date,report_month,is_recurring,recurring_id)
   values(actor,recurring.account_id,recurring.category_id,recurring.type,recurring.amount,recurring.description,(operation->>'date')::date,
   to_char((operation->>'date')::date,'YYYY-MM'),true,recurring.id) returning * into result_row;
   if recurring.frequency='daily' then next_day:=recurring.next_date+1;
   elsif recurring.frequency='weekly' then next_day:=recurring.next_date+7;
   else
     month_start:=(date_trunc('month',recurring.next_date)+case when recurring.frequency='yearly' then interval '1 year' else interval '1 month' end)::date;
     next_day:=month_start+least(coalesce(recurring.anchor_day,extract(day from recurring.next_date)::integer),extract(day from month_start+interval '1 month - 1 day')::integer)-1;
   end if;
   update public.recurring_transactions set next_date=next_day,anchor_day=coalesce(anchor_day,extract(day from recurring.next_date)::integer) where id=recurring.id;
   result:=to_jsonb(result_row);
 elsif kind in ('amend','reverse') then
   select * into current_row from public.transactions where id = (operation->>'id')::uuid and user_id = actor for update;
   if not found then raise exception 'Transaction unavailable'; end if;
   if (operation->>'expected_revision') is null or current_row.revision <> (operation->>'expected_revision')::integer then raise exception 'Revision conflict' using errcode = '40001'; end if;
   if kind = 'reverse' then
     delete from public.transactions where id = current_row.id;
     result := jsonb_build_object('reversed',current_row.id);
   else
     entry := operation->'entry';
     if entry->>'amount' is null or not ((entry->>'amount') ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$') then raise exception 'Exact decimal amount required'; end if;
     update public.transactions set account_id=(entry->>'account_id')::uuid, category_id=(entry->>'category_id')::uuid,
       wallet_id=(entry->>'wallet_id')::uuid,type=entry->>'type',amount=(entry->>'amount')::numeric,description=entry->>'description',
       date=(entry->>'date')::date,to_account_id=(entry->>'to_account_id')::uuid,bill_date=(entry->>'bill_date')::date,paid_date=(entry->>'paid_date')::date,
       report_month=entry->>'report_month',attribution=entry->>'attribution',personal_amount=(entry->>'personal_amount')::numeric,review_status=entry->>'review_status'
       where id=current_row.id returning * into result_row;
     result := to_jsonb(result_row);
   end if;
 elsif kind = 'undo' then
   select * into audit_row from public.financial_audit where user_id=actor and transaction_id=(operation->>'id')::uuid order by id desc limit 1;
   if not found or (operation->>'expected_audit_id') is null or audit_row.id::text <> operation->>'expected_audit_id' then raise exception 'Audit conflict' using errcode='40001'; end if;
   if audit_row.before_row is null then
     delete from public.transactions where id=audit_row.transaction_id and user_id=actor;
   elsif audit_row.after_row is null then
     result_row := jsonb_populate_record(null::public.transactions,audit_row.before_row);
     result_row.revision := result_row.revision + 1;
     insert into public.transactions select (result_row).*;
   else
     result_row := jsonb_populate_record(null::public.transactions,audit_row.before_row);
     update public.transactions set account_id=result_row.account_id, category_id=result_row.category_id,
       wallet_id=result_row.wallet_id,type=result_row.type,amount=result_row.amount,description=result_row.description,
       date=result_row.date,to_account_id=result_row.to_account_id,bill_date=result_row.bill_date,paid_date=result_row.paid_date,
       report_month=result_row.report_month,attribution=result_row.attribution,personal_amount=result_row.personal_amount,review_status=result_row.review_status
       where id=audit_row.transaction_id and user_id=actor;

   end if;
   result := jsonb_build_object('undone',audit_row.transaction_id);
 else raise exception 'Unsupported operation'; end if;
 insert into public.financial_requests values(actor,request_id,operation,result,now());
 return result;
end $$;
revoke all on function public.commit_financial_operation(uuid,jsonb) from public;
grant execute on function public.commit_financial_operation(uuid,jsonb) to authenticated;

create table public.retro_plans (
 user_id uuid not null references public.profiles(id), month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 notes text not null check(length(notes)<=5000), updated_at timestamptz not null default now(), primary key(user_id,month)
);
alter table public.retro_plans enable row level security;
create policy own_retro on public.retro_plans for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
commit;

-- Source 005_rebuildable_balances
begin;
-- Existing cached balances are NOT trustworthy opening balances. Keep null until
-- an owner explicitly reconciles a verified opening balance in a separate rollout.
alter table public.accounts add column opening_balance numeric(12,2);
alter table public.wallets add column opening_balance numeric(12,2);
create or replace function public.capture_opening_balance() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
 new.opening_balance := coalesce(new.balance,0);
 return new;
end $$;
create trigger capture_account_opening before insert on public.accounts for each row execute function public.capture_opening_balance();
create trigger capture_wallet_opening before insert on public.wallets for each row execute function public.capture_opening_balance();
create view public.ledger_account_balances with (security_invoker=true) as
select a.id,a.user_id,a.name,a.opening_balance,
 case when a.opening_balance is null then null else a.opening_balance + coalesce((
 select sum(case when t.account_id=a.id then case when t.type='income' then t.amount else -t.amount end else t.amount end)
 from public.transactions t where t.user_id=a.user_id and (t.account_id=a.id or (t.type='transfer' and t.to_account_id=a.id))
 ),0) end as derived_balance,
 a.balance as cached_balance,
 a.opening_balance is not null as opening_verified
from public.accounts a;
create view public.ledger_wallet_balances with (security_invoker=true) as
select w.id,w.user_id,w.name,w.opening_balance,
 case when w.opening_balance is null then null else w.opening_balance+coalesce((select sum(case when t.type='income' then t.amount else -t.amount end)
 from public.transactions t where t.user_id=w.user_id and t.wallet_id=w.id and t.type<>'transfer'),0) end as derived_balance,
 w.balance as cached_balance,w.opening_balance is not null as opening_verified
from public.wallets w;

-- All application transaction mutations now use the audited RPC. Keep SELECT RLS.
drop policy "Users can manage own transactions" on public.transactions;
create policy own_transactions_read on public.transactions for select using(auth.uid()=user_id);

commit;

-- Source 006_financial_workflows
begin;
alter table public.accounts add column revision integer not null default 1;
alter table public.wallets add column revision integer not null default 1;
create table public.import_batches (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 name text not null check(length(name) between 1 and 200), rows jsonb not null,
 state text not null default 'staged' check(state in ('staged','committed')),
 revision integer not null default 1, result jsonb, created_at timestamptz not null default now()
);
create table public.installment_plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 transaction_id uuid not null unique references public.transactions(id),
 reporting_basis text not null check(reporting_basis in ('purchase','billing')),
 revision integer not null default 1, created_at timestamptz not null default now()
);
create table public.installment_items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 plan_id uuid not null references public.installment_plans(id), sequence integer not null,
 bill_date date not null, due_date date not null check(due_date>=bill_date),
 report_month text not null check(report_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 amount numeric(12,2) not null check(amount>0 and amount<10000000000),
 personal_amount numeric(12,2) not null check(personal_amount>=0 and personal_amount<=amount),
 unique(plan_id,sequence)
);
create table public.installment_payments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 item_id uuid not null references public.installment_items(id),
 transaction_id uuid not null unique references public.transactions(id)
);
create table public.receivables (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 transaction_id uuid not null references public.transactions(id),
 counterparty text not null check(length(counterparty) between 1 and 100),
 amount numeric(12,2) not null check(amount>0 and amount<10000000000),
 revision integer not null default 1, created_at timestamptz not null default now()
);
create table public.receivable_collections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 receivable_id uuid not null references public.receivables(id),
 transaction_id uuid not null unique references public.transactions(id)
);
create table public.balance_reconciliations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 target_id uuid not null, target_type text not null check(target_type in ('account','wallet')),
 source text not null default 'reconciliation' check(source in ('creation','reconciliation')),
 as_of_date date not null, observed_balance numeric(12,2) not null,
 reason text not null check(length(reason) between 3 and 500),
 before_row jsonb not null, after_row jsonb not null, created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['import_batches','installment_plans','installment_items','installment_payments','receivables','receivable_collections','balance_reconciliations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy owner_read on public.%I for select using(auth.uid()=user_id)',t);
 end loop;
end $$;

create or replace function public.audit_opening_balance() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.balance_reconciliations(user_id,target_id,target_type,source,as_of_date,observed_balance,reason,before_row,after_row)
 values(new.user_id,new.id,case when TG_TABLE_NAME='accounts' then 'account' else 'wallet' end,'creation',
 (now() at time zone 'Asia/Manila')::date,coalesce(new.opening_balance,0),'Initial opening balance',
 jsonb_build_object('name',new.name,'balance',0,'opening_balance',null,'revision',0),to_jsonb(new));
 return new;
end $$;
create trigger audit_account_opening after insert on public.accounts for each row execute function public.audit_opening_balance();
create trigger audit_wallet_opening after insert on public.wallets for each row execute function public.audit_opening_balance();

-- Privileged ledger triggers and the authenticated RPC may update caches; ordinary
-- account/wallet UPDATE requests cannot change an opening balance or cache.
create or replace function public.guard_balance_edit() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if (new.balance is distinct from old.balance or new.opening_balance is distinct from old.opening_balance)
 and current_user <> (select tableowner from pg_tables where schemaname='public' and tablename=TG_TABLE_NAME) then
  raise exception 'Use audited balance reconciliation';
 end if;
 new.revision:=old.revision+1;
 return new;
end $$;
create trigger guard_balance_edit before update on public.accounts for each row execute function public.guard_balance_edit();
create trigger guard_balance_edit before update on public.wallets for each row execute function public.guard_balance_edit();

create or replace function public.finance_amount(value text, zero_ok boolean default false, signed_ok boolean default false) returns numeric
language plpgsql immutable set search_path=public,pg_temp as $$
declare n numeric;
begin
 if value is null or value !~ '^-?(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' then raise exception 'Exact decimal required'; end if;
 n:=value::numeric;
 if (not signed_ok and n<0) or (not zero_ok and n=0) then raise exception 'Invalid amount'; end if;
 return n;
end $$;

-- Validate database callers as well as HTTP clients. No UUID supplied by the
-- client can bypass same-owner references through SECURITY DEFINER.
create or replace function public.validate_workflow_entry(entry jsonb, actor uuid) returns void
language plpgsql set search_path=public,pg_temp as $$
begin
 perform public.finance_amount(entry->>'amount');
 if public.finance_amount(coalesce(entry->>'personal_amount','0'),true) > (entry->>'amount')::numeric then raise exception 'Personal share exceeds amount'; end if;
 if coalesce(entry->>'attribution','personal') not in ('personal','shared','reimbursable') then raise exception 'Invalid attribution'; end if;
 if entry->>'type'<>'expense' and public.finance_amount(coalesce(entry->>'personal_amount','0'),true)<>0 then raise exception 'Unexpected personal share'; end if;
 if entry->>'bill_date' is not null then perform (entry->>'bill_date')::date; end if;
 if entry->>'paid_date' is not null then perform (entry->>'paid_date')::date; end if;
 if not exists(select 1 from public.accounts where id=(entry->>'account_id')::uuid and user_id=actor and not is_archived) then raise exception 'Invalid account'; end if;
 if entry->>'category_id' is not null and not exists(select 1 from public.categories where id=(entry->>'category_id')::uuid and user_id=actor) then raise exception 'Invalid category'; end if;
 if entry->>'wallet_id' is not null and not exists(select 1 from public.wallets where id=(entry->>'wallet_id')::uuid and user_id=actor) then raise exception 'Invalid wallet'; end if;
 if entry->>'type' not in ('expense','income','transfer') or entry->>'type' is null then raise exception 'Invalid type'; end if;
 if entry->>'type'='transfer' then
   if not exists(select 1 from public.accounts where id=(entry->>'to_account_id')::uuid and user_id=actor and id<>(entry->>'account_id')::uuid and not is_archived) then raise exception 'Invalid destination'; end if;
 elsif entry->>'to_account_id' is not null then raise exception 'Unexpected destination'; end if;
 if coalesce(entry->>'description','')='' or length(entry->>'description')>300 then raise exception 'Invalid description'; end if;
 if entry->>'date' is null or (entry->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
 perform (entry->>'date')::date;
 if entry->>'report_month' is null or (entry->>'report_month') !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid report month'; end if;
end $$;
create or replace function public.commit_financial_operation_base(request_id uuid, operation jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 actor uuid := auth.uid(); previous public.financial_requests; current_row public.transactions;
 result_row public.transactions; entry jsonb; result jsonb := '[]'; kind text := operation->>'action';
 audit_row public.financial_audit; recurring public.recurring_transactions; next_day date; month_start date;
begin
 if actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
 -- Serialize per owner so retries and overlapping batches cannot race.
 perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
 select * into previous from public.financial_requests r where r.user_id = actor and r.request_id = commit_financial_operation_base.request_id;
 if found then
   if previous.payload <> operation then raise exception 'Idempotency key reused with different payload'; end if;
   return previous.result;
 end if;
 if kind = 'create' then
   if jsonb_typeof(operation->'entries') <> 'array' or jsonb_array_length(operation->'entries') not between 1 and 100 then raise exception 'Invalid batch'; end if;
   for entry in select value from jsonb_array_elements(operation->'entries') loop
     if entry->>'amount' is null or not ((entry->>'amount') ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$') then raise exception 'Exact decimal amount required'; end if;
     insert into public.transactions(user_id,account_id,category_id,wallet_id,type,amount,description,date,to_account_id,bill_date,paid_date,report_month,attribution,personal_amount,review_status)
     values(actor,(entry->>'account_id')::uuid,(entry->>'category_id')::uuid,(entry->>'wallet_id')::uuid,entry->>'type',(entry->>'amount')::numeric,
       entry->>'description',(entry->>'date')::date,(entry->>'to_account_id')::uuid,(entry->>'bill_date')::date,(entry->>'paid_date')::date,
       entry->>'report_month',coalesce(entry->>'attribution','personal'),coalesce((entry->>'personal_amount')::numeric,0),coalesce(entry->>'review_status','pending')) returning * into result_row;
     result := result || jsonb_build_array(to_jsonb(result_row));
   end loop;
 elsif kind = 'post_recurring' then
   select * into recurring from public.recurring_transactions where id=(operation->>'id')::uuid and user_id=actor for update;
   if not found or not recurring.is_active or recurring.next_date is distinct from (operation->>'expected_next_date')::date then raise exception 'Schedule conflict' using errcode='40001'; end if;
   if recurring.type='transfer' then raise exception 'Recurring transfers require destination mapping'; end if;
   insert into public.transactions(user_id,account_id,category_id,type,amount,description,date,report_month,is_recurring,recurring_id)
   values(actor,recurring.account_id,recurring.category_id,recurring.type,recurring.amount,recurring.description,(operation->>'date')::date,
   to_char((operation->>'date')::date,'YYYY-MM'),true,recurring.id) returning * into result_row;
   if recurring.frequency='daily' then next_day:=recurring.next_date+1;
   elsif recurring.frequency='weekly' then next_day:=recurring.next_date+7;
   else
     month_start:=(date_trunc('month',recurring.next_date)+case when recurring.frequency='yearly' then interval '1 year' else interval '1 month' end)::date;
     next_day:=month_start+least(coalesce(recurring.anchor_day,extract(day from recurring.next_date)::integer),extract(day from month_start+interval '1 month - 1 day')::integer)-1;
   end if;
   update public.recurring_transactions set next_date=next_day,anchor_day=coalesce(anchor_day,extract(day from recurring.next_date)::integer) where id=recurring.id;
   result:=to_jsonb(result_row);
 elsif kind in ('amend','reverse') then
   select * into current_row from public.transactions where id = (operation->>'id')::uuid and user_id = actor for update;
   if not found then raise exception 'Transaction unavailable'; end if;
   if (operation->>'expected_revision') is null or current_row.revision <> (operation->>'expected_revision')::integer then raise exception 'Revision conflict' using errcode = '40001'; end if;
   if kind = 'reverse' then
     delete from public.transactions where id = current_row.id;
     result := jsonb_build_object('reversed',current_row.id);
   else
     entry := operation->'entry';
     if entry->>'amount' is null or not ((entry->>'amount') ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$') then raise exception 'Exact decimal amount required'; end if;
     update public.transactions set account_id=(entry->>'account_id')::uuid, category_id=(entry->>'category_id')::uuid,
       wallet_id=(entry->>'wallet_id')::uuid,type=entry->>'type',amount=(entry->>'amount')::numeric,description=entry->>'description',
       date=(entry->>'date')::date,to_account_id=(entry->>'to_account_id')::uuid,bill_date=(entry->>'bill_date')::date,paid_date=(entry->>'paid_date')::date,
       report_month=entry->>'report_month',attribution=entry->>'attribution',personal_amount=(entry->>'personal_amount')::numeric,review_status=entry->>'review_status'
       where id=current_row.id returning * into result_row;
     result := to_jsonb(result_row);
   end if;
 elsif kind = 'undo' then
   select * into audit_row from public.financial_audit where user_id=actor and transaction_id=(operation->>'id')::uuid order by id desc limit 1;
   if not found or (operation->>'expected_audit_id') is null or audit_row.id::text <> operation->>'expected_audit_id' then raise exception 'Audit conflict' using errcode='40001'; end if;
   if audit_row.before_row is null then
     delete from public.transactions where id=audit_row.transaction_id and user_id=actor;
   elsif audit_row.after_row is null then
     result_row := jsonb_populate_record(null::public.transactions,audit_row.before_row);
     result_row.revision := result_row.revision + 1;
     insert into public.transactions select (result_row).*;
   else
     result_row := jsonb_populate_record(null::public.transactions,audit_row.before_row);
     update public.transactions set account_id=result_row.account_id, category_id=result_row.category_id,
       wallet_id=result_row.wallet_id,type=result_row.type,amount=result_row.amount,description=result_row.description,
       date=result_row.date,to_account_id=result_row.to_account_id,bill_date=result_row.bill_date,paid_date=result_row.paid_date,
       report_month=result_row.report_month,attribution=result_row.attribution,personal_amount=result_row.personal_amount,review_status=result_row.review_status
       where id=audit_row.transaction_id and user_id=actor;

   end if;
   result := jsonb_build_object('undone',audit_row.transaction_id);
 else raise exception 'Unsupported operation'; end if;
 insert into public.financial_requests values(actor,request_id,operation,result,now());
 return result;
end $$;
revoke all on function public.commit_financial_operation_base(uuid,jsonb) from public, authenticated;
create table public.workflow_transactions (
 transaction_id uuid primary key, user_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('collection','installment_payment')), created_at timestamptz not null default now()
);
alter table public.workflow_transactions enable row level security;
create policy owner_read on public.workflow_transactions for select using(auth.uid()=user_id);
create or replace function public.finance_shift_date(value date, months integer) returns date
language sql immutable set search_path=public,pg_temp as $$
 select (date_trunc('month',value)+make_interval(months=>months))::date +
 least(extract(day from value)::integer, extract(day from date_trunc('month',value)+make_interval(months=>months+1)-interval '1 day')::integer)-1
$$;

create or replace function public.commit_financial_operation(request_id uuid, operation jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 actor uuid:=auth.uid(); previous public.financial_requests; kind text:=operation->>'action';
 result jsonb; item jsonb; entry jsonb; staged jsonb:='[]'; matches jsonb; decision text;
 batch public.import_batches; purchase public.transactions; plan public.installment_plans;
 schedule public.installment_items; receivable public.receivables; payment record;
 before_row jsonb; after_row jsonb; txn_result jsonb; affected uuid[]:='{}'; account_id uuid;
 n integer; i integer; cents bigint; personal_cents bigint; total numeric; allocated numeric;
 paid numeric; money_value numeric; opening numeric; delta numeric; current_revision integer;
 target_kind text; target_id uuid; as_of date; new_id uuid; txn_id uuid; bill date; due date;
begin
 if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select * into previous from public.financial_requests r where r.user_id=actor and r.request_id=commit_financial_operation.request_id;
 if found then
  if previous.payload<>operation then raise exception 'Idempotency key reused with different payload'; end if;
  return previous.result;
 end if;
 if kind in ('create','amend','reverse','undo','post_recurring') then
  if kind in ('amend','reverse','undo') and (
   exists(select 1 from public.workflow_transactions where transaction_id=(operation->>'id')::uuid and user_id=actor) or
   exists(select 1 from public.installment_plans where transaction_id=(operation->>'id')::uuid and user_id=actor) or
   exists(select 1 from public.receivables where transaction_id=(operation->>'id')::uuid and user_id=actor)
  ) then
   if kind<>'amend' then raise exception 'Linked transaction: use workflow settlement reversal or cancel the unpaid plan first'; end if;
   select * into purchase from public.transactions where id=(operation->>'id')::uuid and user_id=actor;
   entry:=operation->'entry';
   if not found or (entry->>'account_id')::uuid is distinct from purchase.account_id or (entry->>'wallet_id')::uuid is distinct from purchase.wallet_id
    or entry->>'type' is distinct from purchase.type or (entry->>'amount')::numeric is distinct from purchase.amount
    or (entry->>'date')::date is distinct from purchase.date or (entry->>'to_account_id')::uuid is distinct from purchase.to_account_id
    or (entry->>'bill_date')::date is distinct from purchase.bill_date or (entry->>'paid_date')::date is distinct from purchase.paid_date
    or entry->>'report_month' is distinct from purchase.report_month or entry->>'attribution' is distinct from purchase.attribution
    or (entry->>'personal_amount')::numeric is distinct from purchase.personal_amount then
     raise exception 'Linked financial values are protected; reverse settlements or cancel the unpaid plan first';
   end if;
  end if;
  return public.commit_financial_operation_base(request_id,operation);
 elsif kind='stage_import' then
  if jsonb_typeof(operation->'rows') is distinct from 'array' or jsonb_array_length(operation->'rows') not between 1 and 100 then raise exception 'Stage 1 to 100 rows'; end if;
  if (select count(distinct value->>'source_row') from jsonb_array_elements(operation->'rows'))<>jsonb_array_length(operation->'rows') then raise exception 'Source row IDs must be unique'; end if;
  for item in select value from jsonb_array_elements(operation->'rows') loop
   entry:=item->'entry'; matches:='[]';
   begin
    if entry is null or entry='null' then raise exception 'Unmapped row'; end if;
    perform public.validate_workflow_entry(entry,actor);
    select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'date',t.date,'description',t.description,'amount',t.amount::text,'account_id',t.account_id)), '[]') into matches
      from public.transactions t where t.user_id=actor and t.account_id=(entry->>'account_id')::uuid and t.type=entry->>'type'
      and t.date=(entry->>'date')::date and t.amount=(entry->>'amount')::numeric and lower(trim(coalesce(t.description,'')))=lower(trim(entry->>'description'));
    if exists(select 1 from jsonb_array_elements(staged) s where s->'entry'->>'account_id'=entry->>'account_id' and s->'entry'->>'date'=entry->>'date'
      and s->'entry'->>'type'=entry->>'type' and (s->'entry'->>'amount')::numeric=(entry->>'amount')::numeric
      and lower(trim(s->'entry'->>'description'))=lower(trim(entry->>'description'))) then
       matches:=matches||jsonb_build_array(jsonb_build_object('source','earlier row in this batch'));
    end if;
    staged:=staged||jsonb_build_array(jsonb_build_object('source_row',item->'source_row','entry',entry,'source',item->'source','status',case when jsonb_array_length(matches)>0 then 'duplicate' else 'ready' end,'matches',matches));
   exception when others then
    staged:=staged||jsonb_build_array(jsonb_build_object('source_row',item->'source_row','entry',null,'source',item->'source','status','exception','reason','Correct the source values and account mapping, or skip this row'));
   end;
  end loop;
  insert into public.import_batches(user_id,name,rows) values(actor,operation->>'name',staged) returning * into batch;
  result:=to_jsonb(batch);
 elsif kind='commit_import' then
  select * into batch from public.import_batches where id=(operation->>'id')::uuid and user_id=actor for update;
  if not found or batch.state<>'staged' or batch.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Batch changed or already committed' using errcode='40001'; end if;
  if jsonb_typeof(operation->'decisions') is distinct from 'array' or jsonb_array_length(operation->'decisions')<>jsonb_array_length(batch.rows)
    or (select count(distinct value->>'source_row') from jsonb_array_elements(operation->'decisions'))<>jsonb_array_length(batch.rows) then raise exception 'Review every row exactly once'; end if;
  if jsonb_typeof(operation->'closing_balances') is distinct from 'array' then raise exception 'Closing balances required'; end if;
  if (select count(distinct value->>'account_id') from jsonb_array_elements(operation->'closing_balances'))<>jsonb_array_length(operation->'closing_balances') then raise exception 'Duplicate closing balance'; end if;
  staged:='[]';
  for item in select value from jsonb_array_elements(batch.rows) loop
   select d->>'decision' into decision from jsonb_array_elements(operation->'decisions') d where d->>'source_row'=item->>'source_row';
   if decision is null or decision not in ('skip','include','include_duplicate') then raise exception 'Unresolved review decision'; end if;
   if decision='skip' then continue; end if;
   if item->>'status'='exception' then raise exception 'Exception rows cannot be committed'; end if;
   entry:=item->'entry'; perform public.validate_workflow_entry(entry,actor);
   if decision<>'include_duplicate' and ((item->>'status')='duplicate' or exists(select 1 from public.transactions t where t.user_id=actor and t.account_id=(entry->>'account_id')::uuid and t.type=entry->>'type' and t.date=(entry->>'date')::date and t.amount=(entry->>'amount')::numeric and lower(trim(coalesce(t.description,'')))=lower(trim(entry->>'description')))) then raise exception 'Duplicate found: explicitly include or skip' using errcode='40001'; end if;
   foreach account_id in array array[(entry->>'account_id')::uuid,(entry->>'to_account_id')::uuid] loop
    if account_id is null then continue; end if;
    if not exists(select 1 from jsonb_array_elements(operation->'closing_balances') c where (c->>'account_id')::uuid=account_id and (c->>'as_of_date')::date>=(entry->>'date')::date) then raise exception 'Closing statement required for each affected account'; end if;
    affected:=array_append(affected,account_id);
   end loop;
   txn_result:=public.commit_financial_operation_base(gen_random_uuid(),jsonb_build_object('action','create','entries',jsonb_build_array(entry)));
   staged:=staged||txn_result;
  end loop;
  for item in select value from jsonb_array_elements(operation->'closing_balances') loop
   target_id:=(item->>'account_id')::uuid; as_of:=(item->>'as_of_date')::date;
   select a.opening_balance into opening from public.accounts a where a.id=target_id and a.user_id=actor;
   if not found or opening is null then raise exception 'Reconcile opening balance before import'; end if;
   select coalesce(sum(case when t.account_id=target_id then case when t.type='income' then t.amount else -t.amount end else t.amount end),0) into delta
    from public.transactions t where t.user_id=actor and t.date<=as_of and (t.account_id=target_id or (t.type='transfer' and t.to_account_id=target_id));
   if opening+delta<>public.finance_amount(item->>'balance',true,true) then raise exception 'Closing balance mismatch: entire import rolled back'; end if;
  end loop;
  update public.import_batches set state='committed',revision=revision+1,result=jsonb_build_object('transactions',staged,'decisions',operation->'decisions','closing_balances',operation->'closing_balances') where id=batch.id returning * into batch;
  result:=to_jsonb(batch);
 elsif kind='create_installments' then
  select * into purchase from public.transactions where id=(operation->>'transaction_id')::uuid and user_id=actor for update;
  if not found or purchase.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Purchase changed' using errcode='40001'; end if;
  if purchase.type<>'expense' or not exists(select 1 from public.accounts where id=purchase.account_id and user_id=actor and type='credit-card') then raise exception 'Installments require a recorded credit-card purchase'; end if;
  n:=(operation->>'count')::integer; cents:=(purchase.amount*100)::bigint;
  personal_cents:=(case when purchase.attribution='personal' then purchase.amount else purchase.personal_amount end*100)::bigint;
  if n is null or n not between 1 and 120 or n>cents then raise exception 'Invalid installment count'; end if;
  if (operation->>'first_bill_date')::date<purchase.date then raise exception 'Bill cannot precede purchase'; end if;
  insert into public.installment_plans(user_id,transaction_id,reporting_basis) values(actor,purchase.id,operation->>'reporting_basis') returning * into plan;
  for i in 0..n-1 loop
   bill:=public.finance_shift_date((operation->>'first_bill_date')::date,i); due:=public.finance_shift_date((operation->>'first_due_date')::date,i);
   insert into public.installment_items(user_id,plan_id,sequence,bill_date,due_date,report_month,amount,personal_amount)
   values(actor,plan.id,i+1,bill,due,to_char(public.finance_shift_date(((operation->>'first_report_month')||'-01')::date,i),'YYYY-MM'),
    (cents/n+case when i<cents%n then 1 else 0 end)::numeric/100,
    (personal_cents/n+case when i<personal_cents%n then 1 else 0 end)::numeric/100);
  end loop;
  result:=to_jsonb(plan);
 elsif kind='pay_installment' then
  select * into schedule from public.installment_items where id=(operation->>'item_id')::uuid and user_id=actor;
  if not found then raise exception 'Installment unavailable'; end if;
  select * into plan from public.installment_plans where id=schedule.plan_id and user_id=actor for update;
  if plan.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Plan changed' using errcode='40001'; end if;
  select * into purchase from public.transactions where id=plan.transaction_id and user_id=actor;
  select coalesce(sum(t.amount),0) into paid from public.installment_payments p join public.transactions t on t.id=p.transaction_id where p.item_id=schedule.id;
  money_value:=public.finance_amount(operation->>'amount');
  if money_value>schedule.amount-paid then raise exception 'Payment exceeds remaining installment'; end if;
  txn_result:=public.commit_financial_operation_base(gen_random_uuid(),jsonb_build_object('action','create','entries',jsonb_build_array(jsonb_build_object(
    'account_id',operation->>'account_id','to_account_id',purchase.account_id,'type','transfer','amount',money_value::text,'description','Installment: '||purchase.description,
    'date',operation->>'date','paid_date',operation->>'date','bill_date',schedule.bill_date,'report_month',left(operation->>'date',7)))));
  txn_id:=(txn_result->0->>'id')::uuid;
  insert into public.installment_payments(user_id,item_id,transaction_id) values(actor,schedule.id,txn_id) returning id into new_id;
  insert into public.workflow_transactions values(txn_id,actor,'installment_payment',now());
  update public.installment_plans set revision=revision+1 where id=plan.id;
  result:=jsonb_build_object('id',new_id,'transaction_id',txn_id,'remaining',schedule.amount-paid-money_value,'revision',plan.revision+1);
 elsif kind='create_receivable' then
  select * into purchase from public.transactions where id=(operation->>'transaction_id')::uuid and user_id=actor for update;
  if not found or purchase.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Purchase changed' using errcode='40001'; end if;
  if purchase.type<>'expense' or purchase.attribution='personal' then raise exception 'Record a shared or reimbursable expense first'; end if;
  select coalesce(sum(amount),0) into allocated from public.receivables where transaction_id=purchase.id;
  money_value:=public.finance_amount(operation->>'amount');
  if money_value>purchase.amount-purchase.personal_amount-allocated then raise exception 'Allocation exceeds recoverable share'; end if;
  insert into public.receivables(user_id,transaction_id,counterparty,amount) values(actor,purchase.id,operation->>'counterparty',money_value) returning * into receivable;
  result:=to_jsonb(receivable);
 elsif kind='collect_receivable' then
  select * into receivable from public.receivables where id=(operation->>'id')::uuid and user_id=actor for update;
  if not found or receivable.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Receivable changed' using errcode='40001'; end if;
  select coalesce(sum(t.amount),0) into paid from public.receivable_collections c join public.transactions t on t.id=c.transaction_id where c.receivable_id=receivable.id;
  money_value:=public.finance_amount(operation->>'amount');
  if money_value>receivable.amount-paid then raise exception 'Collection exceeds outstanding amount'; end if;
  txn_result:=public.commit_financial_operation_base(gen_random_uuid(),jsonb_build_object('action','create','entries',jsonb_build_array(jsonb_build_object(
    'account_id',operation->>'account_id','type','income','amount',money_value::text,'description','Reimbursement: '||receivable.counterparty,
    'date',operation->>'date','paid_date',operation->>'date','report_month',left(operation->>'date',7)))));
  txn_id:=(txn_result->0->>'id')::uuid;
  insert into public.receivable_collections(user_id,receivable_id,transaction_id) values(actor,receivable.id,txn_id) returning id into new_id;
  insert into public.workflow_transactions values(txn_id,actor,'collection',now());
  update public.receivables set revision=revision+1 where id=receivable.id;
  result:=jsonb_build_object('id',new_id,'transaction_id',txn_id,'remaining',receivable.amount-paid-money_value,'revision',receivable.revision+1);
 elsif kind='reverse_settlement' then
  if operation->>'settlement_type'='collection' then
   select c.id,c.transaction_id,c.receivable_id as parent_id,r.revision into payment from public.receivable_collections c join public.receivables r on r.id=c.receivable_id where c.id=(operation->>'id')::uuid and c.user_id=actor for update of r;
   if not found or payment.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Collection changed' using errcode='40001'; end if;
   delete from public.receivable_collections where id=payment.id;
   update public.receivables set revision=revision+1 where id=payment.parent_id;
  elsif operation->>'settlement_type'='installment_payment' then
   select p.id,p.transaction_id,s.plan_id as parent_id,l.revision into payment from public.installment_payments p join public.installment_items s on s.id=p.item_id join public.installment_plans l on l.id=s.plan_id where p.id=(operation->>'id')::uuid and p.user_id=actor for update of l;
   if not found or payment.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Payment changed' using errcode='40001'; end if;
   delete from public.installment_payments where id=payment.id;
   update public.installment_plans set revision=revision+1 where id=payment.parent_id;
  else raise exception 'Invalid settlement type'; end if;
  select * into purchase from public.transactions where id=payment.transaction_id and user_id=actor;
  result:=public.commit_financial_operation_base(gen_random_uuid(),jsonb_build_object('action','reverse','id',purchase.id,'expected_revision',purchase.revision))||jsonb_build_object('before',to_jsonb(payment));
 elsif kind='cancel_plan' then
  if operation->>'plan_type'='receivable' then
   select * into receivable from public.receivables where id=(operation->>'id')::uuid and user_id=actor for update;
   if not found or receivable.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Receivable changed' using errcode='40001'; end if;
   if exists(select 1 from public.receivable_collections where receivable_id=receivable.id) then raise exception 'Reverse collections first'; end if;
   delete from public.receivables where id=receivable.id; result:=to_jsonb(receivable);
  elsif operation->>'plan_type'='installment' then
   select * into plan from public.installment_plans where id=(operation->>'id')::uuid and user_id=actor for update;
   if not found or plan.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Plan changed' using errcode='40001'; end if;
   if exists(select 1 from public.installment_payments p join public.installment_items s on s.id=p.item_id where s.plan_id=plan.id) then raise exception 'Reverse payments first'; end if;
   select jsonb_agg(to_jsonb(s)) into staged from public.installment_items s where plan_id=plan.id;
   delete from public.installment_items where plan_id=plan.id; delete from public.installment_plans where id=plan.id;
   result:=to_jsonb(plan)||jsonb_build_object('schedule',staged);
  else raise exception 'Invalid plan type'; end if;
 elsif kind='reconcile_balance' then
  target_kind:=operation->>'target_type'; target_id:=(operation->>'id')::uuid; as_of:=(operation->>'as_of_date')::date;
  money_value:=public.finance_amount(operation->>'observed_balance',true,true);
  if target_kind='account' then
   select to_jsonb(a),a.revision into before_row,current_revision from public.accounts a where a.id=target_id and a.user_id=actor for update;
   if not found then raise exception 'Account unavailable'; end if;
   select coalesce(sum(case when t.account_id=target_id then case when t.type='income' then t.amount else -t.amount end else t.amount end),0),
    coalesce(sum(case when t.date<=as_of then case when t.account_id=target_id then case when t.type='income' then t.amount else -t.amount end else t.amount end else 0 end),0)
    into total,delta from public.transactions t where t.user_id=actor and (t.account_id=target_id or (t.type='transfer' and t.to_account_id=target_id));
  elsif target_kind='wallet' then
   select to_jsonb(w),w.revision into before_row,current_revision from public.wallets w where w.id=target_id and w.user_id=actor for update;
   if not found then raise exception 'Wallet unavailable'; end if;
   select coalesce(sum(case when t.type='income' then t.amount else -t.amount end),0),
    coalesce(sum(case when t.date<=as_of then case when t.type='income' then t.amount else -t.amount end else 0 end),0)
    into total,delta from public.transactions t where t.user_id=actor and t.wallet_id=target_id and t.type<>'transfer';
  else raise exception 'Invalid reconciliation target'; end if;
  if current_revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Balance changed: refresh before reconciling' using errcode='40001'; end if;
  if target_kind='account' then
   update public.accounts set opening_balance=money_value-delta,balance=money_value-delta+total where id=target_id returning to_jsonb(accounts.*) into after_row;
  else
   update public.wallets set opening_balance=money_value-delta,balance=money_value-delta+total where id=target_id returning to_jsonb(wallets.*) into after_row;
  end if;
  insert into public.balance_reconciliations(user_id,target_id,target_type,as_of_date,observed_balance,reason,before_row,after_row)
   values(actor,target_id,target_kind,as_of,money_value,operation->>'reason',before_row,after_row) returning id into new_id;
  result:=jsonb_build_object('id',new_id,'before',before_row,'after',after_row);
 else raise exception 'Unsupported operation'; end if;
 insert into public.financial_requests values(actor,request_id,operation,result,now());
 return result;
end $$;
revoke all on function public.commit_financial_operation(uuid,jsonb) from public;
grant execute on function public.commit_financial_operation(uuid,jsonb) to authenticated;

create view public.finance_report_rows with (security_invoker=true) as
 select t.user_id,t.report_month,
  to_jsonb(t)||jsonb_build_object('amount',t.amount::text,'personal_amount',t.personal_amount::text,
   'report_kind',case when exists(select 1 from public.workflow_transactions w where w.transaction_id=t.id and w.user_id=t.user_id and w.kind='collection') then 'collection' else 'transaction' end) as entry
 from public.transactions t
 where not exists(select 1 from public.installment_plans p where p.transaction_id=t.id and p.user_id=t.user_id and p.reporting_basis='billing')
 union all
 select t.user_id,s.report_month,
  to_jsonb(t)||jsonb_build_object('id',s.id,'source_transaction_id',t.id,'amount',s.amount::text,'personal_amount',s.personal_amount::text,
   'bill_date',s.bill_date,'paid_date',null,'report_month',s.report_month,'report_kind','installment') as entry
 from public.installment_plans p join public.installment_items s on s.plan_id=p.id and s.user_id=p.user_id
 join public.transactions t on t.id=p.transaction_id and t.user_id=p.user_id where p.reporting_basis='billing';

create view public.receivable_balances with (security_invoker=true) as
 select r.*,coalesce((select sum(t.amount) from public.receivable_collections c join public.transactions t on t.id=c.transaction_id and t.user_id=c.user_id where c.receivable_id=r.id and c.user_id=r.user_id),0) as collected,
 r.amount-coalesce((select sum(t.amount) from public.receivable_collections c join public.transactions t on t.id=c.transaction_id and t.user_id=c.user_id where c.receivable_id=r.id and c.user_id=r.user_id),0) as outstanding
 from public.receivables r;
create view public.installment_balances with (security_invoker=true) as
 select s.*,coalesce((select sum(t.amount) from public.installment_payments p join public.transactions t on t.id=p.transaction_id and t.user_id=p.user_id where p.item_id=s.id and p.user_id=s.user_id),0) as paid,
 s.amount-coalesce((select sum(t.amount) from public.installment_payments p join public.transactions t on t.id=p.transaction_id and t.user_id=p.user_id where p.item_id=s.id and p.user_id=s.user_id),0) as remaining
 from public.installment_items s;
-- Account deletion must not bypass the shared ledger by cascading away history.
create or replace function public.protect_balance_history() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.transactions where account_id=old.id or to_account_id=old.id or wallet_id=old.id) or
 exists(select 1 from public.balance_reconciliations where target_id=old.id and user_id=old.user_id and source='reconciliation') or
 exists(select 1 from public.financial_audit where user_id=old.user_id and (
  before_row->>'account_id'=old.id::text or before_row->>'to_account_id'=old.id::text or before_row->>'wallet_id'=old.id::text or
  after_row->>'account_id'=old.id::text or after_row->>'to_account_id'=old.id::text or after_row->>'wallet_id'=old.id::text)) then
  raise exception 'Balances with ledger or reconciliation history cannot be deleted; archive accounts instead';
 end if;
 return old;
end $$;
create trigger protect_account_history before delete on public.accounts for each row execute function public.protect_balance_history();
create trigger protect_wallet_history before delete on public.wallets for each row execute function public.protect_balance_history();
commit;

-- Explicit new application objects only; never revoke all objects in public.
revoke all on public.profiles, public.accounts, public.categories, public.transactions, public.budgets, public.recurring_transactions, public.wallets, public.financial_audit, public.financial_requests, public.retro_plans, public.ledger_account_balances, public.ledger_wallet_balances, public.import_batches, public.installment_plans, public.installment_items, public.installment_payments, public.receivables, public.receivable_collections, public.balance_reconciliations, public.workflow_transactions, public.finance_report_rows, public.receivable_balances, public.installment_balances from public,anon,authenticated,service_role;
do $acl$ declare obj record; begin
 for obj in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('handle_new_user','update_account_balance','update_wallet_balance','validate_financial_owner','immutable_financial_owner','transaction_revision','audit_transaction','commit_financial_operation','capture_opening_balance','audit_opening_balance','guard_balance_edit','finance_amount','validate_workflow_entry','commit_financial_operation_base','finance_shift_date','protect_balance_history') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',obj.signature);
 end loop;
 for obj in select distinct s.oid::regclass signature from pg_class s join pg_depend d on d.objid=s.oid and d.classid='pg_class'::regclass join pg_class t on t.oid=d.refobjid join pg_namespace n on n.oid=t.relnamespace where s.relkind='S' and n.nspname='public' and t.relname in ('profiles','accounts','categories','transactions','budgets','recurring_transactions','wallets','financial_audit','financial_requests','retro_plans','ledger_account_balances','ledger_wallet_balances','import_batches','installment_plans','installment_items','installment_payments','receivables','receivable_collections','balance_reconciliations','workflow_transactions','finance_report_rows','receivable_balances','installment_balances') and d.refclassid='pg_class'::regclass and d.deptype in ('a','i') loop
  execute format('revoke all on sequence %s from public,anon,authenticated,service_role',obj.signature);
 end loop;
end $acl$;
alter policy "Users can update own profile" on public.profiles with check(auth.uid()=id);
alter policy "Users can manage own accounts" on public.accounts with check(auth.uid()=user_id);
alter policy "Users can manage own categories" on public.categories with check(auth.uid()=user_id);
alter policy "Users can manage own wallets" on public.wallets with check(auth.uid()=user_id);
alter policy "Users can manage own budgets" on public.budgets with check(auth.uid()=user_id);
alter policy "Users can manage own recurring transactions" on public.recurring_transactions with check(auth.uid()=user_id);
grant usage on schema public to authenticated;
grant select on public.profiles, public.accounts, public.categories, public.transactions, public.budgets, public.recurring_transactions, public.wallets, public.financial_audit, public.financial_requests, public.retro_plans, public.ledger_account_balances, public.ledger_wallet_balances, public.import_batches, public.installment_plans, public.installment_items, public.installment_payments, public.receivables, public.receivable_collections, public.balance_reconciliations, public.workflow_transactions, public.finance_report_rows, public.receivable_balances, public.installment_balances to authenticated;
grant insert,update on public.profiles to authenticated;
grant insert,update,delete on public.categories,public.budgets,public.recurring_transactions,public.retro_plans,public.accounts,public.wallets to authenticated;
grant execute on function public.commit_financial_operation(uuid,jsonb) to authenticated;
commit;
