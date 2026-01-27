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
