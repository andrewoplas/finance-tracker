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
