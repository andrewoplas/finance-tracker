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
